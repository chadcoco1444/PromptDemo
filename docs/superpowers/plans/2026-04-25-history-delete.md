# History Job Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to delete any job from the History page with a full credit refund for in-flight cancellations.

**Architecture:** Web-only (no changes to `apps/api`). `DELETE /api/jobs/[jobId]` runs a single Postgres transaction: optional credit refund + orphan children + hard delete. `HistoryCard` owns the DELETE fetch + inline confirmation UI; calls `onDelete(jobId)` only on success. `HistoryGrid` removes the card from local state on that callback.

**Tech Stack:** Next.js 14 Route Handler, PostgreSQL transaction via `pg` pool client, React `useState`, Vitest + @testing-library/react.

---

## File Map

| Action | Path |
|---|---|
| Create | `apps/web/src/app/api/jobs/[jobId]/route.ts` |
| Create | `apps/web/tests/api/jobDelete.test.ts` |
| Modify | `apps/web/src/components/history/HistoryCard.tsx` |
| Modify | `apps/web/tests/components/history/HistoryCard.test.tsx` |
| Modify | `apps/web/src/components/HistoryGrid.tsx` |
| Modify | `apps/web/tests/components/HistoryGrid.test.tsx` |

---

### Task 1: DELETE /api/jobs/[jobId] route

**Files:**
- Create: `apps/web/src/app/api/jobs/[jobId]/route.ts`
- Create: `apps/web/tests/api/jobDelete.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/api/jobDelete.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockClient = { query: mockQuery, release: mockRelease };

vi.mock('../../src/lib/pg', () => ({
  getPool: () => ({ connect: vi.fn().mockResolvedValue(mockClient) }),
}));

vi.mock('../../src/auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { DELETE } from '../../src/app/api/jobs/[jobId]/route';
import { auth } from '../../src/auth';

describe('DELETE /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when job not found or not owned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT (not found)
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await DELETE(new Request('http://localhost/api/jobs/xyz', { method: 'DELETE' }), { params: { jobId: 'xyz' } });
    expect(res.status).toBe(404);
  });

  it('deletes a done job without touching credits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'done', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(204);
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('UPDATE credits'))).toBe(false);
  });

  it('refunds credits and deletes an in-flight job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'generating', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 100 }] }); // UPDATE credits RETURNING balance
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT credit_transactions
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(204);
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('UPDATE credits'))).toBe(true);
    expect(queries.some((q) => q.includes('credit_transactions'))).toBe(true);
  });

  it('orphans child jobs before deleting parent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'done', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('parent_job_id = NULL'))).toBe(true);
  });

  it('returns 500 and rolls back on DB error', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockRejectedValueOnce(new Error('db down')); // SELECT throws
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/web && npx vitest run tests/api/jobDelete.test.ts --reporter=verbose
```

Expected: `Cannot find module '../../src/app/api/jobs/[jobId]/route'`

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/jobs/[jobId]/route.ts`:

```typescript
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = new Set(['queued', 'crawling', 'generating', 'waiting_render_slot', 'rendering']);

export async function DELETE(_req: Request, ctx: { params: { jobId: string } }) {
  if (!isAuthEnabled() || !auth) return new Response(null, { status: 404 });

  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return new Response(null, { status: 404 });

  const { jobId } = ctx.params;
  if (!jobId || jobId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return new Response(null, { status: 404 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT status, (input->>'duration')::int AS duration
       FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, Number(userId)],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return new Response(null, { status: 404 });
    }

    const { status, duration } = rows[0] as { status: string; duration: number };

    if (IN_FLIGHT.has(status)) {
      const refund = await client.query(
        `UPDATE credits SET balance = balance + $1 WHERE user_id = $2 RETURNING balance`,
        [duration, Number(userId)],
      );
      const balanceAfter = (refund.rows[0] as { balance: number })?.balance ?? 0;
      await client.query(
        `INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
         VALUES ($1, $2, $3, 'refund', $4)`,
        [Number(userId), jobId, duration, balanceAfter],
      );
    }

    await client.query(
      `UPDATE jobs SET parent_job_id = NULL WHERE parent_job_id = $1`,
      [jobId],
    );
    await client.query(
      `DELETE FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, Number(userId)],
    );
    await client.query('COMMIT');
    return new Response(null, { status: 204 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[api/jobs/delete]', (err as Error).message);
    return new Response(JSON.stringify({ error: 'delete_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/web && npx vitest run tests/api/jobDelete.test.ts --reporter=verbose
```

Expected: `6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/jobs/[jobId]/route.ts apps/web/tests/api/jobDelete.test.ts
git commit -m "feat(history): DELETE /api/jobs/[jobId] — delete + refund in one transaction"
```

---

### Task 2: HistoryCard delete UI

**Files:**
- Modify: `apps/web/src/components/history/HistoryCard.tsx`
- Modify: `apps/web/tests/components/history/HistoryCard.test.tsx`

- [ ] **Step 1: Write failing tests**

First, update the existing imports at the top of `apps/web/tests/components/history/HistoryCard.test.tsx`:

```typescript
// Change this line:
import { describe, it, expect, vi } from 'vitest';
// To:
import { describe, it, expect, vi, afterEach } from 'vitest';

// Change this line:
import { render, screen } from '@testing-library/react';
// To:
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

Then add these tests to the bottom of the file (after the existing `describe` block):

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('HistoryCard — delete', () => {
  it('renders a delete button on every job regardless of status', () => {
    render(<HistoryCard job={baseJob} tier="pro" onDelete={vi.fn()} />);
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('shows confirmation row for a done job when delete clicked', () => {
    render(<HistoryCard job={baseJob} tier="pro" onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/此操作無法復原/i)).toBeInTheDocument();
  });

  it('shows in-flight confirmation copy for a generating job', () => {
    const inFlightJob = { ...baseJob, status: 'generating', videoUrl: null };
    render(<HistoryCard job={inFlightJob} tier="pro" onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/取消並退還/i)).toBeInTheDocument();
  });

  it('restores idle state when cancel is clicked', () => {
    render(<HistoryCard job={baseJob} tier="pro" onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText(/此操作無法復原/i)).toBeNull();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('calls onDelete with jobId after successful API response', async () => {
    const onDelete = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as typeof fetch;
    render(<HistoryCard job={baseJob} tier="pro" onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('abc'));
  });

  it('shows error text and does not call onDelete when API fails', async () => {
    const onDelete = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as typeof fetch;
    render(<HistoryCard job={baseJob} tier="pro" onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));
    await waitFor(() => expect(screen.getByText(/刪除失敗/i)).toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/web && npx vitest run tests/components/history/HistoryCard.test.tsx --reporter=verbose
```

Expected: new `HistoryCard — delete` tests fail, existing tests still pass.

- [ ] **Step 3: Implement delete UI in HistoryCard**

Replace the full contents of `apps/web/src/components/history/HistoryCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { hostnameOf } from '../../lib/url-utils';
import { LineageBadge, type ParentInfo } from './LineageBadge';
import type { Tier } from '../../lib/tier';

export interface HistoryJob {
  jobId: string;
  parentJobId: string | null;
  status: string;
  stage: string | null;
  input: { url: string; intent: string; duration: 10 | 30 | 60 };
  videoUrl: string | null;
  thumbUrl: string | null;
  coverUrl: string | null;
  createdAt: number;
  parent: ParentInfo | null;
}

type DisplayStatus = 'generating' | 'done' | 'failed';

function bucketStatus(raw: string): DisplayStatus {
  if (raw === 'done') return 'done';
  if (raw === 'failed') return 'failed';
  return 'generating';
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  generating: 'Generating',
  done: 'Done',
  failed: 'Failed',
};

const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  generating: 'bg-amber-50/10 text-amber-300 ring-1 ring-amber-500/30',
  done: 'bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/30',
  failed: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const IN_FLIGHT_STATUSES = new Set(['queued', 'crawling', 'generating', 'waiting_render_slot', 'rendering']);

export function HistoryCard({
  job,
  tier,
  onDelete,
}: {
  job: HistoryJob;
  tier: Tier;
  onDelete?: (jobId: string) => void;
}) {
  const display = bucketStatus(job.status);
  const isDone = display === 'done';
  const isInFlight = IN_FLIGHT_STATUSES.has(job.status);

  const [deleteState, setDeleteState] = useState<'idle' | 'confirming' | 'deleting'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteState('deleting');
    setDeleteError(null);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDelete?.(job.jobId);
    } catch {
      setDeleteState('idle');
      setDeleteError('刪除失敗，請再試一次。');
    }
  };

  return (
    <div
      className={
        'group rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md overflow-hidden ' +
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:ring-violet-500/40 ' +
        'hover:shadow-2xl hover:shadow-violet-500/20 motion-reduce:hover:translate-y-0 motion-reduce:transition-none'
      }
    >
      {/* Clickable area — navigates to job detail */}
      <Link
        href={`/jobs/${job.jobId}`}
        className="block p-4 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video rounded-lg bg-gray-800/50 overflow-hidden flex items-center justify-center ring-1 ring-white/5">
          {job.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.coverUrl}
              alt=""
              className={
                'w-full h-full object-cover transition-opacity ' +
                (display === 'generating' ? 'opacity-70' : '')
              }
            />
          ) : (
            <span className="text-xs font-mono uppercase text-gray-500">{STATUS_LABEL[display]}</span>
          )}
          {display === 'generating' && job.coverUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="text-[11px] uppercase tracking-wider text-white px-2 py-1 rounded bg-black/50 backdrop-blur-sm animate-pulse">
                Generating
              </span>
            </div>
          ) : null}
        </div>

        {/* Meta */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-100 truncate">
            {hostnameOf(job.input.url)}
          </div>
          <div className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {job.input.intent}
          </div>
          {job.parent ? (
            <div className="pt-1">
              <LineageBadge parent={job.parent} currentUrl={job.input.url} />
            </div>
          ) : null}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>
            {job.input.duration}s · {relativeTime(job.createdAt)}
          </span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE_CLASS[display]}`}>
            {STATUS_LABEL[display]}
          </span>
        </div>
      </Link>

      {/* Action row — download + fork for done jobs */}
      {isDone && (
        <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-3">
          <a
            href={`/api/jobs/${job.jobId}/download?type=mp4`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download MP4"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ MP4
          </a>
          <a
            href={`/api/jobs/${job.jobId}/download?type=storyboard`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download Storyboard JSON"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ JSON
          </a>
          <Link
            href={`/create?forkId=${job.jobId}`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:text-brand-200 transition-colors"
            title="Fork & Edit"
            onClick={(e) => e.stopPropagation()}
          >
            ⑂ Fork
          </Link>
        </div>
      )}

      {/* Watermark upgrade hint — free tier + done */}
      {isDone && tier === 'free' && (
        <div className="px-4 pb-3">
          <Link
            href="/billing"
            className="flex items-center gap-2 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span>⚡</span>
            <span>Upgrade to Pro to remove the watermark</span>
          </Link>
        </div>
      )}

      {/* Delete row — always visible */}
      <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
        {deleteState === 'idle' && (
          <button
            type="button"
            title="Delete"
            onClick={() => { setDeleteState('confirming'); setDeleteError(null); }}
            className="text-[11px] text-gray-600 hover:text-red-400 transition-colors"
          >
            ✕ Delete
          </button>
        )}

        {deleteState === 'confirming' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400">
              {isInFlight
                ? `取消並退還 ${job.input.duration}s credits？`
                : '此操作無法復原。'}
            </span>
            <button
              type="button"
              onClick={() => setDeleteState('idle')}
              className="text-[11px] px-2 py-0.5 rounded ring-1 ring-white/10 text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 ring-1 ring-red-500/30 text-red-300 hover:bg-red-500/30 transition-colors"
            >
              {isInFlight ? '取消任務' : '刪除'}
            </button>
          </div>
        )}

        {deleteState === 'deleting' && (
          <span className="text-[11px] text-gray-500">刪除中…</span>
        )}

        {deleteError && (
          <span className="text-[11px] text-red-400">{deleteError}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/web && npx vitest run tests/components/history/HistoryCard.test.tsx --reporter=verbose
```

Expected: all tests pass (both existing and new delete tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/history/HistoryCard.tsx apps/web/tests/components/history/HistoryCard.test.tsx
git commit -m "feat(history): HistoryCard delete button — inline confirm, status-aware copy, error recovery"
```

---

### Task 3: HistoryGrid — wire handleDelete

**Files:**
- Modify: `apps/web/src/components/HistoryGrid.tsx`
- Modify: `apps/web/tests/components/HistoryGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

Add these tests to the bottom of `apps/web/tests/components/HistoryGrid.test.tsx` (after the existing `describe` block, keeping all existing tests intact):

```typescript
import { fireEvent, waitFor } from '@testing-library/react';

const jobFixture = {
  jobId: 'del-1',
  parentJobId: null,
  status: 'done',
  stage: 'render',
  input: { url: 'https://x.com', intent: 'show pricing', duration: 30 },
  videoUrl: 's3://b/v.mp4',
  thumbUrl: null,
  coverUrl: null,
  createdAt: Date.now(),
  parent: null,
};

describe('HistoryGrid — delete', () => {
  it('removes card from state when delete succeeds', async () => {
    mockFetchOnce([jobFixture], false);
    render(<HistoryGrid />);
    await waitFor(() => expect(screen.getByText('x.com')).toBeInTheDocument());

    // Now mock the DELETE call as success
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    ) as typeof fetch;

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));

    await waitFor(() => expect(screen.queryByText('x.com')).toBeNull());
  });

  it('keeps card in state when delete fails', async () => {
    mockFetchOnce([jobFixture], false);
    render(<HistoryGrid />);
    await waitFor(() => expect(screen.getByText('x.com')).toBeInTheDocument());

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 500 }),
    ) as typeof fetch;

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));

    // Card stays — error shown inside card, not removed from grid
    await waitFor(() => expect(screen.getByText(/刪除失敗/i)).toBeInTheDocument());
    expect(screen.getByText('x.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/web && npx vitest run tests/components/HistoryGrid.test.tsx --reporter=verbose
```

Expected: new `HistoryGrid — delete` tests fail (no `onDelete` prop wired yet), existing tests pass.

- [ ] **Step 3: Add handleDelete to HistoryGrid**

In `apps/web/src/components/HistoryGrid.tsx`, make two changes:

**a) Add `handleDelete` callback** — insert after the `onLoadMore` definition (around line 93):

```typescript
  const handleDelete = useCallback((jobId: string) => {
    setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.jobId !== jobId) }));
  }, []);
```

**b) Pass `onDelete` prop to each `<HistoryCard>`** — change line 176 from:

```typescript
              <HistoryCard job={j} tier={state.tier} />
```

to:

```typescript
              <HistoryCard job={j} tier={state.tier} onDelete={handleDelete} />
```

- [ ] **Step 4: Run full test suite to confirm everything passes**

```bash
cd apps/web && npx vitest run --reporter=verbose
```

Expected: all tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HistoryGrid.tsx apps/web/tests/components/HistoryGrid.test.tsx
git commit -m "feat(history): wire handleDelete in HistoryGrid — removes card from state on success"
```
