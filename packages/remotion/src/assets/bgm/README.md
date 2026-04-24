# BGM Tracks

This directory holds four royalty-free MP3 tracks keyed by mood:

- `upbeat.mp3`
- `cinematic.mp3`
- `minimal.mp3`
- `tech.mp3`

## Licensing

These files are NOT checked in. Supply your own royalty-free or licensed tracks,
matched 1:1 by filename. Recommended sources:

- https://uppbeat.io (free tier with attribution)
- https://pixabay.com/music
- https://freemusicarchive.org (CC licenses)

Recommended properties: 30s–90s loopable, -14 LUFS master level, MP3 128kbps+.
Remotion will fade in/out over 20 frames (~0.67s) at composition edges via
`BGMTrack` in `src/primitives/BGMTrack.tsx`.

## Remotion static files

`staticFile('bgm/upbeat.mp3')` resolves to this path at render time. See
https://www.remotion.dev/docs/staticfile for resolution rules.
