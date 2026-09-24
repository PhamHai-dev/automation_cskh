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

    // 4. Get Zalo API from pool
    const api = zaloPool.getApi(delivery.zalo_account_id);
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
        // Send to group
        const groupId = delivery.zalo_group?.zalo_group_id;
        if (!groupId) {
          throw new Error('Group ID missing');
        }
        const sent = await api.sendMessageToGroup?.(
          groupId,
          delivery.rendered_content,
          undefined,
          { msgType: 'text' },
        );
        providerMessageId = sent?.data?.messageId ?? sent?.messageId ?? null;
      } else {
        // Send to personal (need the friend's zalo_uid)
        // For personal sends we need to find the contact's zalo_uid via Friend table
        const zaloUid = await resolvePersonalTargetZaloUid(delivery);
        if (!zaloUid) {
          await prisma.messageDelivery.update({
            where: { id: deliveryId },
            data: { status: 'SKIPPED_NOT_FRIEND', error_message: 'No friend zalo_uid resolved' },
          });
          log.info('No friend UID resolved — skipping', { deliveryId });
          return;
        }
        const sent = await api.sendMessage?.(zaloUid, delivery.rendered_content, undefined, {
          msgType: 'text',
        });
        providerMessageId = sent?.data?.messageId ?? sent?.messageId ?? null;
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
 * Resolve the friend's zalo_uid for personal sends.
 * Looks in Friend table by student phone → friend.phone_from_sdk.
 */
async function resolvePersonalTargetZaloUid(delivery: any): Promise<string | null> {
  const phone = delivery.enrollment.student.phone;
  if (!phone) return null;

  // Try ZaloContactRelation first (has student_id linkage)
  const relation = await prisma.zaloContactRelation.findFirst({
    where: {
      student_id: delivery.enrollment.student_id,
      zalo_account_id: delivery.zalo_account_id,
      relation_status: 'FRIEND',
    },
    select: { id: true },
  });
  if (relation) {
    // Look up the friend's zalo_uid_in_nick in Friend table (phone match)
    const friend = await prisma.friend.findFirst({
      where: {
        zalo_account_id: delivery.zalo_account_id,
        phone_from_sdk: phone,
      },
      select: { zalo_uid_in_nick: true },
    });
    if (friend?.zalo_uid_in_nick) return friend.zalo_uid_in_nick;
  }

  // Fallback: direct phone match in Friend table
  const friend = await prisma.friend.findFirst({
    where: {
      zalo_account_id: delivery.zalo_account_id,
      phone_from_sdk: phone,
    },
    select: { zalo_uid_in_nick: true },
  });
  return friend?.zalo_uid_in_nick ?? null;
}

// ─── Worker singleton ────────────────────────────────────────────────

let _worker: Worker | null = null;

/**
 * Start the automation delivery worker.
 */
export function startAutomationWorker(): Worker {
  if (_worker) return _worker;

  const redis = getRedisClient();
  _worker = new Worker(
    'automation-delivery',
    async (job: Job<SendJobData>) => {
      await processDeliveryJob(job);
    },
    {
      connection: redis as any,
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
    await _worker.close();
    _worker = null;
    log.info('Automation worker stopped');
  }
}
