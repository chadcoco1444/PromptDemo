<div align="center">

# 🎬 PromptDemo

**Your website → an AI-crafted demo video.**
**Describe your intent. Hit generate. Ship in 60 seconds.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-6366f1)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-2563eb)](https://www.typescriptlang.org)
[![Powered by Claude](https://img.shields.io/badge/AI-Claude%203.5%20Sonnet-7c3aed)](https://anthropic.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-0284c7)](CONTRIBUTING.md)

<img src="docs/readme/demo.gif" alt="PromptDemo — paste a URL, get a demo video" width="720" />

> Making a demo video used to mean screen recording, cutting footage, and hours of retakes every time your product changed. **PromptDemo flips the model.** Paste a URL, describe your intent — our AI pipeline reads your industry, generates a cinematic storyboard, and Remotion renders a pixel-perfect MP4 before your next coffee. No editing software. No templates. Just your product, presented brilliantly. And yes — every video dogfoods our own stack, including the **"Made with PromptDemo"** badge you see bottom-right.

</div>

---

## ✨ Why PromptDemo?

|  | Feature | The benefit you actually care about |
|---|---|---|
| 🧠 | **Creativity Engine** | Claude doesn't just read your page — it *understands your industry*. Fintech gets authority and momentum. SaaS gets energy. Dev tools get precision. Zero briefing required. |
| 🎥 | **Pixel-Perfect Rendering** | Videos are generated from React + Remotion code, not screen recordings. Every easing curve, transition, and font size is mathematically exact. No artifacts, no "sorry the recording froze" moments. |
| 📁 | **History Vault + Fork** | Every video is stored, searchable, and re-renderable. Updated your landing page? Fork last week's video, tweak the intent, re-render. Your demo library evolves with your product. |

---

## ⚡ How It Works

```
Paste URL  →  Crawl & Understand  →  AI Storyboard  →  Render MP4  →  Download & Share
   (1)              (2)                    (3)              (4)              (5)
```

1. **Paste URL** — any live webpage: product page, landing page, changelog, docs
2. **Crawl & Understand** — Playwright takes full-page screenshots; Claude reads your content and detects your industry
3. **AI Storyboard** — the Creativity Engine generates a JSON scene script: hero, feature callouts, CTA, pacing — all tuned to your tone
4. **Render MP4** — Remotion renders frame-perfect 10 / 30 / 60-second video via isolated BullMQ workers
5. **Download & Share** — MP4 ready for LinkedIn, Product Hunt, your docs site, or your next pitch deck

---

## 🚀 Quick Start

```bash
# 1 · Clone and install
git clone https://github.com/chadcoco1444/PromptDemo.git
cd PromptDemo
pnpm install

# 2 · Configure (only one key is required)
cp .env.example .env
# → open .env and add your ANTHROPIC_API_KEY

# 3 · Launch everything
pnpm demo start
# → Web UI at http://localhost:3001
# → API at http://localhost:3000/healthz
```

> **First run is slow** — workers install Chromium, Redis connects, and Next.js builds. Watch `pnpm demo logs` and wait for "worker started". Subsequent starts are fast.

### Prerequisites

- Docker Desktop (for Redis, MinIO, Postgres)
- Node.js ≥ 20 + pnpm ≥ 9
- An `ANTHROPIC_API_KEY`

### Optional: Google OAuth + History Vault

```bash
# In .env:
AUTH_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=<openssl rand -hex 32>
NEXTAUTH_URL=http://localhost:3001
```

Then `pnpm demo db:reset` to apply migrations and `pnpm demo start`.

---

## 🏗️ Built with the Best of the Modern Web

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 · Tailwind CSS · shadcn/ui · Framer Motion | App Router, dark glassmorphic UI, server components |
| **AI** | Anthropic Claude 3.5 Sonnet | Storyboard generation, industry tone injection, 7-layer output validation |
| **Rendering** | Remotion 4 | Code-driven video — frame-perfect output, zero recording artifacts |
| **Queue** | BullMQ + Redis | Isolated crawl → storyboard → render worker pipeline |
| **Crawling** | Playwright + ScreenshotOne | Full-page screenshots, JS-rendered content extraction |
| **Database** | PostgreSQL + `@auth/pg-adapter` | Auth sessions, credit ledger, job history |
| **Storage** | AWS S3 / MinIO | Video assets, crawl results, storyboard JSON |
| **Auth** | NextAuth v5 + Google OAuth | Database sessions, per-user credit + history isolation |

---

## 🗂️ Architecture

```
Browser / CLI
     │
     ▼
apps/web (Next.js 14)          ← Marketing landing, History Vault, auth
     │  JWT proxy
     ▼
apps/api (Fastify)             ← Job lifecycle, credit gate, orchestration
     │  BullMQ
     ├──▶ workers/crawler      ← Playwright + Claude content extraction
     ├──▶ workers/storyboard   ← Creativity Engine (Claude storyboard gen)
     └──▶ workers/render       ← Remotion → MP4 → S3
```

Each worker runs in its own Node process with its own Redis connection.
The web tier talks to the API via a short-lived HS256 JWT — end-user
browsers never touch the API directly.

---

## 🗺️ Roadmap

What's coming next:

| Status | Feature |
|---|---|
| 🔜 Next | **Multi-language voiceover** — auto-generated narration in EN / ZH |
| 🔜 Next | **Custom brand kit** — upload logo + colors, every video matches your brand |
| 💡 Planned | **Webhook / CI trigger** — auto-generate a new video on every deploy |
| 💡 Planned | **Team workspaces** — share History Vault and credits across your org |
| 💡 Planned | **Scene editor** — tweak the AI storyboard before rendering |

Want to see something here sooner? Open an issue or vote with a 👍.

---

## 🤝 Contributing

PromptDemo is built in the open and welcomes contributions of all kinds.

- **Found a bug?** [Open an issue](https://github.com/chadcoco1444/PromptDemo/issues)
- **Have a scene type idea?** Submit a PR — the renderer is modular and each scene is a self-contained React component
- **Want to add a voiceover engine or new crawling strategy?** Start a Discussion

```bash
# Run all tests
pnpm test

# Run a specific package
pnpm --filter @promptdemo/web test

# Type-check the whole monorepo
pnpm tsc

# Re-generate the landing hero video (with PLG watermark)
node scripts/dogfood-landing-demo.mjs --watermark
```

See `docs/readme/demo-gif-howto.md` for instructions on recording and compressing the demo GIF.

---

<div align="center">

**⭐ If PromptDemo saved you an hour of video editing, give us a star — it helps more developers find the project.**

[Star on GitHub](https://github.com/chadcoco1444/PromptDemo) · [Open an Issue](https://github.com/chadcoco1444/PromptDemo/issues) · [Start a Discussion](https://github.com/chadcoco1444/PromptDemo/discussions)

<sub>Built with ❤️ and dogfooded on itself — the demo GIF above was generated by PromptDemo.</sub>

</div>
