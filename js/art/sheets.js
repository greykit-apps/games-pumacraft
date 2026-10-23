/* PumaCraft art -- the baked sheets, loaded and dressed in team colours.
 *
 * Sheets are the PNGs tools/bake-art.js wrote (js/art/atlas.js says where
 * every frame is). A sprite's team-colour parts were painted in five
 * sentinel magentas (js/art/pal.js); a player's copy of a sheet is the sheet
 * with those five repainted in that player's ramp, made the first time it
 * is drawn and kept. */
"use strict";
(() => {
  const SENTINEL = PC.PAL.team.map(PC.Paint.hex);
  /* each player's colour, as a five-step ramp lightest first */
  const TEAMS = [
    ["#ffb0a8", "#ff5a4c", "#d8322a", "#9a1c1c", "#5c1010"],   /* red */
    ["#a8d0ff", "#4c9cff", "#2a6ad8", "#1c449a", "#10285c"],   /* blue */
    ["#b0ffe0", "#40e0b0", "#20a880", "#147458", "#0c4434"],   /* teal */
    ["#e8c0ff", "#b070f0", "#8048c8", "#56308c", "#341c54"],   /* violet */
    ["#ffd8a0", "#ffa040", "#d87020", "#9a4c14", "#5c2c0c"],   /* orange */
    ["#e0c8a8", "#b0906c", "#86684a", "#5c4632", "#36281c"],   /* brown */
    ["#ffffff", "#dce0e8", "#b0b6c4", "#80869a", "#4c5060"],   /* white */
    ["#fff8b0", "#ffe040", "#d8b020", "#9a7c14", "#5c480c"],   /* yellow */
    ["#d8d8d8", "#a8a8a8", "#7c7c7c", "#545454", "#303030"],   /* neutral */
  ].map(r => r.map(PC.Paint.hex));

  const S = PC.Sheets = { TEAMS, images: Object.create(null), dressed: Object.create(null), ready: false };

  /** Loads every sheet; resolves when all are decoded. */
  S.load = () => Promise.all(Object.entries(PC.ATLAS.sheets).map(([name, sh]) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { S.images[name] = img; res(); };
    img.onerror = () => rej(new Error("could not load " + sh.src));
    img.src = sh.src;
  }))).then(() => { S.ready = true; });

  /** The sheet as player p draws it: a canvas, made once. */
  S.sheet = (name, p) => {
    const key = name + "/" + p;
    if (S.dressed[key]) return S.dressed[key];
    const img = S.images[name], c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data, ramp = TEAMS[Math.min(p, TEAMS.length - 1)];
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] !== 255 || px[i + 1] !== 0) continue;   /* every sentinel has no green */
      for (let k = 0; k < 5; k++) {
        const s = SENTINEL[k];
        if (px[i] === s[0] && px[i + 2] === s[2]) { px[i] = ramp[k][0]; px[i + 1] = ramp[k][1]; px[i + 2] = ramp[k][2]; break; }
      }
    }
    g.putImageData(d, 0, 0);
    return (S.dressed[key] = c);
  };
})();
