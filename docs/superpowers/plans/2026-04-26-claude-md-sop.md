# CLAUDE.md SOP 文件 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 repo 根目錄建立 `CLAUDE.md`，固化 LumeSpec 的開發 SOP（流程規範、鐵律、測試指令、語言偏好），讓每個 Claude Code session 自動載入規範，無需每次重新說明。

**Architecture:** 單一純文字 Markdown 檔案，放置於 repo 根目錄（Claude Code 自動讀取）。內容分為六區塊：專案概述、DESIGN.md 索引、標準開發流程、鐵律、測試指令、語言與風格偏好。無程式碼邏輯，無測試。

**Tech Stack:** Markdown, Git

---

## File Map

| 動作 | 路徑 |
|---|---|
| Create | `CLAUDE.md` |

---

### Task 1: 建立 CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: 建立檔案，寫入完整內容**

建立 `CLAUDE.md`（repo 根目錄），內容如下：

```markdown
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

---

## 標準開發流程 (SOP)

### 新功能 / 新設計

```
brainstorming → 設計文件 (docs/superpowers/specs/) →
writing-plans → subagent-driven-development → finishing-a-development-branch
```

### Bug 修復

```
systematic-debugging → 找出 root cause → 寫 failing test →
修正 → 確認全套測試通過 → commit
```

### 規則

- **任何新功能必須先走 brainstorming**，禁止跳過直接實作
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
# 執行前提：PostgreSQL 容器必須先啟動
docker compose -f docker-compose.dev.yaml up -d postgres

pnpm test          # 全套測試（354 tests）
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
```

- [ ] **Step 2: 確認檔案存在且格式正確**

```bash
head -5 CLAUDE.md
```

Expected output:
```
# LumeSpec — Claude Code 開發規範 (CLAUDE.md)

## 專案概述
```

- [ ] **Step 3: 確認 Claude Code 可讀取（檔案在 repo 根目錄）**

```bash
ls CLAUDE.md
```

Expected: `CLAUDE.md`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-04-26-claude-md-sop.md
git commit -m "docs(claude): add CLAUDE.md with project SOP and development rules"
```

Expected: commit 成功，2 files changed。
