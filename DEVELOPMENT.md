# PumaCraft: development

Plain scripts, no build step, nothing fetched at play time. Serve the repo root over http (`python3 -m http.server 8790`) and open it; `?hold=always` forces the boot's hold, `?rare` the rare boot line, `?sandbox` goes straight to the practice range.

## What is where

| Path | What |
|---|---|
| `js/gk-title.js`, `js/gk-intro.js`, `css/gk-tokens.css`, `tools/check-assets.js` | games-meta canon, copied byte for byte. Change them there, never here. |
| `js/store.js` | Every storage key, and Forget everything. |
| `js/audio.js` | The sound buses and the title theme, all synthesised. |
| `js/scene.js` | The title's scene, painted into a 320x180 buffer. |
| `js/main.js` | The title, its menu, Settings, Help and About. |
| `js/engine/` | The simulation: DOM-free and deterministic. `const.js` says the rules that keep it so; `sim.js` the order of a tick. Movement (`nav.js`, `orders.js`), the fight (`combat.js`), the economy (`economy.js`), who sees what (`vision.js`). |
| `js/data/` | Each faction's units and buildings, in the original's measures (`js/engine/data.js` converts them). |
| `js/maps/` | Maps, one character a tile (`js/engine/map.js` has the key). |
| `js/art/paint.js`, `js/art/pal.js` | The painter and its palette: sprites are small 3D part models, ray-cast a pixel at a time and lit by one sun. |
| `js/art/recipes/` | What every sprite and ground tile is painted from. |
| `art/`, `js/art/atlas.js` | The baked sheets and where every frame is in them. Written by `tools/bake-art.js`; never edit by hand. |
| `js/art/sheets.js` | Loads the sheets and repaints the team magentas in each player's colour. |
| `js/render/` | The ground in cached chunks, the units, the fog and minimap, the view and the frame loop. |
| `js/ui/play.js` | The play screen: selection, the smart right-click, the command card, building, control groups, the HUD. |
| `js/ui/skirmish.js`, `js/ui/saves.js`, `js/ui/sheet.js` | Setting up a skirmish; the save slots, autosave and files; the game's own sheets. |
| `js/practice.js` | The practice range on the Proving Ground; `?sandbox` opens it straight away. |
| `js/engine/mapgen.js` | Maps from a seed, fair by turning; `tools/mapgen-preview.html` shows them. |
| `js/engine/ai.js`, `js/data/ai_a.js` | The computer opponent, inside the engine and as deterministic as the rest; how it plays each faction. |
| `js/audio/sfx.js` | Every sound effect, synthesised, panned by where it happens. |
| `tools/png.js` | The PNG and ICO writers. |
| `tools/lib.js` | Loads the engine headless, in `index.html`'s own script order. |

## The engine's contract

The same seed and the same commands give the same game, tick for tick, on any machine: that is what saves, replays, the headless checks and one day lockstep multiplayer stand on. So under `js/engine/` positions are integers in fixed point (1/256 px), angles come from the committed tables in `tables.js` (written by `tools/gen-tables.js`), roots from `isqrt`, chance from the state's own PRNG, and every piece of state is a typed array registered in `W.state` so it is saved and hashed. The UI and the AI change the game only through `PC.Orders.issue`.

## The art

Nothing is drawn by hand and nothing is drawn at play time: every sprite is a recipe in `js/art/recipes/`, baked to PNG sheets that are committed. After changing a recipe or the palette, run `node tools/bake-art.js` and commit `art/`, `js/art/atlas.js` and `index.html` together; CI's `--check` fails on a stale sheet. `tools/sheet.html` shows every recipe live, every facing and frame, in any team colour. `node tools/bake-art.js --preview KEY OUT.png [SCALE] [ANIM]` writes a contact sheet. The five magentas of the `team` ramp belong to team colour alone.

The rest arrives milestone by milestone.

## Checks

```
node tools/check-assets.js        # every file the page names is in the repo
node tools/stamp-assets.js        # restamp script and stylesheet URLs after an edit (CI runs --check)
node tools/lint-determinism.js    # nothing in js/engine/ that can differ between machines
node tools/gen-tables.js          # rewrite the trig tables (CI runs --check)
node tools/sim-check.js --seeds 3 # played headless: twice alike, a save played on, the replay, units where they may stand
node tools/mapgen-check.js        # the generator over many seeds (CI runs --seeds 40)
node tools/data-check.js          # every unit has art, no hotkey twice
node tools/bake-art.js --check    # the sheets are what the recipes paint
```

## Icons and the share card

```
node tools/make-icons.js          # icon.svg and the favicons, from the drawing in the script
../../greykit-meta/tools/make-assets.sh . --accent '#54f2ff' --bg '#05070f' --wordmark 'Puma[Craft]' --font mono \
  --desc 'Real-time strategy in the Grey Reach: three asymmetric powers, bases, armies and an economy to run, painted 16-bit pixel art and a score that follows the battle.' \
  --tagline 'Real-time strategy · In the making'   # og.png and apple-touch-icon.png, from icon.svg
```
