# PumaCraft: development

Plain scripts, no build step, nothing fetched at play time. Serve the repo root over http (`python3 -m http.server 8790`) and open it; `?hold=always` forces the boot's hold, `?rare` the rare boot line.

## What is where

| Path | What |
|---|---|
| `js/gk-title.js`, `js/gk-intro.js`, `css/gk-tokens.css`, `tools/check-assets.js` | games-meta canon, copied byte for byte. Change them there, never here. |
| `js/store.js` | Every storage key, and Forget everything. |
| `js/audio.js` | The sound buses and the title theme, all synthesised. |
| `js/scene.js` | The title's scene, painted into a 320x180 buffer. |
| `js/main.js` | The title, its menu, Settings, Help and About. |
| `js/engine/` | The simulation: DOM-free and deterministic. `const.js` says the rules that keep it so. |
| `js/data/` | Each faction's units and buildings, in the original's measures (`js/engine/data.js` converts them). |
| `js/maps/` | Maps, one character a tile (`js/engine/map.js` has the key). |
| `tools/png.js` | The PNG and ICO writers. |
| `tools/lib.js` | Loads the engine headless, in `index.html`'s own script order. |

## The engine's contract

The same seed and the same commands give the same game, tick for tick, on any machine: that is what saves, replays, the headless checks and one day lockstep multiplayer stand on. So under `js/engine/` positions are integers in fixed point (1/256 px), angles come from the committed tables in `tables.js` (written by `tools/gen-tables.js`), roots from `isqrt`, chance from the state's own PRNG, and every piece of state is a typed array registered in `W.state` so it is saved and hashed. The UI and the AI change the game only through `PC.Orders.issue`.

The art baker, the renderer and the rest arrive milestone by milestone.

## Checks

```
node tools/check-assets.js        # every file the page names is in the repo
node tools/stamp-assets.js        # restamp script and stylesheet URLs after an edit (CI runs --check)
node tools/lint-determinism.js    # nothing in js/engine/ that can differ between machines
node tools/gen-tables.js          # rewrite the trig tables (CI runs --check)
node tools/sim-check.js --seeds 3 # played headless: twice alike, a save played on, the replay, units where they may stand
```

## Icons and the share card

```
node tools/make-icons.js          # icon.svg and the favicons, from the drawing in the script
../../greykit-meta/tools/make-assets.sh . --accent '#54f2ff' --bg '#05070f' --wordmark 'Puma[Craft]' --font mono \
  --desc 'Real-time strategy in the Grey Reach: three asymmetric powers, bases, armies and an economy to run, painted 16-bit pixel art and a score that follows the battle.' \
  --tagline 'Real-time strategy · In the making'   # og.png and apple-touch-icon.png, from icon.svg
```
