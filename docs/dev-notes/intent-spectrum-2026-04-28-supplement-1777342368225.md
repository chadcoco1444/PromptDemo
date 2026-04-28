# Intent Spectrum Evaluation — 2026-04-28

9-job matrix: 3 URLs × 3 intents. Storyboard JSON captured the moment it was uploaded to S3 — render not awaited.

## URLs (Y axis)

- **vercel** — Vercel (infra SaaS): https://vercel.com

## Intents (X axis)

- **hardsell** — 🔥 HARD-SELL HYPE
  > High-energy promotional spot. Short punchy scene durations. Emphasize speed, results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.
- **tech** — 🔬 TECH DEEP-DIVE
  > Calm, methodical product walkthrough for technical buyers. Show concrete features and capabilities in sequence. Highlight what the product actually does, not why it matters emotionally. Tone: confident, precise, no marketing fluff.
- **emotional** — 💫 EMOTIONAL BRAND STORY
  > A romantic, atmospheric brand story. Slow scene pacing. Emphasize aspiration, lifestyle, who-you-become rather than what-the-product-does. Tone: cinematic, evocative, human.

## Matrix 1: Scene Type Sequence

| URL ↓ / Intent → | hardsell 🔥 | tech 🔬 | emotional 💫 |
|---|---|---|---|
| **vercel** | TextPunch → TextPunch → FeatureCallout → TextPunch → BentoGrid → CursorDemo → TextPunch → CTA | — | — |

## Matrix 2: Scene Count + Avg Pace

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | 8 scenes / avg 3.8s | — | — |

## Matrix 3: Brand Colour

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | #4f46e5 | — | — |

## Per-Job Detail

### vercel × hardsell

- jobId: `Y2y-fVShk6nhQxaSIyNc1`
- scenes (8): TextPunch → TextPunch → FeatureCallout → TextPunch → BentoGrid → CursorDemo → TextPunch → CTA
- avg pace: 3.8s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":4,"FeatureCallout":1,"BentoGrid":1,"CursorDemo":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 113,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "build and deploy on the ai cloud.",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 113,
    "entryAnimation": "slideUp",
    "exitAnimation": "slideUp",
    "type": "TextPunch",
    "props": {
      "text": "deploy your first app in seconds.",
      "emphasis": "secondary"
    }
  }
]
```

</details>

