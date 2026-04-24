import { JobSchema, JobInputSchema, type Job, type JobInput } from './types';

export async function createJob(
  input: JobInput,
  apiBase: string,
  /**
   * Routes through apps/web's /api/jobs/create proxy by default (same-origin).
   * The proxy adds X-User-Id when a session is active and forwards to apps/api.
   * Pass a non-same-origin `apiBase` to bypass the proxy (testing only —
   * apps/api wouldn't know the user).
   */
  options: { useProxy?: boolean } = {},
): Promise<{ jobId: string }> {
  const parsed = JobInputSchema.parse(input);
  const useProxy = options.useProxy ?? true;
  const url = useProxy ? '/api/jobs/create' : `${apiBase}/api/jobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include', // needed for the proxy to see auth cookies
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
