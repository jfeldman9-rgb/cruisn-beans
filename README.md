# CRUIS'N BEANS

A loving 90s arcade parody racer in the spirit of the great mid-90s cabinet
cruisers: point-to-point highway stages, oncoming traffic, a checkpoint
clock, double-tap-gas wheelies, flips off ramps, hittable cows, and beans.
Lots of beans.

**Play it:** open `index.html` from any static host (GitHub Pages ready).

## The racers (plus 3 generic cabinet rivals in the pack)

| Racer | Ride |
|-------|------|
| ANDY  | Red Stallion 5.0 convertible, roof off |
| ADAM  | Silent Three, roof (and glass) surgically removed |
| LANCE | Desert Dreamer van with a hand-painted sunset mural |
| ELON  | Chrome Roadster, cartoon smirk included |

## The stages (point-to-point, ~3 minutes each)

- **HAWAII COAST** — ocean highway past cruise ships to a smoking volcano,
  jungle shortcut, seagulls and wild pigs
- **DESERT HIGHWAY** — US-66 toward the mesas, dry riverbed shortcut,
  cows and armadillos, heat shimmer
- **TEQUILA TOWN** — agave fields into a town you drive THROUGH: gate arch,
  street canyon, papel picado, donkeys, neon cantina finish

## How to play

- **Gas is automatic.** Drag left/right (or arrows / A-D) to steer.
- **DOUBLE-TAP GAS** (the fat pedal, the road, or Up/W — or just Space)
  = **WHEELIE**: nose up, speed burst, and it **leapfrogs oncoming
  traffic** if you time it.
- **Stunts pay time:** flips off ramps (+3s, double-tap gas in the air),
  side flips (double-tap a steer key in the air), two-wheel driving
  (double-tap a steer key on the ground), big air, leapfrogs.
- **Oncoming traffic hurts.** Hit a truck at speed and you'll spin out and
  watch the pack eat you. The rubber band gives you a chance to claw back.
- **Checkpoints add time.** Clock at zero before the finish = DNF.
- **Beans are a snack, not a system:** cans give +0.5s (+1.5s if you grab
  them mid-wheelie) and a proud little green cloud.
- One **SHORTCUT** per stage — watch for the purple sign, leave the road.
- Mute button top-right (or M). Landscape only — it's a widescreen cabinet.

## Tech

- Three.js (vendored in `vendor/`), no build step, no CDN, no accounts, no IAP.
- Racers and cars are digitized-style sprites (`assets/img/`, keyed from the
  magenta masters in `art/` via `tools/process_art.py`; reference photos in
  `art/ref/`). On-track cars swap between rear/front 3/4 sprites with
  mirroring by view angle, and pitch/roll for wheelies, flips, and spinouts.
- All scenery textures are runtime-generated canvases; stages are built from
  segment lists (bend/elevation/zone) into one long spline road with chunked
  geometry for frustum culling and far landmark draw distance.
- All audio is synthesized with WebAudio — engine, chip music, horns, moos,
  and the wheelie exhaust.
- Adaptive render resolution targets 60 fps on phones.
- Test helpers: `?time=300` (big clock), `?short=1` (start near the finish).

## GitHub Pages

Serve from the repository root (`main` branch, `/` folder). A `.nojekyll`
file is included.

*Parody. Not affiliated with any real racing game, car company, or bean.*
