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
| `tools/png.js` | The PNG and ICO writers. |

The engine (`js/engine/`, DOM-free and deterministic, played headless by a bot in CI), the art baker and the rest arrive milestone by milestone.

## Checks

```
node tools/check-assets.js        # every file the page names is in the repo
node tools/stamp-assets.js        # restamp script and stylesheet URLs after an edit (CI runs --check)
```

## Icons and the share card

```
node tools/make-icons.js          # icon.svg and the favicons, from the drawing in the script
../../greykit-meta/tools/make-assets.sh . --accent '#54f2ff' --bg '#05070f' --wordmark 'Puma[Craft]' --font mono \
  --desc 'Real-time strategy in the Grey Reach: three asymmetric powers, bases, armies and an economy to run, painted 16-bit pixel art and a score that follows the battle.' \
  --tagline 'Real-time strategy · In the making'   # og.png and apple-touch-icon.png, from icon.svg
```
