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

- **HAWAII COAST** (target 2:25) — ocean highway through the Aloha gateway,
  past cruise ships to a smoking volcano,
  jungle shortcut, seagulls and wild pigs
- **DESERT HIGHWAY** (target 2:32) — US-66 gateway toward the mesas, dry riverbed shortcut,
  cows and armadillos, heat shimmer
- **TEQUILA TOWN** (target 2:14) — agave fields into a town you drive THROUGH: gate arch,
  street canyon, papel picado, donkeys, neon cantina finish

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
- **Checkpoints add time.** Clock at zero before the finish = DNF.
- **Beans are a snack, not a system:** cans give +0.5s (+1.5s if you grab
  them mid-wheelie) and a proud little green cloud.
- One **SHORTCUT** per stage — watch for the purple sign, leave the road.
- **C** cycles High Chase, Arcade Chase, and Bumper cameras.
- Mute button top-right (or M). Landscape only — it's a widescreen cabinet.

## Tech

- Three.js (vendored in `vendor/`), no build step, no CDN, no accounts, no IAP.
- Select-screen racers and cars are digitized-style sprites (`assets/img/`, keyed from the
  magenta masters in `art/` via `tools/process_art.py`; reference photos in
  `art/ref/`). On-track named cars use high-resolution, centered rear art and
  remain camera-facing while pitch/roll sells wheelies, flips, and spinouts.
- Each stage uses authored panoramic art plus lit, crossed-plane roadside
  scenery. Roads are built from
  segment lists (bend/elevation/zone) into one long spline road with chunked
  geometry for frustum culling and far landmark draw distance.
- Audio uses synthesized WebAudio for the engine, horns, animals, and wheelie
  exhaust, optional browser speech for the cheesy announcer, and the bundled
  3:27 song **CRUIS'N THE WORLD** by jfeldman9.
- Adaptive render resolution targets 60 fps on phones.
- Test helpers: `?time=300` (big clock), `?short=1` (start near the finish).

## GitHub Pages

Serve from the repository root (`main` branch, `/` folder). A `.nojekyll`
file is included.

*Parody. Not affiliated with any real racing game, car company, or bean.*
