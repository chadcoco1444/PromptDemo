# How to record the demo GIF

The README references `docs/readme/demo.gif`. To produce it — we dogfood by using LumeSpec to demo itself.

## Recommended workflow

### 1. Pick a URL to crawl

Any compelling product landing page works. Good candidates:
- `https://www.anthropic.com` — clean marketing layout, Claude brand color = our indigo, meta.
- `https://remotion.dev` — explicitly the tech stack LumeSpec uses, visually rich.
- `https://vercel.com` — dense feature grid that shows off our `collage` + `kenBurns` variants.
- Your own product URL — ship-ready demo.

I recommend **remotion.dev** because the output video literally shows off the renderer we use.

### 2. Submit via the UI

```powershell
# Make sure stack is up
pnpm lume start

# Open browser
start http://localhost:3001
```

In the UI:
1. Paste the URL.
2. Click the **Marketing Hype** preset chip.
3. Pick **30s** duration.
4. Click **Create video**.

### 3. Record the screen (from form submission through to MP4 playback)

**Windows (ScreenToGif, free):**
https://www.screentogif.com — `Record` button → frame the browser window → stop when you see the final video play → save as GIF.

**macOS:**
`Shift+Cmd+5` → select area → record → stop → converts to MP4. Use the ffmpeg step below to turn it into a GIF.

**Target duration**: 15-25 seconds. Include:
- (2s) The form with the URL + preset chip selected
- (1s) Click Create, show the navigation to `/jobs/[id]`
- (8-12s) Progress rail advancing through crawl → storyboard → render
- (4-6s) Final video playing inline in the VideoResult component

### 4. Compress to GIF

Target: < 5 MB, 720px wide, ~10-15 fps.

```bash
# From MP4 to GIF (best quality with palette generation)
ffmpeg -i raw.mp4 -vf "fps=12,scale=720:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i raw.mp4 -i palette.png -filter_complex "fps=12,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse" docs/readme/demo.gif
```

Or one-shot if you're OK with slightly worse palette:

```bash
ffmpeg -i raw.mp4 -vf "fps=12,scale=720:-1:flags=lanczos" -loop 0 docs/readme/demo.gif
```

If the GIF is over 5MB, drop fps to 10 or scale to 640.

### 5. Commit

```bash
git add docs/readme/demo.gif
git commit -m "docs(readme): add demo GIF (LumeSpec dogfooding remotion.dev)"
git push
```

## Alternative: host the MP4 externally

If repo size matters, skip the GIF and upload the MP4 to YouTube / Vimeo / a personal CDN. Replace the `<img src="docs/readme/demo.gif">` tag with:

```html
<a href="https://youtu.be/YOUR_VIDEO_ID">
  <img src="https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg" alt="Watch the demo" width="720" />
</a>
```

## Current state

There's no `demo.gif` yet — the README's first `<img>` tag will 404 on GitHub until you drop the file in. Until then, the README still reads cleanly (GitHub just shows a broken-image icon); the architecture SVG lower down carries the visual weight.
