# CRUIS'N BEANS

A loving 90s arcade parody racer in the spirit of the great mid-90s cabinet
cruisers: behind-the-car 3D, saturated chunky sprites, checkpoints, a
3-2-1-GO countdown, big air, and a turbo system powered entirely by beans.

**Play it:** open `index.html` from any static host (GitHub Pages ready).

## The racers

| Racer | Ride |
|-------|------|
| ANDY  | Red Stallion 5.0 convertible, roof off |
| ADAM  | Silent Three, roof (and glass) surgically removed |
| LANCE | Desert Dreamer van with a hand-painted sunset mural |
| ELON  | Chrome Roadster, cartoon smirk included |

## The cruises

- **HAWAII COAST** — palms, ocean, cruise-ship billboards
- **DESERT HIGHWAY** — cacti, mesas, heat shimmer
- **TEQUILA TOWN** — talavera tiles, papel picado, neon cantina

## How to play

- **Gas is automatic.** Drag left/right (or arrow keys / A-D) to steer.
- **BRAKE** button (or S / down arrow) for the two people who brake.
- **FART!** button (or Space) dumps a green turbo boost. It burns BEANS —
  drive through bean cans to refill the meter. Empty beans, no turbo.
- Hit **CHECKPOINT** arches to add time. Three laps, roughly three minutes.
- Ramps give BIG AIR and a little bonus time.
- Mute button top-right (or M). Landscape only — it's a widescreen cabinet.

## Tech

- Three.js (vendored in `vendor/`), no build step, no CDN, no accounts, no IAP.
- All scenery textures are generated at runtime on canvases; the racers and
  cars are digitized-style sprites in `assets/img/` (chroma-keyed from the
  magenta masters in `art/` via `tools/process_art.py`).
- All audio is synthesized with WebAudio — including the fart.
- Adaptive render resolution targets 60 fps on phones.

## GitHub Pages

Serve from the repository root (`main` branch, `/` folder). A `.nojekyll`
file is included.

*Parody. Not affiliated with any real racing game, car company, or bean.*
