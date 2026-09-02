# CRUIS'N BEANS

A loving 90s arcade parody racer in the spirit of the great mid-90s cabinet
cruisers: point-to-point highway stages, oncoming traffic, a checkpoint
clock, double-tap-gas wheelies, flips off ramps and road crests, hittable
cows, and beans.
Lots of beans.

**Play it:** open `index.html` from any static host (GitHub Pages ready).

## The racers (plus 3 generic cabinet rivals in the pack)

| Racer | Ride |
|-------|------|
| ANDY  | Red Stallion 5.0 convertible, roof off |
| ADAM  | Silent Three, roof (and glass) surgically removed |
| LANCE | Desert Dreamer van with a hand-painted sunset mural |
| ELON  | Chrome Roadster, cartoon smirk included |

## The stages (point-to-point cabinet targets)

- **HAWAII COAST** (target 2:25) — a clifftop coast road with the Pacific
  dropping away on the right the whole stage: Aloha gateway, Waikiki towers,
  Diamond Head, a lighthouse, surf, beach palms, lava flats under a smoking
  volcano, jungle shortcut inland, seagulls and wild pigs
- **DESERT HIGHWAY** (target 2:32) — US-66 gateway, canyon, then real buttes
  you pass on the way to the mesas; dry riverbed shortcut,
  cows and armadillos, heat shimmer
- **TEQUILA TOWN** (target 2:14) — agave fields into a town you drive THROUGH: gate arch,
  adobe street canyon with corners, papel picado, donkeys, neon cantina finish

## How to play

- **Gas is automatic.** Drag left/right (or arrows / A-D) to steer.
- **DOUBLE-TAP GAS** (the fat pedal, the road, or Up/W — or just Space)
  = **WHEELIE**: nose up, speed burst, and it **leapfrogs oncoming
  traffic** if you time it.
- **Stunts pay time:** flips off ramps or natural road crests (+3s on the clock and -3s from the
  official recorded time; double-tap gas in the air),
  side flips (double-tap a steer key in the air), two-wheel driving
  (double-tap a steer key on the ground), big air, leapfrogs.
- **Oncoming traffic hurts.** Hit a truck at speed and you'll spin out and
  watch the pack eat you. The rubber band gives you a chance to claw back.
  Traffic is 3D (semis, buses, sedans with spinning wheels); a wheelie clears
  slow same-way traffic too, not only the wrong-way truck.
- **Checkpoints add time.** Clock at zero before the finish = DNF.
- **Beans are a snack, not a system:** cans give +0.5s (+1.5s if you grab
  them mid-wheelie) and a proud little green cloud.
- One **SHORTCUT** per stage — watch for the purple sign, leave the road.
- **C** cycles Arcade Chase (default: low, wide, FOV and shake climb with
  speed), High Chase, and Bumper cameras.
- Mute button top-right (or M). Landscape only — it's a widescreen cabinet.

## WORLD TOUR

Pick **WORLD TOUR** under the stage cards to run Hawaii → Desert → Tequila
back to back. Every stage pays arcade points by place (10/8/6/5/4/3/2),
standings carry between legs, **NEXT STAGE** keeps the tour rolling, and a
DNF ends it. Top the table after Tequila Town and you are **WORLD CHAMPION**.

## Records

Each stage keeps its three fastest official times, and the tour keeps one
champion, all on this device (localStorage). Beat the board and the results
screen opens a cabinet-style initials entry: tap a letter, use the arrows, or
just type. Bests show on the stage cards, the results strip, and the title.

## Tech

- Three.js (vendored in `vendor/`), no build step, no CDN, no accounts, no IAP.
- Select-screen racers and cars are digitized-style sprites (`assets/img/`, keyed from the
  magenta masters in `art/` via `tools/process_art.py`; reference photos in
  `art/ref/`). On-track named cars use high-resolution, centered rear art and
  remain camera-facing while pitch/roll sells wheelies, flips, and spinouts.
- Each stage uses authored panoramic art plus lit, crossed-plane roadside
  scenery. The panorama scrolls with the camera's heading (mirrored wrap, no
  seam) so landmarks keep a fixed compass direction through bends. Roads are
  built from segment lists (bend/elevation/zone) into one long spline road
  with chunked geometry for frustum culling and far landmark draw distance,
  plus a short run-off past FINISH for the finish crane camera.
- Hero landmarks are real geometry, not cards: Diamond Head is a vertex-colored
  tuff cone, the Desert buttes are banded flat-tops, Waikiki towers and Tequila
  blocks are textured boxes. Hawaii is a `coast` stage: there is no ground
  plane; land is a ribbon inland of the road and the sea sits 12 units below
  it behind a cliff, beach, animated surf line and guardrail
  (`Track.buildCoast`).
- Traffic is procedural low-poly 3D (`js/vehicles.js`): semis, buses, and
  sedans with wheels that spin, drawn out to 2000 units.
- Build badge (bottom right) and the `?v=` cache-bust on every module change
  together per release so a stale Pages preview is obvious.
- HUD: analog speedo needle, checkpoint clock, place, progress bar. Phones get
  haptics (vibration) on wheelies, checkpoints, bumps, piles, and the finish.
- Audio uses synthesized WebAudio for the engine, horns, animals, and wheelie
  exhaust, optional browser speech for the cheesy announcer, and the bundled
  3:27 song **CRUIS'N THE WORLD** by jfeldman9.
- Adaptive render resolution targets 60 fps on phones.
- Test helpers: `?time=300` (big clock), `?short=1` (start near the finish),
  `?seed=N` (deterministic layout).
- Tests (`node tests/<name>.mjs`, no install needed): `acceptance`,
  `tour-smoke`, `racer-splits`, `world-geometry`, `records-tour`,
  `hawaii-identity` (the five-point "is this Hawaii / does it feel fast" bar:
  landmark visible in the first ten seconds, sea below the road with a
  sightline to the surf, 3D traffic you can leapfrog, camera FOV/shake/scale,
  fog and stunt economy), `audio-state`, `audio-assets`. `canvas-smoke` and
  `visual-assets` also need `@napi-rs/canvas`.

## GitHub Pages

Serve from the repository root (`main` branch, `/` folder). A `.nojekyll`
file is included.

*Parody. Not affiliated with any real racing game, car company, or bean.*
