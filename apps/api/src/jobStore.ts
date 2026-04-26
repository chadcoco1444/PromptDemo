import type { Redis } from 'ioredis';
import { JobSchema, type Job, type JobStatus } from './model/job.js';

const TTL_SECONDS = 7 * 24 * 3600;

export interface JobStore {
  create(job: Job): Promise<void>;
  get(jobId: string): Promise<Job | null>;
  patch(
    jobId: string,
    patch: Partial<Job>,
    updatedAt: number,
    expectedStatus?: JobStatus,
  ): Promise<void>;
}

function key(jobId: string): string {
  return `job:${jobId}`;
}

export function makeJobStore(redis: Redis): JobStore {
  return {
    async create(job) {
      await redis.set(key(job.jobId), JSON.stringify(job), 'EX', TTL_SECONDS);
    },
    async get(jobId) {
      const raw = await redis.get(key(jobId));
      if (!raw) return null;
      const parsed = JobSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    },
    async patch(jobId, patch, updatedAt, _expectedStatus?) {
      const raw = await redis.get(key(jobId));
      if (!raw) throw new Error(`job not found: ${jobId}`);
      const current = JobSchema.parse(JSON.parse(raw));
      const merged = { ...current, ...patch, updatedAt };
      const parsed = JobSchema.parse(merged);
      await redis.set(key(jobId), JSON.stringify(parsed), 'KEEPTTL');
    },
  };
}
