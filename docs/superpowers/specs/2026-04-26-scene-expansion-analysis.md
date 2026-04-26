# 宣傳影片 Scene 擴充與 AI 創造力提升分析報告

身為資深動畫師、架構師與軟體工程師，針對目前 `workers/storyboard/prompts` 與 `@lumespec/schema` 的架構進行了深入評估。結論是：**系統目前的架構非常適合擴充，且您提出的情境 (Scenes) 都具有極高的商業價值與視覺衝擊力。**

以下是具體的架構分析、實作可行性，以及如何解放 AI 創造力的策略。

## 一、 架構擴充可行性 (Architectural Feasibility)

目前系統採用了 **Zod Discriminated Union** (`packages/schema/src/storyboard.ts`) 與 **Prompt Catalog** (`workers/storyboard/src/prompts/sceneTypeCatalog.ts`) 的設計。這種架構非常乾淨，增加新的 Scene 只需要以下幾個步驟，完全不會破壞現有邏輯：

1. **Schema 層 (`@lumespec/schema`)**: 定義新的 Scene Zod Schema (例如 `ReviewMarqueeSchema`)，並加入 `SceneSchema` 的 Union 中。
2. **Prompt 層 (`storyboard worker`)**: 在 `sceneTypeCatalog.ts` 的 `SCENE_CATALOG` 中加入新 Scene 的定義與使用時機 (Props Definition & Use Case)。
3. **暴露給 AI**: 將新 Scene 的名稱加入 `V1_IMPLEMENTED_SCENE_TYPES`，系統的 `systemPrompt.ts` 就會自動將其納入 Prompt 給 Claude/LLM。
4. **Render 層 (`render worker`)**: 實作對應的 React / Remotion 元件。

## 二、 提案 Scene 的深度分析與實作建議

您提出的三個方向都非常精準，以下是結合動畫與技術角度的實作建議：

### 1. 建立信任與背書 (Social Proof)
*   **ReviewMarquee (評價跑馬燈)**
    *   **架構調整**: 需要 `crawler` 具備提取網頁 review 或 testimonial 的能力，並放入 `crawlResult.features` 或新增 `crawlResult.reviews`。
    *   **Schema 設計**: `props: { reviews: z.array(z.object({ author: z.string(), text: z.string() })) }`
    *   **動畫建議**: 使用平滑的 CSS/Remotion 橫向 TranslateX 動畫，並加入兩側的 Fade Mask (漸層遮罩) 讓進出場更自然。
*   **LogoCloud (整合與生態系)**
    *   **架構調整**: Crawler 需要能識別知名品牌的關鍵字或圖片 (Stripe, GitHub 等)。
    *   **動畫建議**: 使用 Orbit (軌道環繞) 或 Staggered Pop-in (交錯彈出) 的 3D 感動畫，比單純的排排站更有科技感。

### 2. 數據與成果衝擊 (Data & Impact)
*   **StatsCounter (動態數據增長)**
    *   **架構現狀**: 目前已經有 `StatsBand`，但偏向靜態排版。
    *   **升級建議**: 可以直接擴展 `StatsBand` 或建立獨立的 `StatsCounter`。
    *   **動畫建議**: 在 Remotion 中使用 `useCurrentFrame` 與 easing 函數，讓數字從 0 快速跳動到目標值，配合音效 (BGM) 的重音 (Beat) 會非常有視覺爽度。
*   **BeforeAfter (痛點對比)**
    *   **架構調整**: 需要 Crawler 提取「痛點」與「解法」。
    *   **動畫建議**: 畫面一分為二，採用滑動遮罩（Slider）動畫，左邊展示傳統手動作業的混亂（Before），右邊展示使用產品後的整潔（After）。

### 3. 技術硬核與高階質感 (Tech & Context)
*   **CodeToUI (代碼具象化)**
    *   **架構挑戰**: 目前 `systemPrompt.ts` 中有 **HARD RULE #3** (所有文字必須來自 `sourceTexts` 白名單)。若要實作 CodeToUI，AI 可能需要「發明」一段合理的 JSON 或 Code。
    *   **解決方案**: 修改 Hard Rule #3，允許特定的欄位 (如 `codeSnippet`) 不受白名單限制，讓 AI 根據品牌特性自由發揮生成 Code。
*   **DeviceMockup (實機情境運鏡)**
    *   **架構調整**: 這是提升「高級感」最有效的做法。可以直接在現有的 `FeatureCalloutSchema` 中新增 `variant: 'device3d'`，或者獨立為 `DeviceMockupSchema`。
    *   **動畫建議**: 在 Remotion 中使用 `@remotion/three` 或預渲染的 WebGL Mockup，進行 Pan & Zoom (推拉運鏡)。

---

## 三、 如何讓 AI 更有創造力？ (Prompt Engineering & Architecture)

目前的 `systemPrompt.ts` 使用了 `CREATIVITY_DIRECTIVE` 和固定的 `RHYTHM_TEMPLATES`。要讓 AI 不再產生千篇一律的影片，可以採用以下高階策略：

### 1. 動態節奏模板 (Dynamic Rhythm Templates)
目前 10s/30s/60s 的節奏模板是寫死的。我們可以結合 `industryDetect.ts`，根據不同的產業給予**不同的節奏模板**。
*   **DevTool (開發工具)**: 建議 `TextPunch -> CodeToUI -> FeatureCallout -> CTA`
*   **E-Commerce (電商)**: 建議 `HeroRealShot -> ReviewMarquee -> BentoGrid -> CTA`
*   **SaaS (軟體)**: 建議 `StatsCounter -> BeforeAfter -> FeatureCallout -> CTA`
這樣 AI 的起手式就會根據產品基因產生變化。

### 2. 局部解除「幻覺」限制 (Controlled Hallucination)
目前系統嚴格限制 AI 只能使用網頁抓取到的文字 (HARD RULE #3)，這限制了創造力。
*   **建議**: 在 Prompt 中明確定義「哪些欄位必須精準 (如標題)」、「哪些欄位可以由 AI 腦補創造 (如 CodeToUI 的程式碼、CursorDemo 的假想搜尋關鍵字)」。這能讓畫面更豐富而不會偏離產品本質。

### 3. 賦予 AI 「導演人格」 (Director Persona Directives)
在 `systemPrompt.ts` 的 `CREATIVITY_DIRECTIVE` 中，加入更強烈的導演口吻：
> *"You are an award-winning commercial director (e.g., Apple product launch style). Don't just list features; tell a micro-story of transformation. Use 'TextPunch' to create dramatic pauses. Use 'BentoGrid' when the pacing needs to speed up."*

### 4. 場景權重與冷卻機制 (Scene Weighting)
如果發現 AI 太喜歡用某個 Scene，可以在 `sceneTypeCatalog.ts` 的描述中加入暗示。例如：
*   `FeatureCallout`: *"Use sparingly. Try to use BentoGrid or SmoothScroll instead if showing multiple UI parts."*

## 四、 總結與下一步 (Next Steps)

若要開始實作，建議的優先順序如下：

1.  **Phase 1 (Prompt & 創造力升級)**:
    *   修改 `systemPrompt.ts`，根據 Industry 注入動態的 Rhythm Templates。
    *   更新 `CREATIVITY_DIRECTIVE` 加入導演人格。
2.  **Phase 2 (高價值 Scene 實作)**:
    *   優先實作 **StatsCounter** 與 **ReviewMarquee**，這兩個對 Crawler 的依賴較小，且視覺效果升級最明顯。
    *   在 Schema (`packages/schema/src/storyboard.ts`) 與 Catalog (`workers/storyboard/src/prompts/sceneTypeCatalog.ts`) 中定義這兩個 Scene。
3.  **Phase 3 (技術與質感 Scene)**:
    *   實作 **DeviceMockup** (需要 Remotion 端較複雜的 3D/Mockup 元件處理)。
    *   實作 **CodeToUI** (需要調整 Prompt 的 Hard Rule #3 允許局部腦補)。
