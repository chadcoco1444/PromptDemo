# LumeSpec — Claude Code 開發規範 (CLAUDE.md)

## 專案概述

LumeSpec 是一個 AI 驅動的 Demo 影片生成平台。
輸入產品 URL → Playwright 爬蟲 → Claude 生成分鏡 → Remotion 渲染 → MP4 交付。

Monorepo 結構：
- `apps/api` — Fastify API、Orchestrator、Credit Gate、SSE
- `apps/web` — Next.js 15、BFF Proxy、History Vault
- `workers/crawler` — Playwright 爬蟲、Circuit Breaker
- `workers/storyboard` — Claude AI 分鏡生成、7 層防護
- `workers/render` — Remotion 渲染、MP4 壓製
- `packages/schema` — Zod Schema 唯一 Truth Source
- `packages/remotion` — React 影片引擎、7 種場景
- `db/` — PostgreSQL migrations

---

## 修改任何模組前的強制動作

**在任何模組下新增或修改程式碼前，必須先讀該模組的 `DESIGN.md`。**

| 模組 | 設計文件 |
|---|---|
| apps/api | [apps/api/DESIGN.md](apps/api/DESIGN.md) |
| apps/web | [apps/web/DESIGN.md](apps/web/DESIGN.md) |
| workers/crawler | [workers/crawler/DESIGN.md](workers/crawler/DESIGN.md) |
| workers/storyboard | [workers/storyboard/DESIGN.md](workers/storyboard/DESIGN.md) |
| workers/render | [workers/render/DESIGN.md](workers/render/DESIGN.md) |
| packages/schema | [packages/schema/DESIGN.md](packages/schema/DESIGN.md) |
| packages/remotion | [packages/remotion/DESIGN.md](packages/remotion/DESIGN.md) |
| db | [db/DESIGN.md](db/DESIGN.md) |

## 修改後的強制動作 — 同步 DESIGN.md

**動到下表任何路徑 → 必須在同一個 commit 系列裡更新對應的 `DESIGN.md`。**

由 pre-commit hook (`scripts/check-design-sync.mjs`) 機械化執行；漏更新會 block commit，必須加 `--no-verify` 才能繞過（並請寫清楚理由在 commit message）。

| 動到這裡 | 必須同步這份 DESIGN.md |
|---|---|
| `apps/api/src/{routes,cron,credits,orchestrator,auth,sse}/**` | `apps/api/DESIGN.md` |
| `apps/api/src/{jobStore*,queues,index,app}.ts` | `apps/api/DESIGN.md` |
| `apps/api/package.json` | `apps/api/DESIGN.md` |
| `apps/web/src/app/api/**` | `apps/web/DESIGN.md` |
| `apps/web/src/{auth.ts,middleware.ts,lib/internalToken.ts}` | `apps/web/DESIGN.md` |
| `apps/web/src/app/{layout,history,billing,create}/**` | `apps/web/DESIGN.md` |
| `apps/web/package.json` | `apps/web/DESIGN.md` |
| `workers/crawler/src/{index.ts,circuitBreaker.ts}` 或 `workers/crawler/package.json` | `workers/crawler/DESIGN.md` |
| `workers/storyboard/src/{index.ts,generator.ts,variantSelection.ts,mockMode.ts,anthropic/**,validation/**,prompts/**,claude/**}` 或 `workers/storyboard/package.json` | `workers/storyboard/DESIGN.md` |
| `workers/render/src/index.ts` 或 `workers/render/package.json` | `workers/render/DESIGN.md` |
| `packages/schema/src/**` | `packages/schema/DESIGN.md` |
| `packages/remotion/src/{scenes/**,compositions/**,primitives/**,animations/**,resolveScene.tsx,MainComposition.tsx,Root.tsx,fonts.ts,s3Resolver.ts}` 或 `packages/remotion/package.json` | `packages/remotion/DESIGN.md` |
| `db/migrations/**` | `db/DESIGN.md` |

**何時可以略過（用 `--no-verify` 並在 commit message 註記）：**
- 純內部 refactor、變數改名、log message 微調、test fixture 補強、typo 修正
- 純 UI 字面 / 樣式變更（不涉及前述路徑）
- 變更只在註解 / docstring 內

**順序建議：** 先改程式 → 跑完測試 → 再回頭改 DESIGN.md → 一起 commit。

> **為什麼用機械化檢查：** 我（AI 開發者）已經證實「光靠下次記得」會違反 30 分鐘前才剛寫進這份文件的規則（見 commit `2a9d8de`）。系統限制比自律可靠。

---

## 標準開發流程 (SOP)

### 新功能 / 新設計

```
/brainstorming → 設計文件 (docs/superpowers/specs/) →
/writing-plans → /subagent-driven-development → /finishing-a-development-branch
```

### Bug 修復

```
/systematic-debugging → 找出 root cause → 寫 failing test →
修正 → 確認全套測試通過 → commit
```

### 規則

- **任何新功能必須先走 `/brainstorming`**，禁止跳過直接實作
- **main 分支零破燈**（broken window policy）：發現任何測試失敗，必須立即修復才能繼續其他工作
- Plan 文件的 checkbox 不打勾，以程式碼和測試為完成依據

---

## 鐵律（絕對禁止）

### 資料流邊界

- Worker（crawler / storyboard / render）**禁止直連 PostgreSQL**
- 即時進度**禁止寫入 DB**，只存 Redis 並透過 SSE 廣播
- 瀏覽器**禁止直連 apps/api**，所有呼叫必須透過 apps/web BFF proxy

### 新增 Remotion 場景的正確順序

1. `packages/schema` — 定義 Zod Schema + 導出類型
2. `packages/remotion` — 實作 React 元件 + 加入 `resolveScene.tsx`
3. `workers/storyboard` — 在 prompt 加入場景描述與資料門控條件

### 信用點數

- 扣款必須使用 `SELECT … FOR UPDATE` 防止競爭條件
- 退款必須以新增 `credit_transactions` 記錄的方式進行（帳本不可變）

---

## 測試與品質指令

```bash
# 執行前提：PostgreSQL 容器必須先啟動（擇一）
docker compose -f docker-compose.dev.yaml up -d postgres   # 只啟動 PostgreSQL
# 或，若尚未啟動基礎設施：
pnpm infra:up                                               # 啟動 Postgres + Redis + MinIO

pnpm test          # 全套測試（449 tests across 69 files）
pnpm typecheck     # 全 monorepo TypeScript 檢查
pnpm a11y          # Lighthouse a11y 分數驗證（需 dev server 運行中）
```

### 特定模組測試

```bash
pnpm --filter @lumespec/worker-crawler test
pnpm --filter @lumespec/worker-storyboard test
pnpm --filter @lumespec/api test
```

---

## 回應語言與風格

- **用繁體中文回應**
- 程式碼、指令、檔案路徑使用英文
- 回應簡潔，不加過多說明性文字
- 程式碼預設不加註解（除非 WHY 非常不明顯）

---

## 常用開發指令

```bash
pnpm lume start          # 啟動所有服務（web + api + workers）
pnpm lume stop           # 乾淨關閉所有服務
pnpm lume status         # 確認哪些服務在運行
pnpm infra:up            # 啟動 Docker 基礎設施（Postgres + Redis + MinIO）
pnpm lume render:promo   # 重新渲染行銷示範影片
```
