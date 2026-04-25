# Creativity Engine Design Spec
**Date:** 2026-04-25
**Feature:** LumeSpec 影片生成多樣性與創造力提升

---

## Problem

LumeSpec 穩定但「模板化」。不同 URL 產出的 Storyboard 場景序列幾乎相同：HeroRealShot → FeatureCallout × N → CTA，缺乏針對產品特性的結構差異。根本原因有三：

1. `V1_IMPLEMENTED_SCENE_TYPES` 只有 5 種積木，選擇空間不足
2. `RHYTHM_TEMPLATES` 寫得太死，Claude 幾乎沒有自由度
3. System prompt 沒有產業調性引導，SaaS 工具和電商口吻相同

---

## Goals

- 打破 Hero → Feature → CTA 固定序列
- 解鎖 BentoGrid 和 CursorDemo 兩種高衝擊場景類型
- 根據爬蟲資料偵測產業類別，動態注入語氣引導（不破壞 Prompt Cache）
- 零額外 API cost、零額外延遲

## Non-goals (v1)

- 產業類別手動 override UI（YAGNI，intent 欄位已可隱性覆蓋）
- Web3 / 金融 category（爬蟲牆問題，v2 再評估）
- CursorDemo 複雜軌跡 / DOM 座標計算（MVP：九宮格 + Bezier 即可）
- UseCaseStory / StatsBand 解鎖（留給下一 iteration）

---

## Architecture Decision: User Message Injection (NOT System Prompt)

Style Modifiers 注入到 **user message**，不動 system prompt。

**原因：** 現有系統在 system prompt block 設有 `cache_control: ephemeral`，命中率約 60% token 節省。若動態修改 system prompt，每次請求都是 cache miss，直接抹除這個優勢。User message 本來就不快取，注入到此處零成本、零副作用。

---

## Section 1: Scene Catalog Expansion

### sceneTypeCatalog.ts

`V1_IMPLEMENTED_SCENE_TYPES` 從 5 種擴充為 7 種：

```typescript
export const V1_IMPLEMENTED_SCENE_TYPES = [
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'SmoothScroll',
  'CTA',
  'BentoGrid',   // NEW
  'CursorDemo',  // NEW
] as const;
```

兩種新場景的 schema 定義（已在 catalog 中有 unimplemented 條目，改為 implemented）：

**BentoGrid**
- Props: `items: Array<{ title: string; description?: string; iconHint?: string }>` (3-6 items)
- Constraint (soft, prompt-enforced): 只建議用於 30s / 60s 影片；10s 影片場景太少不適合，系統 prompt 會說明但 Zod 不 hard-validate
- Prompt hint: 適合 B2B 多功能密集展示，替代多個連續 FeatureCallout

**CursorDemo**
- Props: `action: 'Click' | 'Scroll' | 'Hover' | 'Type'`, `targetHint: CompassRegion`, `targetDescription: string`
- `CompassRegion`: `'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'`
- Constraint (soft, prompt-enforced): 只建議用於 30s / 60s 影片，每支影片最多 2 個；Zod 不 hard-validate 數量，靠 prompt 引導
- Prompt hint: 展示真實互動操作，適合 developer_tool 和 saas_tool

`AVAILABLE_SCENES_PROMPT` 由過濾函式自動產生，無需手動維護。

### Remotion: BentoGrid.tsx

**位置：** `packages/remotion/src/scenes/BentoGrid.tsx`

```
Layout: AbsoluteFill, dark background (#0a0a0a)
Grid: CSS grid — 2 columns if items.length <= 4, else 3 columns
Each cell: icon area (iconHint → 對應 emoji 或幾何圖形) + title + description
Entry animation: stagger spring scale (per-cell delay = index × 80ms)
  spring config: stiffness=180, damping=22 (高級感，非彈跳感)
Brand color: cell border-bottom accent line
```

### Remotion: CursorDemo.tsx

**位置：** `packages/remotion/src/scenes/CursorDemo.tsx`

MVP 實作範圍：

```
Cursor: SVG pointer icon (standard arrow)
Path: Quadratic Bezier from off-screen-bottom-left → targetHint compass region
  Control point: 畫面中央偏移 (randomized per seed to avoid looking mechanical)
  Duration: 前 40% 的 frames 移動到位

Action animations (後 60% frames):
  Click  → 擴散波紋 ring (scale 0→2.5, opacity 1→0, duration 18 frames)
  Scroll → 游標 y 軸 -40px 緩移 (easeInOut)
  Hover  → 游標輕微 pulse scale (1→1.15→1, 2 cycles)
  Type   → targetDescription 文字打字機效果 (每字 3 frames)

Background: 產品截圖 (viewport screenshot) 作為底層，40% 暗化 overlay
targetHint → 座標轉換:
  top-left=(10%,15%), top-center=(50%,15%), top-right=(90%,15%)
  center-left=(10%,50%), center=(50%,50%), center-right=(90%,50%)
  bottom-left=(10%,85%), bottom-center=(50%,85%), bottom-right=(90%,85%)
```

### resolveScene.tsx

新增兩個 case 分支，pattern 與現有 `SmoothScroll`、`TextPunch` 一致。

---

## Section 2: Industry Detection + Style Modifier Injection

### 新增：industryDetect.ts

**位置：** `workers/storyboard/src/prompts/industryDetect.ts`

```typescript
export type IndustryCategory =
  | 'developer_tool'
  | 'ecommerce'
  | 'saas_tool'
  | 'content_media'
  | 'default';

export function detectIndustry(crawlResult: CrawlResult): IndustryCategory
export const STYLE_MODIFIERS: Record<IndustryCategory, string>
```

**偵測優先序（先命中先贏）：**

1. **developer_tool** — sourceTexts 或 feature descriptions（lowercase）含任一：
   `api`, `sdk`, `cli`, `npm`, `github`, `webhook`, `endpoint`, `open source`, `repository`, `package`, `library`

2. **ecommerce** — sourceTexts 含 `$` + 數字，或含：
   `cart`, `checkout`, `buy now`, `add to bag`, `add to cart`, `free shipping`, `discount`, `coupon`

3. **saas_tool** — `crawlResult.features.length >= 3`，且未觸發上兩項

4. **content_media** — `crawlResult.features.length <= 1` 且 sourceTexts 平均詞數 > 20

5. **default** — 兜底

**STYLE_MODIFIERS（注入到 user message 的 `## Product Style Guidance` block）：**

```
developer_tool:
  Be precise and concise — no marketing fluff. The audience is technical.
  Lead with what this tool DOES, not what it "empowers" you to do.
  CursorDemo is highly effective here — show the real workflow, not a screenshot tour.
  FeatureCallout scenes should use left-aligned layout for readability.

ecommerce:
  Lead with visual impact and desire. Short, punchy copy only.
  Use TextPunch for price or offer callouts.
  SmoothScroll on the product page creates appetite — use it.
  The CTA must be action-forward (Shop Now, Get Yours, etc.), not generic.

saas_tool:
  Emphasize efficiency, workflow integration, and team productivity.
  Lead with the core value proposition — what pain does it eliminate?
  BentoGrid is ideal for showing multiple features without scene bloat.
  Open with the main dashboard or interface via HeroRealShot.

content_media:
  Open with a strong TextPunch headline to set editorial authority.
  Use SmoothScroll to convey the volume and depth of content.
  Tone should be authoritative and inviting — not sales-y.
  Avoid CursorDemo (no interactive UI to demonstrate).

default:
  (empty string — no modifier injected)
```

### userMessage.ts 修改

現有 7 個 markdown block 之後，追加：

```typescript
const modifier = STYLE_MODIFIERS[detectIndustry(crawlResult)];
if (modifier) {
  parts.push(`## Product Style Guidance\n${modifier}`);
}
```

修改量：import 2 個函式 + 4 行邏輯。現有 block 結構不動。

---

## Section 3: Rhythm Template Liberation + Creativity Injection

### systemPrompt.ts — RHYTHM_TEMPLATES 鬆綁

現有 template 從「處方」改為「建議起點 + 替代範例」：

**30s (900 frames) — 建議 5-7 個場景：**
```
Suggested starting point (adapt freely to the product's personality):
- Default:          HeroRealShot → FeatureCallout × 2-3 → TextPunch → CTA
- Feature-dense:    HeroRealShot → BentoGrid → TextPunch → CTA
- Interaction-first: TextPunch (hook) → CursorDemo → FeatureCallout × 2 → CTA
- Scroll-heavy:     HeroRealShot → SmoothScroll → FeatureCallout × 2 → CTA

These are starting points, NOT rules. Pick the sequence that fits this brand.
```

**60s (1800 frames) — 建議 7-10 個場景：**
```
Suggested starting point:
- Default:          HeroRealShot → FeatureCallout × 3-4 → TextPunch × 2 → SmoothScroll → CTA
- Demo-heavy:       TextPunch → HeroRealShot → CursorDemo × 2 → FeatureCallout × 2 → BentoGrid → CTA
- Visual-story:     HeroRealShot → SmoothScroll → BentoGrid → TextPunch → FeatureCallout × 2 → CTA

Mix and match. Generic is failure.
```

**10s (300 frames)** — 場景少，不宜有 BentoGrid/CursorDemo，保持現有 3-4 場景建議，措辭改為 "suggested"。

### systemPrompt.ts — Creativity Injection

加在 Hard Rules section 之後、Rhythm Templates 之前：

```
CREATIVITY DIRECTIVE:
Do not default to the same scene sequence for every video. The best storyboard
matches this specific product's personality.

Before choosing scene order, ask:
- Does this product deserve a visual HeroRealShot open, or a punchy TextPunch hook?
- Should features be shown individually or together in a BentoGrid?
- Is there a user interaction worth demonstrating with CursorDemo?

Vary your approach intentionally. A storyboard that could fit any product fits none.
```

---

## Testing Strategy

### Unit Tests

**`industryDetect.test.ts`** — 純函式，直接測：
- 每個 category 的正向命中
- 優先序邊界（developer + ecommerce 信號同時存在 → developer 贏）
- default fallback

**`BentoGrid.test.tsx`** — Remotion `renderStill` smoke test，確認 3-item 和 6-item 不崩潰

**`CursorDemo.test.tsx`** — 4 種 action 各 renderStill，確認每種 action 在各 frame 點不崩潰

### Integration

現有 storyboard worker 的 Vitest 整合測試已覆蓋 Zod validation 和 extractive check，新場景類型自動納入覆蓋範圍（JSON schema 包含新 types）。

---

## File Change Summary

| File | Type | Change |
|---|---|---|
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | modify | 解鎖 BentoGrid、CursorDemo，加 CompassRegion type |
| `workers/storyboard/src/prompts/systemPrompt.ts` | modify | 鬆綁 RHYTHM_TEMPLATES + Creativity Injection |
| `workers/storyboard/src/prompts/userMessage.ts` | modify | import detectIndustry + append Style Modifier block |
| `workers/storyboard/src/prompts/industryDetect.ts` | **new** | detectIndustry 函式 + STYLE_MODIFIERS record |
| `packages/remotion/src/scenes/BentoGrid.tsx` | **new** | Remotion BentoGrid composition |
| `packages/remotion/src/scenes/CursorDemo.tsx` | **new** | Remotion CursorDemo MVP composition |
| `packages/remotion/src/resolveScene.tsx` | modify | 新增 BentoGrid、CursorDemo case |
| `packages/remotion/src/MainComposition.tsx` | modify | 確認是否有獨立的 scene type 列表需同步；主要 dispatch 邏輯在 resolveScene.tsx，此檔可能無需改動 |
| `workers/storyboard/tests/industryDetect.test.ts` | **new** | 純函式單元測試 |
| `packages/remotion/tests/BentoGrid.test.tsx` | **new** | renderStill smoke test |
| `packages/remotion/tests/CursorDemo.test.tsx` | **new** | 4 action renderStill smoke test |

---

## Acceptance Criteria

1. 輸入 Apple 官網、一個 B2B SaaS 工具、一個開發者 CLI 工具 — 三支影片的場景序列在類型和順序上有可見差異
2. BentoGrid 場景在 30s / 60s 影片中正確渲染（3-6 items，stagger spring 入場）
3. CursorDemo 場景的游標從畫面外沿 Bezier 軌跡移動到指定 compass region，4 種 action 各自正確播放
4. 所有 Storyboard JSON 100% 通過 Zod 驗證
5. industryDetect 單元測試全過（含優先序邊界 case）
6. `pnpm -r test` 通過，無回歸
