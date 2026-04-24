import { JobSchema, JobInputSchema, type Job, type JobInput } from './types';

export async function createJob(input: JobInput, apiBase: string): Promise<{ jobId: string }> {
  const parsed = JobInputSchema.parse(input);
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`POST /api/jobs failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const json = (await res.json()) as { jobId: string };
  return json;
}

export async function getJob(jobId: string, apiBase: string): Promise<Job> {
  const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} failed: ${res.status}`);
  return JobSchema.parse(await res.json());
}

export function streamUrl(jobId: string, apiBase: string): string {
  return `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/stream`;
}
