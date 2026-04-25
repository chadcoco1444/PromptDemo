# PromptDemo Marketing Landing Page — Design Spec

**Brainstorm completed:** 2026-04-25
**Status:** awaiting user review before writing-plans handoff
**Predecessor:** [v2.1 hardening spec](2026-04-25-promptdemo-v2-1-design.md) — Phase 4 floor (Inter, glassmorphism, framer-motion) is the visual baseline this spec builds on.

**Goal.** Add a public-facing marketing landing page that converts cold visitors. Adopt the visual quality bar of [remotion.dev](https://www.remotion.dev) and the design rigor of [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

**Conversion target.** A signed-out visitor lands on `/`, sees the value prop within one second, watches a 12-second dogfooded demo loop, and clicks through to sign-in with intent + URL prefilled — i.e. the sign-in flow lands them on `/jobs/[id]` with their first job already running.

---

## Decisions (8 brainstorm questions)

| # | Question | Choice |
|---|---|---|
| 1 | Scope | **A — new marketing landing page** above the existing app surfaces |
| 2 | Routing | **B — conditional `/`** (signed-out → landing, signed-in → form, no URL change) |
| 3 | Section composition | **B — Standard, revised post-review:** Hero (video lives here) + Features + Final CTA + Footer |
| 4 | Hero composition | **C — Split:** preview form (left) + looping demo video (right) |
| 5 | Visual style | **A — remotion.dev-faithful:** dark + violet glow + grid backdrop |
| 6 | Demo asset | **B — fresh dogfooded MP4** (rendered + saved to `docs/readme/landing-hero-demo.mp4`, 6.1 MB, vercel.com seed) |
| 7 | Feature grid | **3-column custom:** Zero-Touch Storyboarding, Intent-Driven Directing, Studio-Grade Polish |
| 8 | Hero copy | **A** for headline + **B's tagline** as the feature grid section heading |

---

## Page architecture

```
/  (root route)
├── (server-rendered branch on session)
│   ├── signed-out → MarketingLanding
│   └── signed-in  → existing JobForm page (current /)
│
└── /create  (new route — current /'s form moves here)
    └── reachable from anywhere via "Try it" / "Get started"

/landing-preview (debug/dev only — always renders MarketingLanding regardless of session)
```

**Why conditional render at `/`** (not redirect): zero perceived flicker, no extra round-trip, no URL change to share. Server reads the NextAuth session and picks the right component before sending HTML.

**Why `/create` exists separately:** preserves the form's URL when the user is signed out → clicks the hero form → bounces to sign-in → returns to `/create?url=...&intent=...&duration=60`. Pre-filled values come from query params. Existing `/` jobs page logic moves wholesale into `/create/page.tsx`.

---

## Hero (above the fold)

### Layout

- **Desktop (≥ 1024px):** 2-column grid. Left col = 5/12 (form). Right col = 7/12 (video). Vertical center align.
- **Tablet (768–1023px):** stacked. Form first, video below. Video aspect-ratio constrained to 16:9.
- **Mobile (375–767px):** stacked, form full-width. Video collapses to 16:9 below.

### Left column — Preview form

- Eyebrow: `PROMPTDEMO` in 11px uppercase, letter-spacing 0.18em, color `brand-400` (`#a78bfa`)
- **Headline** (gradient text, white → brand-300): `From URL` / `to demo video.` / `Sixty seconds.` (3 lines, font-weight 800, letter-spacing -0.025em)
  - Fluid type: `clamp(40px, 6vw, 72px)` line-height 1.05
- **Subhead** (`text-gray-400`, font-size 16-18px): `Paste a link, pick an intent, ship a polished MP4. Powered by Claude + Remotion.`
- **Form fields** (uses existing JobForm component, but in "preview mode"):
  - URL input
  - Intent textarea with bilingual preset chips (existing IntentPresets component)
  - Duration select (10/30/60s — same as `/create`)
- **Primary CTA** (existing MagneticButton): `Try free →` with brand-500 background, brand-glow shadow `0 0 28px rgba(109, 40, 217, 0.6)`
- **Secondary CTA** (link, no chrome): `Watch the demo` — scrolls to a `#demo` anchor (the right-column video, but expanded inline if mobile)
- **Submit-when-signed-out interception:** form's onSubmit checks `useSession()`. If signed out, encodes `{ url, intent, duration }` as base64 query and redirects to `/api/auth/signin?callbackUrl=/create?prefill=<base64>`. The new `/create` page reads `prefill`, decodes, hydrates form state, auto-submits.

  **Known limitation:** very long intent text (the textarea max is 500 chars) can produce a base64 URL parameter that pushes total URL length toward common limits — Google OAuth's `state`+`callbackUrl` round-trip starts truncating around 2KB, and some browsers/proxies cap at ~8KB total. Form's URL field has its own URL-validation limit, so the practical worst case stays manageable, but isn't guaranteed safe. **v1 acceptable**; if we hit a 414 in practice, fall back to writing `{ url, intent, duration }` to `localStorage` under a TTL'd key (`promptdemo:pending-prefill`) and just use a stable `callbackUrl=/create?prefill=local`. The `/create` page reads from localStorage on mount and clears the key. Tracked in [followup #pending-prefill-storage].

### Right column — Demo video

- `<video>` element, attributes: `autoplay loop muted playsinline preload="auto"`, `aspect-ratio: 16/9`, full width of column
- Source: `/landing-hero-demo.mp4` (the 6.1 MB dogfooded file, served from `public/` after copy)
- Container: rounded-2xl, ring-1 ring-violet-500/20, drop-shadow-2xl with violet tint, slight scale on idle (`scale-[1.02]`) and pointer-events: none so click-to-play doesn't interfere
- Decorative glow halo: `radial-gradient` violet behind the video, blur-3xl, ~110% the video's bounding box
- Reduced-motion behavior: when `prefers-reduced-motion: reduce`, video pauses at frame 0 (poster image) and shows a "▶ Tap to play" overlay

### Backdrop (covers the full hero section, full-width)

- Base: `#0a0a14` (near-black violet-tinted)
- Two radial gradient blooms (matches the visual mockup):
  - `radial-gradient(circle at 25% 50%, rgba(109,40,217,0.45), transparent 60%)` — left bloom behind the form
  - `radial-gradient(circle at 80% 30%, rgba(167,139,250,0.25), transparent 50%)` — right bloom behind the video
- Grid overlay: `linear-gradient(rgba(167,139,250,0.06) 1px, transparent 1px)` + 90deg variant, `background-size: 40px 40px`, `opacity: 0.7`
- Subtle vignette at edges so the grid fades into black

---

## ~~Demo section~~ — REMOVED in user review

Original draft duplicated the hero video below the fold to "re-emphasize" on
mobile. The hero already stacks the video under the form on tablet/mobile
breakpoints, so the duplication wastes bandwidth and vertical space. Cut.

The `Watch the demo` secondary CTA in the hero now scrolls to the video element
inside the hero itself rather than to a separate section.

---

## Feature grid

### Section heading (the salvaged Option B tagline)

> **Ship the demo, not the screenshot.**

Centered above the grid, font-weight 700, letter-spacing -0.02em, gradient text (white → brand-300), `clamp(28px, 3.5vw, 44px)`. Subhead optional: small italic `gray-400` line below — `Three things make PromptDemo different from the slideshow exporters.`

### Grid layout

- **Desktop (≥ 768px):** 3-column flex/grid, equal width, gap-8
- **Mobile:** stack vertically, gap-6

### Card structure

Each card is a `<div>`:
- Glassmorphism surface: `bg-white/5`, `backdrop-blur-md`, `ring-1 ring-white/10`, `rounded-2xl`, `p-8`
- Hover: subtle `translateY(-4px)` and `ring-violet-500/30`, with a brand-color glow halo growing in (motion gated by `prefers-reduced-motion`)
- Icon at top: 48×48 square, brand-500 backdrop, white emoji or Lucide-React icon centered, `rounded-xl`
- Title: 22-24px, font-weight 700, white
- Body: 14-15px, `text-gray-400`, line-height 1.6, ~25-35 words

### The three features

**1. Zero-Touch Storyboarding**

> *Paste a URL. Claude crawls every section, picks the moments worth showing, and sequences them into scenes. You stay out of the timeline.*

Icon: `Wand` (auto-magic theme).

**2. Intent-Driven Directing**

> *Tell us the vibe — marketing trailer, tutorial walkthrough, default. Our pacing profiles auto-tune scene durations, transitions, and rhythm. Same crawl, four different cuts.*

Icon: `Compass` (direction theme).

**3. Studio-Grade Polish**

> *Spring physics. Frame-perfect timing. Real video output, not slideshow exports. Every shot rendered with Remotion at 30fps to broadcast-grade MP4.*

Icon: `Sparkles` or `Film` (production theme).

---

## Final CTA section

Single full-width section, centered:

- Headline: `Ready to ship it?` (gradient text, font-weight 800, `clamp(32px, 4vw, 56px)`)
- Subline: `Free tier ships 30 seconds of render every month. No card to start.` (gray-400, 16px)
- Single primary CTA — same MagneticButton, `Start for free →`, slightly larger than the hero's
- Backdrop: same violet bloom gradient + grid pattern, but with a stronger center glow (the section's the "exit ramp")

---

## Footer

Minimal, two rows, max-w-7xl:

**Row 1 — link clusters** (3 columns on desktop, stacked on mobile):

- *Product:* Pricing, Roadmap, Status
- *Build:* Source, Architecture, Design decisions (links to existing `docs/readme/`)
- *Legal:* Privacy, Terms, Contact

**Row 2 — bottom strip:**

- Left: PromptDemo wordmark + `Made with PromptDemo. Of course.`
- Right: copyright + version tag (`v2.1`)

Border-t at the row-1/row-2 boundary, `border-white/10`. Body text `gray-500`, hover `brand-300`. Links use the same focus ring as the rest of the app (existing pattern).

---

## Components to add

```
apps/web/src/
  app/
    page.tsx                    # MODIFIED — server reads session, renders MarketingLanding | JobForm
    create/page.tsx             # NEW — moved from current /; reads ?prefill=<base64>
    landing-preview/page.tsx    # NEW — dev-only debug route, always renders MarketingLanding
  components/
    landing/
      MarketingLanding.tsx      # NEW — orchestrates the 4 sections
      LandingHero.tsx           # NEW — split layout, contains the <video> + <PreviewForm/>
      LandingFeatures.tsx       # NEW — 3-column grid
      LandingFinalCTA.tsx       # NEW — bottom CTA section
      LandingFooter.tsx         # NEW — 2-row footer
      PreviewForm.tsx           # NEW — wraps existing JobForm, intercepts submit-when-signed-out
      LandingBackdrop.tsx       # NEW — reusable violet-bloom + grid overlay
public/
  landing-hero-demo.mp4         # NEW — copy from docs/readme/ during build OR symlink
```

---

## Accessibility + ui-ux-pro-max conformance

| ui-ux-pro-max rule | How this design satisfies it |
|---|---|
| 4/8px spacing rhythm | All paddings/gaps use Tailwind's 4-base scale (4/6/8/12/16/24/32) |
| 44×44 touch budgets | All CTAs ≥ 48×48 with ≥ 12px gap (already true in Phase 4) |
| Motion ≤ 400ms, transform/opacity only | Magnetic spring physics already conforms; backdrop blooms are static |
| `prefers-reduced-motion` gates | Video pauses, magnetic spring disabled, grid pulse disabled |
| 4.5:1 contrast | White-on-`#0a0a14` = 19.4:1; gray-400 on `#0a0a14` = 7.2:1 |
| Visible focus rings | Inherited from existing `focus-visible:ring-2 ring-brand-500` pattern |
| 4-state coverage | Form has loading (pending), empty (default placeholder), error (existing ErrorCard), success (redirect) |
| One primary CTA per screen | Hero: only one MagneticButton at `Try free`. Final CTA: only one button. Feature grid: zero CTAs |
| Mobile-first breakpoints | 375 / 768 / 1024 / 1440 stops; layout collapses gracefully |
| Image dimensions declared | `<video>` has `aspect-ratio: 16/9`; CLS = 0 |

---

## Out of scope for this spec

- **Pricing tease section** — already lives at `/billing`. Footer link is enough.
- **"How it works" 3-step section** — folded into the feature grid (the flow IS the feature for a URL→video product).
- **Testimonials / social proof** — no users to quote yet; revisit at 100 paid customers.
- **Animated scroll-triggered reveals on the feature grid** — over-engineering for v1; static grid loads cleanly.
- **A/B testing infrastructure for headline variants** — plumb later, after Stripe is wired and we can measure conversion.
- **Localization (zh-TW)** — landing copy stays English-only for v1. The locale toggle in the form (existing) already handles bilingual preset labels.

---

## Known limitations / Followups

- **`prefill` base64 URL length** (#pending-prefill-storage) — see Hero §"Submit-when-signed-out interception". v1 ships with the URL-encoded approach; promote to `localStorage` if we hit a 414 from any provider.
- **No A/B testing on hero copy** — single fixed headline ("From URL to demo video. Sixty seconds.") for v1. Variant infra plumbed once Stripe lands and we can measure conversion per variant.

---

## Self-review

- **Placeholders:** none.
- **Internal consistency:** Hero CTA "Try free →" (Q8.A) matches feature grid heading "Ship the demo, not the screenshot." (Q8.B salvaged). Submission interception path (`/api/auth/signin?callbackUrl=/create?prefill=...`) routes to `/create`, which is consistent with §"Page architecture". Section composition (Q3) updated post-review from 5 sections → 4 (LandingDemo removed); component inventory matches.
- **Scope check:** single spec, single sprint of implementation work. ~1 week solo. No dependency on Stripe, no schema changes, no new env vars beyond the existing ones.
- **Ambiguity check:** "Powered by Claude + Remotion" subhead is fixed text, not a clickable badge — could be misread as link. Decision: keep as flat text in v1; add hover-tooltip later if needed. The `Watch the demo` secondary CTA scrolls to the hero's own `<video>` (now no separate `#demo` anchor); IntersectionObserver-based "play when in view" is unnecessary since the video is already above the fold on desktop.

---

**Next step:** invoke `superpowers:writing-plans` once user approves this spec.

**Approval prompt for the user:**
> Spec written and committed to `docs/superpowers/specs/2026-04-25-marketing-landing-page-design.md`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan.
