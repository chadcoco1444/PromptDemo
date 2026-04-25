# Design decisions

Interesting architectural calls, with the failure modes that drove them. Ordered roughly by blast radius (data model → pipeline → UX).

---

## Amendment A: progress stays in Redis

Early draft had the v2.0 `jobs` table in Postgres carrying a `progress SMALLINT` column updated on every worker heartbeat. Fine on paper; catastrophic in practice.

**The math**: render worker emits ~5 progress updates/sec (tied to Remotion's `onProgress` callback, fired roughly every 12-15 frames at 30fps). A 60-second video = 1800 frames = ~360 seconds of render time on a 2 vCPU Cloud Run instance = **~1800 progress writes per render**.

With 20 concurrent renders allowed via the global cap, that's **36k UPDATE statements per render batch**, all on the same hot row per job, touching the same index (`idx_jobs_status_updated`). Postgres would generate WAL traffic proportional to row size × updates, and the single-row contention would serialize behind a `FOR UPDATE` lock for every status-transition query.

**The split**: 
- Postgres `jobs` tracks only status + stage transitions (~5 writes/lifecycle).
- Redis `job:<id>` hash tracks `progress` + live state, 7-day TTL.
- SSE broker reads progress from Redis, pushes to clients.

Later if we ever want historical progress charts ("how long did crawl take on avg last week?"), rebuild from `credit_transactions.created_at` deltas plus stage transition timestamps in the `jobs` row. YAGNI for v2.0.

---

## Option C bilingual preset bodies

Feature 2's language toggle had 3 candidate designs:

- **Option A** (shipped first): UI labels bilingual, body always English. Claude gets English intent text; product is cleaner prompting pipeline. User sees Chinese labels but clicks a chip → textarea fills with English. **Rejected** after user feedback: "不是所見即所得 (not WYSIWYG)."
- **Option B**: UI bilingual, body bilingual, but the `[Preset: ...]` marker always in English so Claude anchors on English keywords. Compromise that kept half the quality guarantee.
- **Option C** (shipped final): Everything bilingual. Chinese intent → Claude → Chinese-accented storyboard. User owns the quality tradeoff explicitly.

**The quality tradeoff we accepted**: Anthropic's docs lean toward English being the strongest prompting language, but empirically Sonnet 4.6 on a structured JSON task with Chinese instructions produces storyboards indistinguishable from English-fed ones in 9 out of 10 cases (we A/B tested 50 URLs across both). The 10th case is usually a brand/tone drift, not a factual hallucination — and the extractive whitelist catches factual issues independently.

**Dedup is bilingual**: `applyPreset` checks if EITHER `body.en` OR `body.zh` is already in the textarea, so toggling language + re-clicking the same chip is idempotent. The textarea never accumulates two language versions of the same preset.

---

## The 7-layer Claude output defense

Every failure mode below was a real bug a user hit during E2E testing. Each one landed with a test pinning the exact malformed input.

1. **JSON with trailing prose** — Claude occasionally adds "Note: I included..." after the JSON object. Fixed by a balanced-brace extractor that walks the first `{...}` ignoring strings + escaped quotes.

2. **Malformed JSON inside the object** — trailing commas before `}`, unescaped `\n` in string literals, smart quotes. Fixed by a string-literal-aware repair pass: strip trailing commas, escape literal newlines/tabs/CR, replace smart quotes, all only outside strings.

3. **List-separator concatenation** — Claude joined 4 extracted phrases with `·` into a single scene text. The strict extractive check couldn't match the combined phrase against the source pool. Fixed by a 3-pass check: whole phrase → strong separators (`·`, `•`, `|`, space-padded `/` or `—`) → comma with leading-conjunction trim (`and `, `or `) + trailing punctuation strip.

4. **Integer stringification** — Claude occasionally emits `"sceneId": "1"` instead of `"sceneId": 1`. Fixed by swapping `z.number()` → `z.coerce.number()` on the 3 integer fields. Handles both shapes.

5. **NaN from `z.coerce.number()`** — fix #4 introduced a new failure: `z.coerce.number()` turns `null`/undefined/garbage strings into NaN, which `.int()` rejects with "Expected number, received nan". Fixed by normalizing `sceneId` to array index + 1 during enrichment *before* Zod runs — Claude's sceneId is advisory anyway (scenes[] is the authoritative ordering).

6. **Duration drift** — Claude's scene-duration math is imprecise across 7-10 scenes. Sum drifts 5-9% from target. Original 5% tolerance rejected too many; we pro-rate up to 10% and only retry above that. Visually imperceptible at 8% (uniform scene compression).

7. **Brand color extremes** — crawler's dominant-color sampler occasionally returns near-black or near-white for dark-themed or minimal sites. Either extreme collapses the gradient palette into a flat band. Fixed by a luminance guard: `lum < 0.18 || lum > 0.88` → fall back to a tasteful indigo.

**Why retry-with-feedback isn't the only answer**: Claude's retry loop (max 3 attempts) can't fix malformed JSON faster than a repair pass; we'd burn 3× the tokens and the user would wait 10+ extra seconds per attempt. Repair first, retry only when repair can't recover.

---

## Direct node spawn for Windows PID tracking

`pnpm lume start` originally spawned services via `spawn('cmd.exe', ['/c', 'pnpm', '--filter', svc, 'dev'])`. Problem: the chain is `cmd → pnpm.cmd → node`. `pnpm.cmd` is a batch file that spawns node then exits; `cmd.exe` reaps the dead `pnpm.cmd` and itself exits. **The PID we saved to `.tmp/demo/pids/<svc>.pid` died within 500ms**, while the actual worker `node.exe` kept running as an orphan process group.

Downstream symptoms:
- `demo status` reported DOWN (saved PID is dead → `isAlive(pid)` false) even though the service was serving requests.
- `demo stop` couldn't kill the real worker (we killed the already-dead `cmd.exe`). Workers accumulated as zombies.
- Restart cycles leaked port bindings until `EADDRINUSE`.

**Fix**: `scripts/lib/devCommand.mjs` resolves each service's entry at runtime:
- For `"dev": "tsx watch src/index.ts"` → spawn `node` with `require.resolve('tsx/dist/cli.mjs')` + `['watch', 'src/index.ts']`.
- For `"dev": "next dev -p 3001"` → spawn `node` with `require.resolve('next/dist/bin/next')` + `['dev', '-p', '3001']`.

The parent process we track IS the long-running node. `taskkill /T` propagates to Remotion's bundler children + Next.js's worker threads.

**Caveat**: `tsx/package.json` has an `exports` map that blocks direct subpath resolution. Workaround: resolve `tsx/package.json` and `path.join(dirname, 'dist/cli.mjs')` — `package.json` is always exported. Noted in the test that pins this behavior.

---

## Why `terminal hiding` is the known-hard followup

`spawn(node, args, { detached: true, windowsHide: true, shell: false })` successfully hides the node.exe console. But tsx's internal `child_process.spawn` for the watched script doesn't propagate `windowsHide`, and Next.js's bundler worker fork doesn't either. Every `pnpm lume start` on Windows pops 5 empty console windows for the grandchildren.

Options evaluated:
1. **VBScript wrapper** (`WScript.Shell.Run ..., 0, False`) — `vbHide` hides reliably but PID tracking gets ugly: VBS doesn't expose the child PID, so we'd have to scrape it from netstat or a sentinel file.
2. **PowerShell `Start-Process -WindowStyle Hidden`** — sets SW_HIDE but not CREATE_NO_WINDOW on descendants. We tried this earlier; grandchildren still leak.
3. **Windows Job Object with `JOB_OBJECT_LIMIT_UI_RESTRICTIONS` + `JOB_OBJECT_UILIMIT_DESKTOP`** — the *correct* fix. All descendants inherit the UI-restricted Job. Requires native FFI (`ffi-napi`) or a small companion EXE. Fragile across Windows versions.
4. **Accept the cosmetic flash** — the current state.

Chose 4 because: services work, stop is clean, status is accurate, PIDs are real. 5 empty terminals is visual noise, not a bug. Going deeper requires 2-4 hours of native-code work for a purely cosmetic win — queued behind feature work.

---

## `X-User-Id` as a trusted same-origin header

Fastify has no knowledge of NextAuth sessions. Two ways to handle auth in the API:

1. **Duplicate session handling in Fastify**: read the NextAuth session cookie, query the Postgres `sessions` table, pull the `userId`. Adds a DB roundtrip per API call + couples Fastify to NextAuth's exact session schema.
2. **Trusted header via same-origin proxy**: apps/web's `/api/jobs/create` route reads the session server-side (via `auth()`), extracts `userId`, forwards to Fastify with `X-User-Id: <id>` set. Fastify trusts the header blindly.

Chose #2 for the speed + decoupling. **The load-bearing invariant**: apps/api MUST NOT be reachable from anything outside the apps/web proxy. Local dev binds apps/api to `127.0.0.1:3000` — browsers can't reach it directly because same-origin policy blocks cross-port requests from a different Next.js port. Production deploy MUST put apps/api behind a gateway that strips client-supplied `X-User-Id` before forwarding.

Regression test (`apps/api/tests/postJob.test.ts`) pins that a client who tries to inject `crawlResultUri` in the request body is ignored — the API looks up the parent's URI server-side from its own store. This closes the related concern that a user could craft a malicious `parentJobId` + fake `crawlResultUri` payload.

---

## Why `applyPreset` precedence is dedup → fill-empty → append

Test-first design forced this ordering. The obvious pass (fill-empty → append) fails this case:

```ts
const withEn = applyPreset('', preset, 'en');                // fills with English body
const afterZhReclick = applyPreset(withEn, preset, 'zh');    // re-click same chip after locale toggle
// Expected: no change (user already has the preset text, just in English)
// Naive: appends zh body on top of en body → stuffed
```

Put dedup first and the pathological case becomes a no-op. The order matters because `applyPreset` is called on every click; the user may click the same chip twice by accident (rapid-fire dev habit), or toggle language and re-click (testing behavior). Either way the textarea should converge to "one copy of the preset, in the user's chosen language," not "n copies."

---

## What we punted

- **SSE live-intel per stage** — the StageRail shows progress bars but no token counts / frame counters / crawl URLs. That needs each worker to call `job.updateProgress({ pct, intel: {...} })`, the orchestrator to forward the richer payload, the web reducer to capture it, and the StageRail to render it. ~1.5 hours; punted because the current progress bar is functional.
- **Bento variant** — deferred to v2.1 per the original spec's cost/value read. Asymmetric grid + spring animations + icon hint rendering is a multi-day rabbit hole.
- **Per-tier S3 retention via lifecycle rules** — GCS `Object Lifecycle Management` with prefix-based rules (`tier/<free|pro|max>/...` → delete after 30/90/365 days). Configuration work, not code; done at deploy time.
- **History card thumbnails** — render worker needs to extract the first frame of the MP4 and upload as `<jobId>/thumb.jpg`. Remotion supports this via `renderStill`. Planned for v2.1.

---

<p align="center"><sub>
Principle throughout: catch the failure at the layer with the most context. JSON repair belongs in the parser, not in Claude's retry loop. Integer coercion belongs in the schema, not in a pre-validator. Variant selection belongs in the worker (deterministic), not in the prompt (LLM would drift).
</sub></p>
