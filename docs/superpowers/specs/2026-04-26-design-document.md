# LumeSpec 跨模組架構與設計文件 (DESIGN.md) 實作計畫

## 背景與目標 (Background & Goals)

為了讓開發團隊與 AI 編程助手（如 Claude Code）能夠無縫協作、快速理解 LumeSpec 複雜的分散式架構，我們在每一個核心模組 (Folder) 底下建立一份 `DESIGN.md`。這些文件以資深架構師的角度撰寫，清楚定義職責邊界、Design Pattern 以及技術債提醒。

---

## 全域 AI 審查指令 (Global AI Constraint)

在每一份 `DESIGN.md` 的開頭，都強制加入以下提示詞 (Prompt)，確保 AI 在寫 Code 前建立起架構防護網：

> **[AI 開發人員強制指令 / AI Dev Directive]**
> 當你在這個模組下新增任何檔案或修改任何程式邏輯前，你 **必須 (MUST)** 先重新檢視本 `DESIGN.md`。若你的實作方案與本文件的架構規範、職責邊界或設計模式產生衝突，你必須修正你的實作方案以符合設計規範；若你認為必須打破規範，你必須在輸出程式碼前，明確向 User 提出警告並說明原因。

---

## 模組設計重點與反模式清單 (Modules & Anti-Patterns)

### 1. `apps/api/DESIGN.md` (後端 API 核心與協調器)
**模組職責：** Fastify REST API、身份驗證、點數交易 (Ledger)、任務協調 (Orchestrator)。
**🚫 反模式與絕對禁止的作法：**
* **將實時進度 (Progress) 寫入 DB：** 這會導致嚴重的 WAL Storm，進度只能存在 Redis 並透過 SSE 廣播。
* **在 Route 中直接操作資料庫 (Fat Controller)：** 破壞單一職責原則，應將邏輯移至 Service 層處理。
* **忽略非循序事件：** 在 `stateMachine.ts` 中盲目應用新狀態，導致已失敗的任務死灰復燃。

### 2. `apps/web/DESIGN.md` (前端 Web 應用)
**模組職責：** Next.js 15 UI、歷史記錄庫、BFF 代理 (Backend-For-Frontend)。
**🚫 反模式與絕對禁止的作法：**
* **Client 端直連微服務：** 會導致 CORS 與驗證失敗，所有呼叫必須經過 Next.js 的 `/api/` 代理。
* **在 Server Component 中使用 Window：** 會導致編譯錯誤與 Hydration Mismatch，必須明確標示 `'use client'`。
* **未處理 SSE 斷線重連：** 若網路閃斷會導致進度條永久卡死，必須實作重試機制。

### 3. `workers/crawler/DESIGN.md` (爬蟲微服務)
**模組職責：** 透過 Playwright / Cheerio 提取網頁內容與截圖。
**🚫 反模式與絕對禁止的作法：**
* **未過濾干擾元素：** 不隱藏 GDPR 彈窗或客服視窗就直接截圖，嚴重破壞影片質感。
* **未關閉 Browser 導致 Memory Leak：** 忘記在 `finally` 區塊關閉無頭瀏覽器，導致伺服器 OOM。
* **過早截圖：** 僅等待 `networkidle` 而忽略 SPA 客戶端渲染的延遲，導致截出白畫面。

### 4. `workers/storyboard/DESIGN.md` (AI 分鏡生成微服務)
**模組職責：** 調用 Claude API 生成分鏡腳本，並進行 7 層防護驗證。
**🚫 反模式與絕對禁止的作法：**
* **取消「文字白名單限制」：** 允許 AI 隨意腦補產品標語，產生嚴重的「AI 幻覺」與虛假承諾。
* **將絕對數學交給 LLM：** 要求 LLM 精準計算 900 幀的加總，這會大幅提升失敗率，應交由 Node.js 後處理計算。
* **無限重試陷阱：** 遇到解析錯誤時不斷重試且未設定 `MAX_ATTEMPTS` 上限，導致 Token 被迅速抽乾。

### 5. `workers/render/DESIGN.md` (影片渲染微服務)
**模組職責：** 調用 Remotion 與 FFMPEG 進行 MP4 平行壓製。
**🚫 反模式與絕對禁止的作法：**
* **未清理 Zombie Processes：** 未處理 Uncaught Exception，導致大量的 Chromium 子進程殘留。
* **在此層硬改 React 元件：** 破壞 `packages/remotion` 的獨立性，Render Worker 只能做為單向驅動器。
* **忽略本地完整性檢查：** 直接 Streaming 壓製到 S3 容易產生損壞檔案，應堅持「先本地壓製、再上傳、後刪除」的原子性操作。

### 6. `packages/schema/DESIGN.md` (共享型態)
**模組職責：** 全系統唯一的 Truth Source，定義 Zod Schema。
**🚫 反模式與絕對禁止的作法：**
* **混入 Framework 依賴：** 在此 `import React` 或使用 Node.js 原生模組，會導致前端或 Worker 編譯崩潰。
* **定義鬆散的型別 (Loose Types)：** 大量使用 `z.any()` 導致 Claude 輸出的髒資料直接毒害渲染引擎。
* **遺漏 Type Export：** 定義了 Schema 卻沒有導出 `z.infer`，破壞 Single Source of Truth。

### 7. `packages/remotion/DESIGN.md` (影片引擎)
**模組職責：** React 影片 UI、動畫邏輯。
**🚫 反模式與絕對禁止的作法：**
* **在渲染迴圈中忽略 `useMemo`：** 每秒執行 30 次高昂的 `deriveTheme`，導致嚴重的效能瓶頸與記憶體溢出。
* **使用 `setTimeout` 處理動畫：** 破壞 Remotion 時間軸的確定性，應全面使用 `useCurrentFrame`。
* **未設定 FontSwap：** 從外部引入字體但未處理同步載入，導致無頭截取時發生閃字 (FOUT)。

### 8. `db/DESIGN.md` (資料庫設計)
**模組職責：** PostgreSQL Schema 管理與金流交易紀錄。
**🚫 反模式與絕對禁止的作法：**
* **在更新狀態時忽略樂觀鎖 (OCC)：** 盲目 `UPDATE` 可能導致被新狀態覆蓋的舊事件再度復活。
* **跨界直接修改 DB：** 允許 Worker 直連並修改任務狀態，破壞了 Orchestrator 的中樞管理設計。
* **在單一 Transaction 中等待長時間 I/O：** 在扣款交易中同步等待 API 請求，導致 Row Lock 逾時。