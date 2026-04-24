import { JobSchema, JobInputSchema, type Job, type JobInput } from './types';

export async function createJob(input: JobInput, apiBase: string): Promise<{ jobId: string }> {
  const parsed = JobInputSchema.parse(input);
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    // Prefer a human message if Fastify gave one; otherwise fall back to a
    // friendly per-status headline. Leaves raw JSON out of the user-facing
    // string — the form surfaces this message directly via the error card.
    if (res.status === 429) {
      throw new Error(
        body.message ??
        "Too many video requests — please wait a moment before trying again. If you just submitted one, it's already rendering.",
      );
    }
    if (res.status === 402) {
      throw new Error(
        body.message ??
        "You're out of render seconds this month. Upgrade your plan to keep creating videos.",
      );
    }
    if (res.status >= 500) {
      throw new Error(
        body.message ??
        "The server hit an unexpected error. Try again in a moment — if it keeps happening, your API service may need a restart.",
      );
    }
    throw new Error(body.message ?? body.error ?? `Request failed (HTTP ${res.status})`);
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
