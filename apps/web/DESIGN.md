# apps/web — Design Document

> **[AI 開發人員強制指令 / AI Dev Directive]**
> 當你在這個模組下新增任何檔案或修改任何程式邏輯前，你 **必須 (MUST)** 先重新檢視本 `DESIGN.md`。若你的實作方案與本文件的架構規範、職責邊界或設計模式產生衝突，你必須修正你的實作方案以符合設計規範；若你認為必須打破規範，你必須在輸出程式碼前，明確向 User 提出警告並說明原因。

---

## 系統定位 (System Position)

`apps/web` 是使用者唯一的接觸面。它扮演兩個角色：**使用者介面**（Next.js App Router 頁面）與 **BFF（Backend-For-Frontend）代理**（`/api/` 路由以內部 JWT 將請求轉發至 `apps/api`）。瀏覽器**永遠不**直接與 `apps/api` 通訊。

PostgreSQL 連線僅留給 NextAuth 的 session 表與少量 web-only 路由（cover redirect、download 簽章、API key 管理、billing 顯示）；**業務資料（jobs、credits、subscriptions）的查詢一律走 apps/api**。

```mermaid
graph LR
    Browser([Browser])
    Web["apps/web\n(Next.js 15)"]
    Auth["NextAuth v5\n(Google OAuth)"]
    API["apps/api\n(Fastify)"]
    DB[(PostgreSQL\nsessions only)]
    S3[(S3 / MinIO\ncover / download)]

    Browser -- "HTTPS / SSE" --> Web
    Web -- "NextAuth session" --> DB
    Web -- "OAuth flow" --> Auth
    Auth -- "session write" --> DB
    Web -- "internal JWT\n(signInternalToken)" --> API
    API -- "SSE events" --> Web
    Web -- "cover / download" --> S3

    style Web fill:#7c3aed,color:#fff,stroke:#5b21b6
```

**此模組是唯一允許：**
- 讀取 `next-auth` session 並用 `signInternalToken(userId)` 鑄造內部 JWT 的服務
- 直接渲染給瀏覽器的 React Server Component

---

## 模組職責 (Responsibilities)

- **BFF JWT Proxy** — `src/app/api/users/me/{jobs,credits}` 路由驗證 session → 用 `signInternalToken(userId)` 鑄 60s JWT → 加 `Authorization: Bearer` 轉發到 `apps/api`。**整層應 ≤ 20 行，無任何 SQL**
- **RSC 預取（Server Component fetch）** — `app/history/page.tsx` 與 `app/layout.tsx` 是 async RSC，在 server 端先 `signInternalToken` 並 `fetch(API_BASE/api/users/me/...)` 拿首屏資料，以 props 傳給 client component（`HistoryGrid initialJobs/initialHasMore/initialTier`、`UsageIndicator initialCredits`），消除瀏覽器初次掛載的 fetch waterfall
- **認證** — NextAuth v5 整合 Google OAuth；session 存入 PostgreSQL；`AUTH_ENABLED=false` 時自動注入 dev 預設用戶 ID
- **Landing Page** — 行銷首頁，含 PromoComposition 影片展示、功能說明、定價區塊
- **History Vault (`/history`)** — 展示用戶歷史任務，含列表/格狀切換、狀態徽章、封面縮圖、搜尋過濾、Cursor 分頁
- **Billing Page (`/billing`)** — 顯示目前點數餘額與方案，串接 Stripe Checkout（上線時啟用）
- **SSE 進度訂閱** — `useSSE` hook 在生成頁面建立 EventSource 連線，接收 `apps/api` 轉發的 Worker intel，驅動進度條動畫

---

## 關鍵介面與資料流 (Key Interfaces & Data Flow)

### BFF JWT Proxy 模式（用戶資料路由）

```
瀏覽器 fetch('/api/users/me/jobs?limit=24')
  → src/app/api/users/me/jobs/route.ts
  → auth() 驗證 session
  → signInternalToken(userId) 鑄 60s HS256 JWT
  → fetch(`${API_BASE}/api/users/me/jobs?...`, { headers: { Authorization: 'Bearer <jwt>' } })
  → 直接回傳 upstream body / status
```

### 任務建立 Proxy（保留 X-User-Id）

```
瀏覽器 fetch('/api/jobs', { method: 'POST', body: ... })
  → src/app/api/jobs/create/route.ts
  → auth() + 限流
  → signInternalToken(userId) 或 X-User-Id 注入
  → fetch(`${API_BASE}/api/jobs`, { headers: { Authorization: 'Bearer <jwt>' } })
```

### RSC 預取模式（首屏無 waterfall）

```
app/history/page.tsx (async RSC)
  → auth() → 拿到 userId
  → signInternalToken(userId)
  → fetch(`${API_BASE}/api/users/me/jobs?limit=24`, { cache: 'no-store' })
  → <HistoryGrid initialJobs={...} initialHasMore={...} initialTier={...} />
       ↳ Client component 用 useRef 跳過第一次 useEffect fetch；
         之後的 filter / load-more 才走 fetch('/api/users/me/jobs?...')

app/layout.tsx (async RSC)
  → 同樣 server-fetch /api/users/me/credits
  → <UsageIndicator initialCredits={...} />
```

### SSE 進度串流

```
useSSE(jobId) hook
  → new EventSource('/api/jobs/{jobId}/stream')
  → src/app/api/jobs/[jobId]/stream/route.ts
  → proxy to apps/api GET /api/jobs/{jobId}/stream
  → 瀏覽器接收 intel JSON → 更新進度條狀態
```

### 封面圖代理

```
<HistoryCard> img src="/api/jobs/{jobId}/cover"
  → src/app/api/jobs/[jobId]/cover/route.ts
  → 從 S3 取得 crawlResult.json，提取 viewportScreenshot URL
  → 307 redirect 至 presigned S3 URL
```

### Auth 注入流程

```
middleware.ts (matcher: /api/*)
  → getToken() 取得 JWT
  → 將 userId 注入 X-User-Id header
  → 如 AUTH_ENABLED=false → 注入 dev userId '1'
```

---

## 🚫 反模式 (Anti-Patterns)

### 1. Client 端直連 apps/api 微服務
瀏覽器若直接呼叫 `http://localhost:3000/api/jobs`（api 服務埠），會遭遇 CORS 封鎖與 session 驗證失敗。**所有 API 呼叫必須透過 apps/web 的 `/api/` BFF 代理路由**，永不例外。這也是 `X-User-Id` 信任邊界的核心設計。

### 2. 在 Server Component 中存取瀏覽器 API
`window`、`document`、`localStorage` 在 RSC 環境中不存在。任何需要這些 API 的元件**必須明確標示 `'use client'`**，且不得在 Server Component 中 `import` 它們，否則會在 Vercel / CI 環境中造成編譯失敗或 Hydration Mismatch。

### 3. 未處理 SSE 斷線重連
`EventSource` 在網路閃斷後不會自動以正確的 `Last-Event-Id` 重連。若不實作重試邏輯，進度條會在斷線後永久卡死在最後一個狀態。`useSSE` hook 必須監聽 `onerror` 事件並在延遲後重建連線，同時有最大重試上限以防無限迴圈。

### 4. 在 BFF 路由中跳過身份驗證
BFF 路由必須在轉發前**強制驗證 session**。若 `getServerSession()` 回傳 `null`，應立即回傳 `401`，絕不允許匿名請求穿透到 `apps/api`。AUTH_ENABLED=false 的 dev 模式是唯一例外，且僅限本地開發環境。

### 5. 在 BFF 層實作業務邏輯
apps/web 的 `/api/` 路由是純代理層，**不應包含任何業務邏輯**（如扣款計算、任務狀態機、點數校驗）。這些邏輯屬於 `apps/api`。代理層只做：驗證 session → 鑄 JWT → 轉發 → 回傳。

### 6. 在 apps/web 寫業務資料的 SQL
歷史上 `app/api/users/me/{jobs,credits}/route.ts` 直接接 `lib/pg.ts` 跑 100+ 行 JOIN / WHERE / 分頁 SQL — 這條路被 Spec 3 R6（2026-04）封閉。**業務資料（jobs / credits / subscriptions / users）一律走 apps/api 的對應路由**。`lib/pg.ts` 只允許用於 NextAuth session 表與少數 web-only 路由（cover redirect、download 簽章、API key 管理、billing 顯示）。如要新增任何讀寫業務資料的 web 路由，先去 `apps/api/src/routes/` 加 endpoint，再在這裡加 thin JWT proxy。

### 7. Client component 在 mount 時對自己 server 已預取的資料再 fetch 一次
RSC 已經在 server 端把首屏資料塞進 props（`initialJobs`、`initialCredits` 等）。Client component 必須用 `useRef` 或類似機制跳過「初次掛載 useEffect」的 fetch，否則使用者會看到一閃而過的 loading skeleton 然後 instantly 替換為相同內容 — 浪費頻寬也破壞 RSC 預取的意義。
