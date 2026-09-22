/**
 * group-scan-queue.ts — BullMQ queue + worker wiring for batch group scanning.
 * Ported from ZaloCRM group-scan-queue.ts (146 lines) → single-org, Int IDs.
 *
 * Self-contained: Redis connection created locally from REDIS_URL env.
 * BullMQ v5 requires: maxRetriesPerRequest=null, enableReadyCheck=false for worker.
 * Lazy-init: socket only opens when enqueue/worker first runs.
 *
 * Adaptations:
 *   - No _ee/automation/queues/queue-registry → standalone
 *   - No shared/redis-client → local Redis from REDIS_URL
 *   - logger from project shared/logger
 */
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '../../shared/logger/logger';
import { processGroupScan } from './group-scan-worker';

const log = createLogger('GroupScanQueue');

export const GROUP_SCAN_QUEUE = 'group-scan';

// Job opts — mirror _ee DEFAULT_JOB_OPTIONS conventions:
//   attempts 3, backoff exponential 10s, removeOnComplete/removeOnFail
const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export interface GroupScanJobData {
  scanId: number;
}

// ── Redis connection (BullMQ-tuned) ─────────────────────────────────────────
let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: null, // BullMQ v5 requirement
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    connection.on('error', (err: Error) => {
      log.error(`Redis error: ${err.message}`);
    });
    log.info('Redis connection created');
  }
  return connection;
}

// ── Queue singleton ──────────────────────────────────────────────────────────
let queueInstance: Queue<GroupScanJobData> | null = null;
function getQueue(): Queue<GroupScanJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<GroupScanJobData>(GROUP_SCAN_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      log.error(`Queue error: ${err.message}`);
    });
    log.info('Queue initialized');
  }
  return queueInstance;
}

/**
 * Enqueue 1 scan job. jobId = `gs-${scanId}` (deterministic) → re-enqueue cùng
 * scan không tạo job trùng (BullMQ dedup).
 */
export async function enqueueGroupScan(scanId: number): Promise<void> {
  const queue = getQueue();
  await queue.add('scan-groups', { scanId }, { jobId: `gs-${scanId}` });
  log.info(`Enqueued scanId=${scanId}`);
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
let workerInstance: Worker<GroupScanJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire the BullMQ Worker → processor. Gọi 1 lần lúc app start. */
export function startGroupScanWorker(): Worker<GroupScanJobData> {
  if (workerInstance) {
    log.warn('Worker already started');
    return workerInstance;
  }
  // Worker dùng connection RIÊNG — BullMQ worker chạy blocking command
  // (BRPOPLPUSH) độc chiếm socket → chia sẻ với Queue producer là anti-pattern.
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<GroupScanJobData>(
    GROUP_SCAN_QUEUE,
    (job: Job<GroupScanJobData>) => processGroupScan(job.data.scanId),
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 1: 1 nick quét tuần tự — group_read rate-limited per-nick
      concurrency: 1,
    },
  );
  workerInstance.on('completed', (job) => {
    log.info(`Worker completed scanId=${job.data.scanId}`);
  });
  workerInstance.on('failed', (job, err) => {
    log.error(
      `Worker failed scanId=${job?.data.scanId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    log.error(`Worker error: ${err.message}`);
  });
  log.info('Worker started');
  return workerInstance;
}

export async function stopGroupScanWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
