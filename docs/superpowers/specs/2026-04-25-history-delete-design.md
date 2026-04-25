# History Job Delete Design

## Goal

Allow users to delete any job from the History page — whether done, failed, or in-flight — with a full credit refund for in-flight cancellations. Removes stuck jobs from the concurrency counter immediately.

## Architecture

Web-only (no changes to `apps/api`). `apps/web` has direct Postgres access via `getPool()`. Refund + orphan + delete are one atomic DB transaction. BullMQ workers that are still running for a deleted in-flight job will find the Redis job store entry (which expires via 7-day TTL) and continue to completion, but since the Postgres record is gone the result is silently discarded — acceptable loose coupling.

**Tech Stack:** Next.js 14 App Router Route Handler, PostgreSQL transaction, `getPool()` from `apps/web/src/lib/pg.ts`, React `useState` for inline confirmation.

---

## API: `DELETE /api/jobs/[jobId]`

**File:** `apps/web/src/app/api/jobs/[jobId]/route.ts`
(Same file as or alongside future GET; sits beside the existing `download/` and `cover/` sub-routes.)

### Steps (all in one `BEGIN / COMMIT` transaction)

1. Auth check → `401` if no session, `404` if `AUTH_ENABLED=false`
2. Ownership check:
   ```sql
   SELECT id, status, input->>'duration' AS duration
   FROM jobs
   WHERE id = $1 AND user_id = $2
   ```
   → `404` if not found (covers both "doesn't exist" and "not yours")
3. **If status is in-flight** (`queued`, `crawling`, `generating`, `waiting_render_slot`, `rendering`):
   - `refundSeconds = Number(duration)` (cost = duration per `calculateCost`)
   - Atomic credit refund:
     ```sql
     UPDATE credits
     SET balance = balance + $refundSeconds
     WHERE user_id = $userId
     RETURNING balance
     ```
   - Audit log:
     ```sql
     INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
     VALUES ($userId, $jobId, $refundSeconds, 'refund', $returnedBalance)
     ```
4. Orphan children (preserves their data, removes broken FK):
   ```sql
   UPDATE jobs SET parent_job_id = NULL WHERE parent_job_id = $jobId
   ```
5. Delete:
   ```sql
   DELETE FROM jobs WHERE id = $jobId AND user_id = $userId
   ```
6. Return `204 No Content`

### Error responses

| Condition | Status |
|---|---|
| Not signed in | 401 |
| AUTH_ENABLED=false | 404 |
| Job not found / not owned | 404 |
| DB error | 500 `{ error: 'delete_failed' }` |

---

## UI

### HistoryCard changes

**New prop:** `onDelete: (jobId: string) => Promise<void>`

**New local state:** `deleteState: 'idle' | 'confirming' | 'deleting'`

**Trash button:** Always visible (all statuses), placed at the end of the action row. Uses `onClick={(e) => e.stopPropagation()}` to prevent card navigation.

**Confirmation flow:**
- `idle` → click trash → `confirming`
- `confirming` → shows inline confirmation row replacing action buttons:
  - **Done/failed:** `"刪除此影片？此操作無法復原。"` + `[取消]` `[刪除]`
  - **In-flight:** `"影片處理中，取消並退還 {duration}s credits？"` + `[取消]` `[確認取消]`
- Confirm clicked → `deleting` (spinner on button)
  - `DELETE /api/jobs/{jobId}` via `fetch`
  - Success → `await onDelete(jobId)` (parent removes card)
  - Failure → back to `idle` + `window.__toastError?.('刪除失敗，請再試一次')` (or inline error text if no toast)
- Cancel → back to `idle`

**Status detection** for confirmation copy: derive from `job.status` — in-flight if status is one of `queued | crawling | generating | waiting_render_slot | rendering`. The `HistoryJob` type already carries `status`.

### HistoryGrid changes

**`handleDelete(jobId: string): Promise<void>`**

Optimistic-with-rollback pattern:
```
1. Snapshot current jobs: const snapshot = state.jobs
2. Optimistically remove: setState(s => ({ ...s, jobs: s.jobs.filter(j => j.jobId !== jobId) }))
3. await fetch DELETE
4. On success: done
5. On failure: setState(s => ({ ...s, jobs: snapshot })) + show error
```

Pass `onDelete={handleDelete}` down to each `<HistoryCard>`.

---

## Testing

### API route tests (`tests/api/jobs/[jobId]/delete.test.ts`)

1. Unauthenticated → 401
2. Job not found → 404
3. Job owned by different user → 404
4. Delete done job → 204, job removed from DB, no credit change
5. Delete failed job → 204, job removed from DB, no credit change
6. Delete in-flight job → 204, credits refunded by duration amount, audit log row inserted, job removed
7. Delete parent job that has children → 204, children's parent_job_id set to NULL
8. DB error during delete → 500

### Component tests

- `HistoryCard`: trash button always rendered; confirming state shows correct copy for done vs in-flight; deleting state shows spinner; on API failure card is not removed
- `HistoryGrid`: on `handleDelete` success card removed from state; on failure card restored to previous position

---

## Files

| Action | Path |
|---|---|
| Create | `apps/web/src/app/api/jobs/[jobId]/route.ts` |
| Modify | `apps/web/src/components/history/HistoryCard.tsx` |
| Modify | `apps/web/src/components/HistoryGrid.tsx` |
| Create | `tests/api/jobs/[jobId]/delete.test.ts` |
| Modify | `tests/components/history/HistoryCard.test.tsx` |
| Modify | `tests/components/HistoryGrid.test.tsx` |
