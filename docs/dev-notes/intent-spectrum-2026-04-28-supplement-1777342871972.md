# Intent Spectrum Evaluation — 2026-04-28

9-job matrix: 3 URLs × 3 intents. Storyboard JSON captured the moment it was uploaded to S3 — render not awaited.

## URLs (Y axis)

- **vercel** — Vercel (infra SaaS): https://vercel.com
- **duolingo** — Duolingo (digital learning): https://www.duolingo.com
- **burton** — Burton (snowboard gear): https://www.burton.com/

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
| **vercel** | TextPunch → DeviceMockup → TextPunch → CursorDemo → BentoGrid → TextPunch → CodeToUI → TextPunch → CTA | DeviceMockup → TextPunch → FeatureCallout → CodeToUI → BentoGrid → TextPunch → CTA | TextPunch → DeviceMockup → TextPunch → SmoothScroll → CTA |
| **duolingo** | TextPunch → DeviceMockup → TextPunch → BentoGrid → TextPunch → SmoothScroll → TextPunch → CTA | DeviceMockup → TextPunch → BentoGrid → TextPunch → CTA | TextPunch → DeviceMockup → TextPunch → BentoGrid → CTA |
| **burton** | TextPunch → DeviceMockup → TextPunch → BentoGrid → TextPunch → FeatureCallout → SmoothScroll → TextPunch → CTA | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err |

## Matrix 2: Scene Count + Avg Pace

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | 9 scenes / avg 3.3s | 7 scenes / avg 4.3s | 5 scenes / avg 6s |
| **duolingo** | 8 scenes / avg 3.8s | 5 scenes / avg 6s | 5 scenes / avg 6s |
| **burton** | 9 scenes / avg 3.3s | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err |

## Matrix 3: Brand Colour

| URL ↓ / Intent → | hardsell | tech | emotional |
|---|---|---|---|
| **vercel** | #4f46e5 | #4f46e5 | #4f46e5 |
| **duolingo** | #4f46e5 | #4f46e5 | #4f46e5 |
| **burton** | #4f46e5 | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err | ❌ STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API err |

## Per-Job Detail

### vercel × hardsell

- jobId: `0_UpvPGaAGXdjTW3D6Fe7`
- scenes (9): TextPunch → DeviceMockup → TextPunch → CursorDemo → BentoGrid → TextPunch → CodeToUI → TextPunch → CTA
- avg pace: 3.3s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":4,"DeviceMockup":1,"CursorDemo":1,"BentoGrid":1,"CodeToUI":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 100,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "deploy once, deliver everywhere.",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 100,
    "entryAnimation": "zoomIn",
    "exitAnimation": "fade",
    "type": "DeviceMockup",
    "props": {
      "headline": "build and deploy on the ai cloud.",
      "subtitle": "deploy your first app in seconds.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  }
]
```

</details>

### vercel × tech

- jobId: `7_CBvXqygIwhIY7K9MN9V`
- scenes (7): DeviceMockup → TextPunch → FeatureCallout → CodeToUI → BentoGrid → TextPunch → CTA
- avg pace: 4.3s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"DeviceMockup":1,"TextPunch":2,"FeatureCallout":1,"CodeToUI":1,"BentoGrid":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 129,
    "entryAnimation": "fade",
    "exitAnimation": "slideLeft",
    "type": "DeviceMockup",
    "props": {
      "headline": "build and deploy on the ai cloud.",
      "subtitle": "deploy your first app in seconds.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 129,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "framework-defined infrastructure",
      "emphasis": "primary"
    }
  }
]
```

</details>

### vercel × emotional

- jobId: `kHXNlURgH5cuH7PGDvv9e`
- scenes (5): TextPunch → DeviceMockup → TextPunch → SmoothScroll → CTA
- avg pace: 6s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":2,"DeviceMockup":1,"SmoothScroll":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 180,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "deploy once, deliver everywhere.",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 240,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "DeviceMockup",
    "props": {
      "headline": "build and deploy on the ai cloud.",
      "subtitle": "your product, delivered.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pullOut"
    }
  }
]
```

</details>

### duolingo × hardsell

- jobId: `ePgFm_Sxo8L5eNG8hf3bM`
- scenes (8): TextPunch → DeviceMockup → TextPunch → BentoGrid → TextPunch → SmoothScroll → TextPunch → CTA
- avg pace: 3.8s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":4,"DeviceMockup":1,"BentoGrid":1,"SmoothScroll":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 112,
    "entryAnimation": "fade",
    "exitAnimation": "slideLeft",
    "type": "TextPunch",
    "props": {
      "text": "the world's most popular way to learn",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 113,
    "entryAnimation": "zoomIn",
    "exitAnimation": "fade",
    "type": "DeviceMockup",
    "props": {
      "headline": "learn a language with duolingo",
      "subtitle": "free. fun. effective.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  }
]
```

</details>

### duolingo × tech

- jobId: `rhuO4NM077WoBO_CvHnDv`
- scenes (5): DeviceMockup → TextPunch → BentoGrid → TextPunch → CTA
- avg pace: 6s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"DeviceMockup":1,"TextPunch":2,"BentoGrid":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 180,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "DeviceMockup",
    "props": {
      "headline": "learn a language with duolingo",
      "subtitle": "free. fun. effective.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 180,
    "entryAnimation": "zoomIn",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "backed by science",
      "emphasis": "primary"
    }
  }
]
```

</details>

### duolingo × emotional

- jobId: `Z1jeKp8jrwJZknCq2LfYS`
- scenes (5): TextPunch → DeviceMockup → TextPunch → BentoGrid → CTA
- avg pace: 6s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":2,"DeviceMockup":1,"BentoGrid":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 180,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "TextPunch",
    "props": {
      "text": "learn anytime, anywhere",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 240,
    "entryAnimation": "fade",
    "exitAnimation": "fade",
    "type": "DeviceMockup",
    "props": {
      "headline": "learn a language with duolingo",
      "subtitle": "free, fun, and effective courses in languages and more.",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  }
]
```

</details>

### burton × hardsell

- jobId: `D8B6LtQRiRJiD4s47hZfv`
- scenes (9): TextPunch → DeviceMockup → TextPunch → BentoGrid → TextPunch → FeatureCallout → SmoothScroll → TextPunch → CTA
- avg pace: 3.3s/scene
- brandColor: #4f46e5
- bgm: minimal
- scene type histogram: {"TextPunch":4,"DeviceMockup":1,"BentoGrid":1,"FeatureCallout":1,"SmoothScroll":1,"CTA":1}

<details><summary>First 2 scenes (props excerpt)</summary>

```json
[
  {
    "sceneId": 1,
    "durationInFrames": 100,
    "entryAnimation": "fade",
    "exitAnimation": "slideLeft",
    "type": "TextPunch",
    "props": {
      "text": "standing sideways since 1977",
      "emphasis": "primary"
    }
  },
  {
    "sceneId": 2,
    "durationInFrames": 100,
    "entryAnimation": "zoomIn",
    "exitAnimation": "slideLeft",
    "type": "DeviceMockup",
    "props": {
      "headline": "break free, choose your line, and enjoy the ride.",
      "subtitle": "burton.com",
      "screenshotKey": "viewport",
      "device": "laptop",
      "motion": "pushIn"
    }
  }
]
```

</details>

### burton × tech

- jobId: `bStunXQ_N5q8yxVc4u68U`
- ❌ ERROR: STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CaVNRxtmU2bYsFwrHru9R"}

### burton × emotional

- jobId: `qX6hMrZk5OoWiQjVZJQyo`
- ❌ ERROR: STORYBOARD_GEN_FAILED: STORYBOARD_GEN_FAILED: Claude API error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CaVNTf7zWA3CCYmGSMDyJ"}

