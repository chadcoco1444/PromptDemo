# Intent Spectrum Evaluation — 2026-04-27 (FINAL, 9/9 cells)

3 URLs × 3 intents = 9-job storyboard JSON matrix. Render skipped — JSON captured the moment it landed in S3.

**URLs (Y axis)**
- **vercel** — Vercel (infra SaaS): https://vercel.com
- **duolingo** — Duolingo (digital learning): https://www.duolingo.com
- **patagonia** — Patagonia (outdoor gear): https://www.patagonia.com/  *(swapped from gopro.com — see Bug Signal #2)*

**Intents (X axis)**
- **hardsell** 🔥 — `High-energy promotional spot. Short punchy scene durations. Emphasize speed, results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.`
- **tech** 🔬 — `Calm, methodical product walkthrough for technical buyers. Show concrete features and capabilities in sequence. Highlight what the product actually does, not why it matters emotionally. Tone: confident, precise, no marketing fluff.`
- **emotional** 💫 — `A romantic, atmospheric brand story. Slow scene pacing. Emphasize aspiration, lifestyle, who-you-become rather than what-the-product-does. Tone: cinematic, evocative, human.`

---

## Matrix 1: Scene Type Sequence

| URL ↓ / Intent → | hardsell 🔥 | tech 🔬 | emotional 💫 |
|---|---|---|---|
| **vercel** | TextPunch → DeviceMockup → TextPunch → CursorDemo → CodeToUI → TextPunch → BentoGrid → TextPunch → CTA | DeviceMockup → TextPunch → BentoGrid → CodeToUI → TextPunch → CTA | TextPunch → DeviceMockup → TextPunch → FeatureCallout → BentoGrid → CTA |
| **duolingo** | DeviceMockup → TextPunch → FeatureCallout → TextPunch → BentoGrid → TextPunch → SmoothScroll → CTA | DeviceMockup → TextPunch → BentoGrid → SmoothScroll → CTA | TextPunch → DeviceMockup → TextPunch → SmoothScroll → CTA |
| **patagonia** | DeviceMockup → TextPunch → SmoothScroll → TextPunch → FeatureCallout → TextPunch → BentoGrid → TextPunch → CTA | DeviceMockup → TextPunch → SmoothScroll → TextPunch → CTA | DeviceMockup → TextPunch → SmoothScroll → TextPunch → CTA |

## Matrix 2: Scene Count + Avg Pace

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | **9 scenes / 3.3s avg** | 6 / 5.0s | 6 / 5.0s |
| **duolingo** | **8 scenes / 3.8s avg** | 5 / 6.0s | 5 / 6.0s |
| **patagonia** | **9 scenes / 3.3s avg** | 5 / 6.0s | 5 / 6.0s |
| *(column avg)* | **8.7 scenes / 3.5s** | 5.3 / 5.7s | 5.3 / 5.7s |

## Matrix 3: TextPunch Count (the "punch" of hard-sell)

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | **4×** | 2× | 2× |
| **duolingo** | **3×** | 1× | 2× |
| **patagonia** | **4×** | 2× | 2× |

---

## 🎯 Findings (the AI is doing director-level work)

### Finding 1: Hardsell is structurally distinct, ROBUSTLY across all 3 URLs

Hardsell consistently produces **+50-80% more scenes** at **40% faster pace** with **+100% more TextPunch hooks** than tech/emotional. This pattern holds across infra SaaS / consumer learning app / outdoor brand — three completely different content domains. The AI is interpreting "high-energy promotional" as a **structural directive about cuts and rhythm**, not just a tonal hint.

### Finding 2: Tech vs emotional differentiate at SCENE-TYPE level only when source content is rich

- **Vercel** (rich technical content): tech keeps `CodeToUI`, emotional swaps for `FeatureCallout` → "what-it-does-in-code" vs "what-feature-it-is" framing distinct
- **Duolingo** (rich consumer content): tech opens with `DeviceMockup`, emotional opens with `TextPunch` (emotional hook first)
- **Patagonia** (degenerate content — see Bug #2): tech and emotional **collapse to identical scene sequences** because source has no material to differentiate

→ **The intent system is content-aware**. If the crawler delivers thin material, intent can only modulate STRUCTURE (scene count / pace) but not COMPONENT SELECTION. The AI doesn't fabricate richness when the source lacks it (this is by design — extractive check).

### Finding 3: DeviceMockup is now the de facto "always-include" hero (9/9 cells)

The new scene we shipped today (8bc82ed → 1a56bee) is being selected by the AI in **every single cell** of the matrix. Position varies (sometimes opening scene, sometimes 2nd) and the headline/subtitle text adapts to intent:

| URL | hardsell subtitle | tech subtitle | emotional subtitle |
|---|---|---|---|
| vercel | "deploy once, deliver everywhere." | "framework-defined infrastructure" | "your product, delivered." |
| duolingo | "learn anytime, anywhere" | "free. fun. effective." | n/a (uses different headline) |
| patagonia | "u.s. & canada" ⚠️ | "Europe. Japan." ⚠️ | "Sit tight." ⚠️ |

→ **DeviceMockup adoption is total**. The AI prompt is treating it as the canonical product showcase. *(Patagonia's bizarre subtitles are downstream of the crawler bug — see Bug #2.)*

### Finding 4: SmoothScroll is "consumer / lifestyle" coded

`SmoothScroll` (the long-page scroll preview) appears in every duolingo and patagonia cell but **zero vercel cells**. The AI has learned (likely from prompt design + training) that scroll-reveal works for product/lifestyle content but not for infra/dev tools where the value is functional.

---

## 🚨 Bug Signals Surfaced By This Experiment

### Bug #1: Brand color extraction is BROKEN (9/9 cells = `#4f46e5`)

**Every cell** falls back to default LumeSpec indigo (`#4f46e5`). Vercel = black/white. Duolingo = bright green. Patagonia = orange/black. The crawler should be detecting brand color from logo/CSS/og:image and NONE of it is making it into the storyboard.

**Severity**: Medium. Visually all 9 videos look LumeSpec-branded instead of source-brand-branded. Real PLG users would notice immediately.

**Suggested action**: dedicated brainstorm — where in the pipeline does brandColor get set? Is the field even being populated by the crawler, or always default?

### Bug #2: Patagonia regional splash page bypasses real content

Patagonia.com hits a **geographic gateway** with content like `"hang tight! routing to checkout..."`, `"u.s. & canada"`, `"europe"`, `"1.800.638.6464"` — only **6 phrases of source text**, all from a customer-service splash page. The AI did its job (used the material it had) but produced a video about Patagonia's customer service hotline instead of their gear/lifestyle.

**Root cause hypothesis**: Patagonia detects request-origin location and serves a different page than the real homepage to ambiguous-region requests. The Playwright crawler likely lands on the gateway and never sees the real content.

**Severity**: HIGH. Many international ecommerce sites do this (Adidas, Nike, IKEA, Apple Store, etc.). Coverage gap = entire category of "global brand homepages".

**Suggested action**: brainstorm crawler region-pinning strategy (set Accept-Language headers, force locale via cookie, or add a `?region=us` URL param hack).

### Bug #3: GoPro is hard-blocked by bot protection (CIRCUIT_OPEN persistent)

GoPro.com triggers Cloudflare bot challenge on every Playwright attempt. Domain circuit breaker tripped within seconds, 30-min cooldown locked the entire experiment slot.

**Severity**: HIGH. Cloudflare aggressive challenge is the default for many premium consumer brands. Same coverage gap as Bug #2 but caused by anti-bot rather than geo-routing.

**Suggested action**: brainstorm fallback to ScreenshotOne (already integrated as a track) or other anti-detection strategies.

### Bug #4: Extractive check + emotional intent = flaky failure

Duolingo/emotional failed first-try with `STORYBOARD_GEN_FAILED: Extractive check failed — these phrases are not in sourceTexts: scene 2: "duolingo - the world's most popular way to learn"`. Retry succeeded (different output). The phrase that failed is **literally in duolingo's sourceTexts** but with a curly-quote (`'` U+2019, see line 17 of supplements.json) vs Claude's straight-quote (`'`). Unicode normalization gap.

**Severity**: Medium. Causes flaky job failures with no actionable user message. Free retry usually wins, but in production the user gets a "failed" state.

**Suggested action**: add Unicode normalization (NFKC) to extractive-check comparison. One-line fix in `workers/storyboard/src/validation/extractiveCheck.ts`.

---

## 📊 Per-Job Detail (jobIds for traceability)

### vercel × hardsell (`NrVnKJRfzL5FadZY7Xd87`) — 9 scenes, avg 3.3s, brandColor #4f46e5
`TextPunch → DeviceMockup → TextPunch → CursorDemo → CodeToUI → TextPunch → BentoGrid → TextPunch → CTA`
- Scene 1 TextPunch: `"deploy your first app in seconds."` (primary emphasis)
- Scene 2 DeviceMockup: headline `"build and deploy on the ai cloud."`, subtitle `"deploy once, deliver everywhere."`, motion `pushIn`

### vercel × tech (`h7IgatNkiWofWDhkKSQiB`) — 6 scenes, avg 5s
`DeviceMockup → TextPunch → BentoGrid → CodeToUI → TextPunch → CTA`
- Scene 1 DeviceMockup: subtitle `"framework-defined infrastructure"` (technical phrasing)

### vercel × emotional (`uhnInYke89R92Huc2hOgR`) — 6 scenes, avg 5s
`TextPunch → DeviceMockup → TextPunch → FeatureCallout → BentoGrid → CTA`
- Scene 2 DeviceMockup: subtitle `"your product, delivered."` (outcome phrasing)
- CursorDemo + CodeToUI **both removed** vs hardsell

### duolingo × hardsell (`gY1BeHChUb0eN2UwBHYGD`) — 8 scenes, avg 3.8s
`DeviceMockup → TextPunch → FeatureCallout → TextPunch → BentoGrid → TextPunch → SmoothScroll → CTA`
- Scene 2 TextPunch: `"free. fun. effective."` (3-word punch)

### duolingo × tech (`3_TeXSzuxfKxVAqKbd3uT`) — 5 scenes, avg 6s
`DeviceMockup → TextPunch → BentoGrid → SmoothScroll → CTA`

### duolingo × emotional (`arsIuc3EfkFsTWh-rrUwW`) — 5 scenes, avg 6s *(retry — first attempt failed Bug #4)*
`TextPunch → DeviceMockup → TextPunch → SmoothScroll → CTA`
- Scene 2 DeviceMockup: longest scene of any job (240 frames = 8s, lingering shot)

### patagonia × hardsell (`AdytznGfWUTfmMcVj7TSR`) — 9 scenes, avg 3.3s
`DeviceMockup → TextPunch → SmoothScroll → TextPunch → FeatureCallout → TextPunch → BentoGrid → TextPunch → CTA`
- ⚠️ All text drawn from regional splash content — see Bug #2

### patagonia × tech (`H8pjQlAM-FRDJmDr0Q-Tx`) — 5 scenes, avg 6s
`DeviceMockup → TextPunch → SmoothScroll → TextPunch → CTA`
- Scene 5 CTA: headline `"1.800.638.6464"` (the customer service phone number 😅)

### patagonia × emotional (`tVaYS0QWEkSCt6AxpgIW-`) — 5 scenes, avg 5-7s (varied)
`DeviceMockup → TextPunch → SmoothScroll → TextPunch → CTA`
- Identical scene sequence to patagonia/tech — content too thin to differentiate at scene-type level

---

## 🎬 Verdict: How smart is the AI director?

**Strong signal of intent-driven directorial intelligence at the structural level**. The AI consistently translates "high-energy promotional" → more scenes / faster pace / repeated punch hooks across THREE different content domains, even when the source content is degenerate.

Where it has rich source material (vercel, duolingo) it ALSO differentiates at the scene-component-selection level (CodeToUI for tech intent, FeatureCallout for emotional intent, SmoothScroll for consumer-app intent). Where source is thin (patagonia gateway page), it falls back to structural-only differentiation — which is the right behavior given the extractive-check anti-hallucination policy.

**The real bottleneck on production-quality output is not the AI director — it's the crawler.** Bug #2 + Bug #3 expose a coverage gap on global ecommerce / consumer brand sites. Fixing crawler robustness would unlock 10× more variety in the AI's output without touching prompt design.
