# LumeSpec — 接手與運維手冊 (Handover & Operations Runbook)

> **目標讀者 (Audience):** 未來的你（休假回來接手），或是 AI agent (Claude / Codex / etc.) 接手專案。兩者需求一致：快速定位、找到對的深度文件、跑對的驗證指令。
>
> **這份文件 IS:** 一張地圖 + 一份 runbook。涵蓋架構導覽、文件索引、ops-level 驗證指令。
>
> **這份文件 IS NOT:** 80+ 既有文件的替代品（per-module DESIGN.md、specs、plans）。它只是指路 — 深度細節去看那些文件。
>
> **最後更新 (Last refresh):** 2026-04-28，Brand Color sprint Day 2 結束（5 個 bug shipped、完整 intent-spectrum verification）。

---

## 1. 這是什麼 (What This Is)

LumeSpec 是 **AI 驅動的 demo 影片生成器**。輸入產品 URL + intent（"hardsell" / "tech walkthrough" / "emotional brand story"），pipeline 會：爬蟲抓取網頁 → 請 Claude 生成 Remotion storyboard → 渲染 MP4。Monorepo 用 pnpm workspaces。

```mermaid
flowchart LR
    User([User]) --> Web[apps/web<br/>Next.js 14]
    Web --> API[apps/api<br/>Fastify]
    API -->|crawl queue| Crawler[workers/crawler<br/>Playwright]
    API -->|storyboard queue| SB[workers/storyboard<br/>Claude Sonnet]
    API -->|render queue| Render[workers/render<br/>Remotion]
    Crawler --> S3[(S3 / MinIO)]
    SB --> S3
    Render --> S3
    Crawler -.->|circuit state| Redis[(Redis<br/>BullMQ + Circuit)]
    API --> PG[(PostgreSQL<br/>jobs / credits)]
    API <--> Redis
    Render --> User
```

**核心鐵律 (Core Invariants)** — 由 `CLAUDE.md` 的 pre-commit hook 強制執行：
- Workers (crawler / storyboard / render) **絕不直連 PostgreSQL** — DB 寫入一律走 `apps/api` orchestrator
- 即時進度只存 Redis，**絕不寫入 DB** — 透過 SSE 廣播
- 瀏覽器**絕不直接呼叫 `apps/api`** — 一律透過 `apps/web` 的 BFF proxy
- 新增 Remotion scene type 必須照順序動 4 個地方：`packages/schema` → `packages/remotion/resolveScene.tsx` → `workers/storyboard/extractiveCheck.ts` → `workers/storyboard/systemPrompt.ts`（最後一個歷史上被忘記過、造成 2026-04-27 DeviceMockup prod incident）

---

## 2. 文件導覽 (Doc Navigation) — 「想知道 X、看 Y」

### Project-level（剛接手時先看這幾個）

| 想知道 | 看哪份文件 |
|---|---|
| 專案規則（commit 慣例、模組邊界、hook 行為） | [CLAUDE.md](../CLAUDE.md) |
| 對外 PR 文 + tech stack + roadmap | [README.md](../README.md) |
| **這份文件** — 接手手冊 + ops runbook | docs/HANDOVER.md（你正在看）|

### Per-module DESIGN.md（每個 worker / app / package 的深度架構）

| 模組 | DESIGN doc | 涵蓋範圍 |
|---|---|---|
| Fastify API + orchestrator | [apps/api/DESIGN.md](../apps/api/DESIGN.md) | Job 生命週期、credit gate、SSE、anti-pattern #9（fire-and-forget mirror failures）|
| Next.js web BFF | [apps/web/DESIGN.md](../apps/web/DESIGN.md) | NextAuth、BFF proxy、History Vault、internal token 簽發 |
| Crawler worker | [workers/crawler/DESIGN.md](../workers/crawler/DESIGN.md) | 3-track fallback (Playwright / ScreenshotOne / Cheerio)、circuit breaker、brand color 4-tier chain、region-pinning |
| Storyboard worker | [workers/storyboard/DESIGN.md](../workers/storyboard/DESIGN.md) | 7-layer Claude defense、extractive check（含 anti-pattern #7 assertNever exhaustiveness）、spend guard |
| Render worker | [workers/render/DESIGN.md](../workers/render/DESIGN.md) | Remotion CLI 呼叫、MP4 + WebP thumbnail、S3 上傳 |
| Remotion scenes | [packages/remotion/DESIGN.md](../packages/remotion/DESIGN.md) | 9 種 scene types、MainComposition、PromoComposition、視覺 regression |
| Zod schema (truth source) | [packages/schema/DESIGN.md](../packages/schema/DESIGN.md) | Storyboard / CrawlResult / VideoConfig types、normalizeText |
| PostgreSQL schema | [db/DESIGN.md](../db/DESIGN.md) | Tables、migrations、credit ledger 交易模式 |

### Specs 與 Plans（每個架構決策的完整 audit trail）

- `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` — 實作前批准過的設計 spec
- `docs/superpowers/plans/YYYY-MM-DD-{topic}.md` — 透過 subagent 流程執行過的 TDD 任務計畫
- `docs/superpowers/followups/` — 實作後的補充紀錄
- `docs/dev-notes/` — 經驗實驗（例如 intent-spectrum eval 報告）

要找特定 feature 的 spec / plan，按 topic 字眼 grep：
```bash
ls docs/superpowers/specs/ | grep -i circuit
```

### 運維文件 (Operational docs)

- [db/README.md](../db/README.md) — migration runbook、idempotency 規則、CI db:migrate 整合
- [deploy/DEPLOYMENT.md](../deploy/DEPLOYMENT.md) — GCP setup（目前 DEFERRED 2026-04-27、user 表態未來偏好換 Railway+Supabase）

---

## 3. Ops-Level 驗證手冊 (Verification Runbook)

這個 section 回答：**「我怎麼確認系統真的有在 work」** — 開發中跟（未來的）prod 都適用。

### 3.1 系統還活著嗎？快速健康檢查

**本地 dev 環境：**
```bash
pnpm lume status
```
預期看到：Postgres UP + 5 個 service UP（crawler / storyboard / render / api / web）+ service health checks 都通過。

**API healthz endpoint**（local + prod 都適用）：
```bash
curl -sf http://localhost:3000/healthz | jq
```
預期回傳形狀（自 2026-04-27 PG-Backfill ship 後）：
```json
{
  "ok": true,
  "pgBackfill": {
    "waiting": 0,
    "delayed": 0,
    "failed": 0
  }
}
```

**`pgBackfill.failed > 0`** = Redis→Postgres mirror reconciliation 重試耗盡。查 dlq log line：
```bash
grep "CRITICAL.*pg-backfill DLQ" .tmp/demo/logs/api.log
```

**`pgBackfill.delayed > 0`** = 短暫的 PG mirror 失敗、有排程在 retry，會自我修復。

### 3.2 單一 job 全程追蹤（用 jobId 串 log）

每個 worker log line 都包含**正在處理的 jobId**。要追一個 job 從頭到尾：
```bash
JOB_ID=zh87AWQRTc0PW1RveNiuW
grep -E "$JOB_ID" .tmp/demo/logs/{api,crawler,storyboard,render}.log
```

Crawler 還會每個 job 印一行**brand color tier 決策 log**：
```
[crawler] brand color tier=dom-sampling value=#171717 jobId=zh87AWQRTc0PW1RveNiuW
```

→ 詳見 §3.3。

### 3.3 Per-tier 觀察性 (brand color tier chain)

自 2026-04-28 (Bug #1 / #1.5 ship) 起，每個 crawl 都會印一行 log 紀錄是哪一 tier 產生 brand color：

```bash
grep "brand color tier" .tmp/demo/logs/crawler.log | tail -20
```

可能的 `tier=` 值：
- `dom-sampling` — Tier 0（DOM 取樣 buttons / headers / CTAs 的 background-color、含 soft-neutral preference）
- `meta-theme-color` — Tier 1（HTML `<meta name="theme-color">`）
- `logo-pixel-analysis` — Tier 2 主路徑（upstream 沒拿到時、Sharp `.stats().dominant` on logo）
- `logo-pixel-override` — Tier 2 翻盤路徑（Bug #1.5 — upstream 拿到中性、logo 拿到非中性 → 用 logo 的）
- `default-fallback` — Tier 3（`#1a1a1a`、所有 upstream tier 都沒拿到）

**分布分析**（未來「影片不像我們品牌」的 triage 訊號源）：
```bash
grep "brand color tier" .tmp/demo/logs/crawler.log | awk '{for(i=1;i<=NF;i++) if($i ~ /^tier=/) print $i}' | sort | uniq -c
```

如果 `default-fallback` 比例**爬到 ~20% 以上**，就是 `project_brand_color_vlm_tier4_backlog.md` memory 約定的「啟動 VLM Tier 4 brainstorm」門檻。

### 3.4 BullMQ 佇列檢查

5 個 queue（`crawl`、`storyboard`、`render`、`retention`、`pg-backfill`）。檢查任一個：

```bash
# 查 queue 深度，透過 Redis CLI
docker exec lumespec-redis-1 redis-cli LLEN bull:crawl:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:storyboard:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:render:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:pg-backfill:wait
```

`pg-backfill` 額外有 `/healthz` 端點曝露計數（見 §3.1）。

### 3.5 Circuit Breaker 狀態檢查（Redis）

Per-domain circuit breaker（在 workers/crawler）：
```bash
# 列出所有目前在追蹤的 domain
docker exec lumespec-redis-1 redis-cli --scan --pattern "circuit:*"
```

每個 `<domain>` 可能有的 keys：
- `circuit:<domain>:strikes` — 失敗計數器（10 分鐘窗口內 3 次失敗 → 觸發熔斷）
- `circuit:<domain>:open` — domain 在 30 分鐘冷卻中
- `circuit:<domain>:probe` — 另一個 worker 正在試探恢復（2 分鐘鎖）
- `circuit:<domain>:healthy` — 新鮮成功標記（1 分鐘 TTL）

**手動清掉卡死的 circuit**（例如 WAF 短暫抽風）：
```bash
docker exec lumespec-redis-1 redis-cli DEL circuit:gopro.com:open circuit:gopro.com:strikes circuit:gopro.com:probe
```

**手動打開 circuit**（測試 Bug #3 Sub C fallback path）：
```bash
docker exec lumespec-redis-1 redis-cli SET circuit:vercel.com:open 1 EX 600
# Submit 一個 vercel job、看 crawler log 確認它 fall through 到 cheerio
# Cleanup:
docker exec lumespec-redis-1 redis-cli DEL circuit:vercel.com:open
```

自 Bug #3 Sub C (commit `bee9c81`) 起，`evaluateCircuit()` 是在 `runPlaywright` lambda 內呼叫（**不是** worker handler 頂層）。Open circuit → 回 `{ kind: 'blocked', reason: 'CIRCUIT_OPEN' }` → `pickTrack` fall through 到 ScreenshotOne（如果 `CRAWLER_RESCUE_ENABLED=true`）→ cheerio。**Job 不再因為 circuit open 而死。**

### 3.6 Storyboard 品質回歸 (intent-spectrum-eval)

語意品質 regression 工具。跑 N URLs × M intents、第一時間從 S3 抓 storyboard.json（跳過 render 省成本）、寫成 markdown matrix 報告。

**預設行為**（3 URLs × 3 intents = 9 jobs、~3-5 分鐘 wall time、~$1.50 Anthropic 費用）：
```bash
DOGFOOD_USER_ID=28 node scripts/intent-spectrum-eval.mjs
```

**過濾子集**（例如驗證 Bug #4 修復、只跑 hardsell intent）：
```bash
DOGFOOD_USER_ID=28 INCLUDE_CELLS=vercel:hardsell,burton:hardsell node scripts/intent-spectrum-eval.mjs
```

**URL 選單**（在 `scripts/intent-spectrum-eval.mjs:ALL_URLS`）：
- `vercel` — infra SaaS、極簡黑白 brand
- `duolingo` — 消費者學習 app
- `gopro` — 極限運動、**Cloudflare 阻擋**（仍卡 CIRCUIT_OPEN、需 Bug #3 Sub A/B SaaS fallback）
- `patagonia` — 戶外品牌、**IP-routed gateway**（回 6 行 splash page、需 L4 datacenter US proxy）
- `burton` — snowboard 品牌、Bug #2 完整驗證 target

報告寫到 `docs/dev-notes/intent-spectrum-{date}{-supplement-N}.md`。

**成本紀律**（`project_anthropic_credit_budget_signal.md`）：每個 storyboard call ~$0.10-0.18。9-cell 跑一次 ~$1.50。**不要加進 PR-level CI**；每週 cadence 或 ship 完架構性改動後跑 OK。

### 3.7 資料庫狀態檢查

某 user 的 credit balance + tier 快查：
```bash
node -e "
import('./apps/api/node_modules/pg/lib/index.js').then(async ({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: 'postgresql://lumespec:lumespec@localhost:5432/lumespec' });
  const r = await pool.query(\`
    SELECT u.id, u.email, c.balance, s.tier
    FROM users u
    LEFT JOIN credits c ON c.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.id
  \`);
  console.table(r.rows);
  await pool.end();
});
"
```

最近失敗的 jobs + error code：
```bash
node -e "
import('./apps/api/node_modules/pg/lib/index.js').then(async ({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: 'postgresql://lumespec:lumespec@localhost:5432/lumespec' });
  const r = await pool.query(\`
    SELECT id, status, stage, input->>'url' AS url, error->>'code' AS err
    FROM jobs WHERE status='failed' AND created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC LIMIT 10
  \`);
  console.table(r.rows);
  await pool.end();
});
"
```

Migration 狀態：
```bash
docker exec lumespec-postgres-1 psql -U lumespec -d lumespec -c "SELECT name, run_on FROM pgmigrations ORDER BY name;"
```

### 3.8 測試驗證

```bash
pnpm test          # 全 814 個測試跨 8 個 package
pnpm typecheck     # workspace 層級 typecheck（必跑 — 個別 package 跑會漏掉跨切的 Scene 加法）
```

**2026-04-27 學到的教訓**：workspace 層級 typecheck 在動到 discriminated union（例如 Scene types）後**必跑**。Per-package typecheck 漏抓 DeviceMockup-not-in-extractiveCheck → prod incident。CLAUDE.md「新增 Remotion 場景的正確順序」第 5 步強制執行這條。

### 3.9 Post-deploy 驗證（待 deploy 接好時）

當 prod deploy 接好（**目前還沒** — 見 `project_gcp_deploy_deferred.md` memory），驗證：
1. `curl -sf https://<api-public-url>/healthz` 回 ok
2. Submit 一個測試 job、看 worker log 是否有 `tier=` 行 + storyboard 生成成功
3. 看 `pg-backfill` queue 深度 — 應該是 0

要切 Railway/Supabase（user 表態的偏好），等優先排定後寫專屬 spec。

---

## 4. 當前狀態快照 — 2026-04-28

### 最近 ship（過去 3 天，按時間順序）

| 日期 | 功能 / 修復 | Commit 範圍 |
|---|---|---|
| 2026-04-26 | State machine correctness (R1) | various |
| 2026-04-26 | Spec 3 architecture boundary (R2 + R6 + R7) | various |
| 2026-04-27 | DeviceMockup hero opener scene（第 9 種 scene type）| 8bc82ed → 1a56bee |
| 2026-04-27 | PG Backfill eventual consistency（#2 phantom job blocker）| ca871ff → c3d37e3 |
| 2026-04-27 | Migration runner CI gate（#3 release blocker）| a7e7e84 → 31be45b |
| 2026-04-27 | DeviceMockup P0 hot-fix（collectSceneTexts 漏 case）| 1a185ba |
| 2026-04-27 | PromoComposition 視覺 regression smoke | 73f6998 |
| 2026-04-27 | normalizeText smart-quote folding（intent-spectrum-eval Bug #4）| 39ca103 |
| 2026-04-28 | Brand color 4-tier chain（Bug #1 + Bug #1.5 follow-up）| 7a215f9 → 9cfcdc5 |
| 2026-04-28 | US-pinned BrowserContext（Bug #2）| 07d65a0 |
| 2026-04-28 | Extractive check substring fast-path（hardsell flake fix）| c8a183b |
| 2026-04-28 | Circuit gate 搬進 runPlaywright lambda（Bug #3 Sub C）| bee9c81 |

測試數從 ~700 → 814。

### Backlog — 真實還開的項目

| 項目 | 狀態 | 卡關原因 |
|---|---|---|
| Bug #3 Sub A/B（anti-bot vendor）| OPEN | USER $ 預算決策（ScreenshotOne SaaS / datacenter proxy / residential proxy）|
| L4 datacenter US proxy（給 Patagonia 類 IP-routed 網站）| OPEN | 跟 Sub A/B 同 vendor / budget bucket |
| VLM Tier 4（brand color VLM-on-screenshot 升級）| OPEN | Empirical trigger：prod log >20% `tier=default-fallback` rate。沒真實流量前無從衡量 |
| Cross-service correlation log（workers 上 pino + jobId child logger）| DEFERRED 2026-04-27 | 自己 defer 為 YAGNI。現有 `[worker] ... jobId=X` console pattern 暫時夠用 |
| NextAuth 5.0.0-beta.31 → stable | BLOCKED | 上游 — beta.31 仍是 npm 最新版、stable 沒釋出 |
| GCP deploy infra | DEFERRED 2026-04-27 | User 判斷現有 GCP deploy.yaml 對 pre-prod 階段過度設計、未來改 Railway + Supabase |

### 已知未解 case（**不是** blocker — 是經驗發現）

- **GoPro 等 Cloudflare 保護 brand** → 永久 CIRCUIT_OPEN。Bug #3 Sub C 已解封架構；需 Sub A/B 接 vendor 才能 useful
- **Patagonia 等 IP-routed ecommerce** → CDN edge IP geo-routing bypass 我們的 L1+L2 修復。需 L4 proxy
- **Duolingo「真實 brand color」抽取** → wordmark IS 黑、綠只在 mascot/CTAs。3 個傳統 source 層（DOM / meta / logo）都合法回 neutral。VLM Tier 4 才能解

### Memory 系統（給 AI agent 用）

Agent 的持久化 memory 在 `C:\Users\88698\.claude\projects\c--Users-88698-Desktop-Workspace-LumeSpec\memory\`。索引在 `MEMORY.md`。當前狀態相關的關鍵 file：

- `project_intent_spectrum_eval_2026_04_27.md` — 原始 4-bug 發現報告 + Day 2 closure
- `project_brand_color_vlm_tier4_backlog.md` — VLM 觸發條件
- `project_l4_datacenter_proxy_backlog.md` — Bug #2-hard + Bug #3 vendor 決策合併 backlog
- `project_anthropic_credit_budget_signal.md` — 運維成本提醒
- `feedback_workspace_typecheck.md` — DeviceMockup incident 學到的教訓
- `feedback_strict_commit_message_compliance.md` — plan 給 exact HEREDOC 時、dispatcher 必須強制嚴格遵守
- `feedback_checklist_reflex_pushback.md` — 當 user 下的指令跟自己最近的決定矛盾時、要先指出再執行

### Common Gotchas（踩過的坑、入冊）

1. **Anthropic credit balance** 在密集 verification 期間會意外耗盡。2026-04-28 撞到。重啟 sustained eval 前先儲值。
2. **Worker code 改完必須跑 `pnpm lume stop && pnpm lume start`** — workers 快取編譯後的 JS、restart 才會吃新 code。
3. **Workspace 層級 `pnpm typecheck` 必跑** — 跨切改動（Scene unions、被多個 package 消費的 discriminated unions）。
4. **DESIGN.md sync hook** 在動到特定路徑時觸發 — 看 `scripts/check-design-sync.mjs`。bypass 用 `--no-verify` 只在「真的純內部改動」時、commit body 寫清楚 bypass 理由。
5. **dev `DOGFOOD_USER_ID` 預設 1** 但 DB 只有 user 28（chadcoco1444@gmail.com）。跑 script 時 override env。
6. **`pickTrack` 是 fallback chain，不是 merge。** 不要把跨切邏輯（例如 theme-color 抽取）放進個別 track 檔案 — 放進 orchestrator。`workers/crawler/DESIGN.md` anti-pattern #6 紀錄這個 dead-code 陷阱。
7. **同一 domain 多個 job 必須序列 submit**（intent-spectrum-eval script 已實作） — 同 domain 並行 submit 會在任何一個完成前觸發 circuit breaker。

---

## 5. 下個合理 Sprint（時機到時）

User 回來規劃下個 sprint 時，按 ROI 順序的自然優先：

1. **Bug #3 Sub A/B vendor 決策** — 帶具體 cost projection + 樣本成功率（ScreenshotOne / BrightData / etc.）。架構已就緒（Sub C 完成）；這是純商業決策。動作：brainstorm 出 2-3 個 vendor option + $/mo + 預估覆蓋率，讓 user 選。

2. **首次 Railway + Supabase deploy 嘗試** — User 表態的 prod 偏好。架構比 GCP path 簡單；應該幾乎不需要新 code（現有 `apps/api` 應可直接用、只需 adapter 接 Supabase Postgres connection）。預估：1 天 brainstorm + 1 天實作。

3. **新 product feature** — User 在 Day 1 明確表態，backlog 清乾淨後想 focus user-facing feature。現在正是時機。README roadmap 候選：Scheduled re-renders / Custom brand kit / 9:16 vertical / Team workspaces / Webhook trigger。

「繼續修 bug」的本能要忍住至少一個 sprint — 目前 bug-discovery rate 偏高是因為剛跑完深度 eval。真實 prod traffic + user feedback 會浮出**不同**、值得**優先**處理的 bug、**比目前推測的更值得做**。

---

## 維護這份文件 (How to maintain)

- **Major 架構改動 ship 後 refresh** — 加一行到 §4 的「最近 ship」表；移動 backlog 項目時更新 §4。
- **不要膨脹** — 任一 section 超過 ~50 行時、抽出到專屬 doc 並 link 回來。
- **80+ 深度文件才是 truth source** — 這份文件是索引。猶豫時 link 過去而不是 copy 內容。
