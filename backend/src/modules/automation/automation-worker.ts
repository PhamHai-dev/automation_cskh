/**
 * Automation Worker — BullMQ worker that processes delayed deliveries.
 *
 * On job execution:
 *   1. Re-check invariants (delivery status, relation still FRIEND, account ACTIVE, group valid)
 *   2. Get Zalo API from zaloPool
 *   3. Send message
 *   4. Mark SENT/FAILED with provider_message_id
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../shared/queue/redis-connection';
import { zaloPool } from '../zalo/zalo-pool';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutomationWorker');

interface SendJobData {
  deliveryId: number;
  automationStepId: number;
  enrollmentId: number;
  attendanceId: number;
}

/**
 * Process a single delivery job.
 */
export async function processDeliveryJob(job: Job<SendJobData>): Promise<void> {
  const { deliveryId } = job.data;

  try {
    // 1. Load delivery with full context
    const delivery = await prisma.messageDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        automation_step: true,
        enrollment: {
          include: {
            student: { select: { id: true, full_name: true, phone: true } },
          },
        },
        zalo_account: {
          select: { id: true, status: true, zalo_uid: true, display_name: true },
        },
        zalo_group: {
          select: { id: true, zalo_group_id: true, name: true },
        },
        attendance: {
          include: {
            enrollment_class: true,
          },
        },
      },
    });

    if (!delivery) {
      log.warn('Delivery not found — skipping', { deliveryId });
      return;
    }

    // 2. Re-check invariant: delivery still SCHEDULED/QUEUED
    if (!['SCHEDULED', 'QUEUED'].includes(delivery.status)) {
      log.info('Delivery no longer pending — skipping', {
        deliveryId,
        status: delivery.status,
      });
      return;
    }

    // 3. Re-check invariants
    const { shouldSend, skipReason } = await checkInvariants(delivery);
    if (!shouldSend) {
      await prisma.messageDelivery.update({
        where: { id: deliveryId },
        data: { status: skipReason as any, error_message: 'Invariant check failed at send time' },
      });
      log.info('Delivery skipped by invariant check', { deliveryId, reason: skipReason });
      return;
    }

    // 4. Get Zalo API from pool (try reconnect if not connected)
    let api = zaloPool.getApi(delivery.zalo_account_id);
    if (!api) {
      // Attempt auto-reconnect before giving up
      const reconnected = await zaloPool.tryReconnect(delivery.zalo_account_id);
      if (reconnected) {
        api = zaloPool.getApi(delivery.zalo_account_id);
        log.info('Zalo account auto-reconnected before send', { deliveryId, zaloAccountId: delivery.zalo_account_id });
      }
    }
    if (!api) {
      await prisma.messageDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SKIPPED_ACCOUNT_INACTIVE',
          error_message: 'Zalo account not connected in pool',
        },
      });
      log.warn('Zalo account not connected — skipping', {
        deliveryId,
        zaloAccountId: delivery.zalo_account_id,
      });
      return;
    }

    // 5. Mark SENDING
    await prisma.messageDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SENDING' },
    });

    // 6. Send message
    try {
      let providerMessageId: string | null = null;

      if (delivery.zalo_group_id) {
        // Send to group — zca-js: sendMessage(content, threadId, threadType=1)
        const groupId = delivery.zalo_group?.zalo_group_id;
        if (!groupId) {
          throw new Error('Group ID missing');
        }
        const sent = await api.sendMessage(delivery.rendered_content, groupId, 1);
        providerMessageId = sent?.data?.messageId ?? sent?.msgId ?? sent?.messageId ?? null;
      } else {
        const zaloUid = await resolvePersonalTargetZaloUid(delivery);
        if (!zaloUid) {
          await prisma.messageDelivery.update({
            where: { id: deliveryId },
            data: { status: 'SKIPPED_NOT_FRIEND', error_message: 'No friend zalo_uid resolved' },
          });
          log.info('No friend UID resolved — skipping', { deliveryId });
          return;
        }
        // zca-js: sendMessage(content, threadId, threadType=0 for User)
        const sent = await api.sendMessage(delivery.rendered_content, zaloUid, 0);
        providerMessageId = sent?.data?.messageId ?? sent?.msgId ?? sent?.messageId ?? null;
      }

      // 7. Mark SENT
      await prisma.messageDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          provider_message_id: providerMessageId,
          error_message: null,
        },
      });

      log.info('Delivery sent', {
        deliveryId,
        zaloAccountId: delivery.zalo_account_id,
        groupId: delivery.zalo_group_id ?? null,
        providerMessageId,
      });
    } catch (sendErr: any) {
      // 8. Mark FAILED
      await prisma.messageDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          error_message: sendErr?.message ?? String(sendErr),
          retry_count: { increment: 1 },
        },
      });
      log.error('Send failed', { deliveryId, error: sendErr?.message ?? String(sendErr) });
      throw sendErr; // Let BullMQ retry (up to attempts config)
    }
  } catch (err: any) {
    log.error('processDeliveryJob error', { deliveryId, error: err.message });
    throw err;
  }
}

/**
 * Check all invariants before sending. Returns { shouldSend, skipReason }.
 */
async function checkInvariants(delivery: any): Promise<{ shouldSend: boolean; skipReason: string }> {
  // Account must be ACTIVE
  if (delivery.zalo_account.status !== 'ACTIVE') {
    return { shouldSend: false, skipReason: 'SKIPPED_ACCOUNT_INACTIVE' };
  }

  // Group channel: group must exist
  if (delivery.zalo_group_id && !delivery.zalo_group) {
    return { shouldSend: false, skipReason: 'SKIPPED_GROUP_INACTIVE' };
  }

  // Personal channel: relation must still be FRIEND
  if (!delivery.zalo_group_id) {
    const relation = await prisma.zaloContactRelation.findFirst({
      where: {
        student_id: delivery.enrollment.student_id,
        zalo_account_id: delivery.zalo_account_id,
        relation_status: 'FRIEND',
      },
    });
    if (!relation) {
      return { shouldSend: false, skipReason: 'SKIPPED_NOT_FRIEND' };
    }
  }

  return { shouldSend: true, skipReason: '' };
}

/**
 * Normalize phone to last 9 digits for matching.
 * Handles formats: 0988767563 → 988767563, 84988767563 → 988767563
 */
function normalizePhoneForMatch(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Strip leading country code (84 for Vietnam, 0 for local)
  if (digits.length >= 10 && digits.startsWith('84')) {
    return digits.slice(2); // 84988767563 → 988767563
  }
  if (digits.length >= 10 && digits.startsWith('0')) {
    return digits.slice(1); // 0988767563 → 988767563
  }
  return digits;
}

/**
 * Resolve the friend's zalo_uid for personal sends.
 * Looks in Friend table by student phone → friend.phone_from_sdk.
 * Uses suffix matching (last 9 digits) for cross-format compatibility.
 */
async function resolvePersonalTargetZaloUid(delivery: any): Promise<string | null> {
  // 1. Try friend_zalo_uid stored on ZaloContactRelation (fast path)
  const relation = await prisma.zaloContactRelation.findFirst({
    where: {
      student_id: delivery.enrollment.student_id,
      zalo_account_id: delivery.zalo_account_id,
      relation_status: 'FRIEND',
    },
    select: { id: true, friend_zalo_uid: true },
  });

  if (relation?.friend_zalo_uid) {
    log.debug('Resolved target UID from relation.friend_zalo_uid', {
      deliveryId: delivery.id,
      friendZaloUid: relation.friend_zalo_uid,
    });
    return relation.friend_zalo_uid;
  }

  // 2. Fallback: phone-based suffix matching (legacy)
  const phone = delivery.enrollment.student.phone;
  if (!phone) {
    log.warn('No phone and no friend_zalo_uid — cannot resolve', { deliveryId: delivery.id });
    return null;
  }

  const normalize = (p: string) => p.replace(/\D/g, '').slice(-9);
  const studentNorm = normalize(phone);
  if (studentNorm.length < 9) return null;

  const allFriends = await prisma.friend.findMany({
    where: {
      zalo_account_id: delivery.zalo_account_id,
      phone_from_sdk: { not: null },
    },
    select: { zalo_uid_in_nick: true, phone_from_sdk: true },
  });
  const fallback = allFriends.find((f) => {
    if (!f.phone_from_sdk) return false;
    return normalize(f.phone_from_sdk) === studentNorm;
  });

  if (fallback?.zalo_uid_in_nick) {
    log.info('Resolved target UID via phone fallback', {
      deliveryId: delivery.id,
      friendZaloUid: fallback.zalo_uid_in_nick,
    });
    // Backfill relation for future lookups
    if (relation) {
      prisma.zaloContactRelation.update({
        where: { id: relation.id },
        data: { friend_zalo_uid: fallback.zalo_uid_in_nick },
      }).catch(() => {});
    }
  }

  return fallback?.zalo_uid_in_nick ?? null;
}

// ─── Worker singleton ────────────────────────────────────────────────

let _worker: Worker | null = null;

/**
 * Start the automation delivery worker.
 */
export function startAutomationWorker(): Worker | null {
  if (_worker) return _worker;

  const redis = getRedisClient();
  if (!redis) {
    log.info('Automation worker skipped (Redis disabled or unavailable)');
    return null;
  }

  const bullMqConnection = (redis as any).duplicate({
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  _worker = new Worker(
    'automation-delivery',
    async (job: Job<SendJobData>) => {
      await processDeliveryJob(job);
    },
    {
      connection: bullMqConnection,
      concurrency: 5,
    },
  );

  _worker.on('completed', (job) => {
    log.info('Job completed', { jobId: job.id, deliveryId: job.data.deliveryId });
  });
  _worker.on('failed', (job, err) => {
    log.error('Job failed', {
      jobId: job?.id,
      deliveryId: job?.data?.deliveryId,
      error: err.message,
    });
  });
  _worker.on('error', (err) => {
    log.error('Worker error', { message: err.message });
  });

  log.info('Automation worker started');
  return _worker;
}

/**
 * Stop the worker (graceful shutdown).
 */
export async function stopAutomationWorker(): Promise<void> {
  if (_worker) {
    try {
      await _worker.close();
    } catch {
      // ignore
    }
    _worker = null;
    log.info('Automation worker stopped');
  }
}
