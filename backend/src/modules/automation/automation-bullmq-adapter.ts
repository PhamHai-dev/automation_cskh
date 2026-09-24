/**
 * Automation BullMQ Adapter — Enqueue / cancel delayed deliveries.
 *
 * Uses BullMQ delayed jobs for t+delay_minutes scheduling.
 * Degrades gracefully when Redis is unavailable (logs warning, marks delivery as QUEUED).
 */

import { Queue } from 'bullmq';
import { getRedisClient } from '../../shared/queue/redis-connection';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutomationQueue');

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (_queue) return _queue;
  const redis = getRedisClient();
  _queue = new Queue('automation-delivery', {
    connection: redis as any,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    },
  });
  _queue.on('error', (err: Error) => {
    log.error('Queue error', { message: err.message });
  });
  return _queue;
}

export interface EnqueuePayload {
  deliveryId: number;
  automationStepId: number;
  enrollmentId: number;
  attendanceId: number;
}

/**
 * Enqueue a delivery with BullMQ delayed job.
 * Returns the BullMQ jobId (stored on MessageDelivery.queue_job_id).
 */
export async function enqueueDelivery(
  payload: EnqueuePayload,
  delayMinutes: number,
): Promise<string | null> {
  const delayMs = Math.max(0, delayMinutes) * 60_000;
  try {
    const queue = getQueue();
    const jobId = `automation:delivery:${payload.deliveryId}`;
    const job = await queue.add('send', payload, {
      jobId,
      delay: delayMs,
    });
    log.info('Enqueued delivery', { deliveryId: payload.deliveryId, delayMs, jobId: job.id });
    return job.id ?? jobId;
  } catch (err: any) {
    log.error('Failed to enqueue delivery', {
      deliveryId: payload.deliveryId,
      message: err.message,
    });
    return null;
  }
}

/**
 * Cancel a pending delivery by removing its BullMQ job.
 */
export async function cancelDelivery(deliveryId: number, queueJobId?: string | null): Promise<void> {
  try {
    const queue = getQueue();
    const jobId = queueJobId ?? `automation:delivery:${deliveryId}`;
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      log.info('Cancelled BullMQ job', { deliveryId, jobId });
    }
  } catch (err: any) {
    log.warn('Failed to cancel delivery job', { deliveryId, message: err.message });
  }
}

/**
 * Gracefully close the queue connection.
 */
export async function closeAutomationQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
    log.info('Automation queue closed');
  }
}
