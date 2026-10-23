/* PumaCraft render -- the fog of war, and the minimap.
 *
 * Fog: one small image a pixel a tile, covering the tiles in view, black
 * where the viewer has never been, dimmed where they have been but cannot
 * see now, clear where they see. Drawn scaled up 24 times with smoothing
 * on, so its edges are soft without a pixel of extra work.
 *
 * The minimap: the whole map, a pixel or so a tile, terrain once, then the
 * units as dots (the viewer's green, allies yellow, enemies red, resources
 * amber), the fog over it and the view's frame on top. */
"use strict";
(() => {
  const C = PC.C, F = C.F, CLS = PC.Map.CLS, T = C.TILE;
  const Fog = PC.RenderFog = {};
  let cv = null, g = null, img = null;

  Fog.draw = (ctx, W, me, camX, camY, vw, vh, ox, oy) => {
    if (me < 0) return;
    const map = W.map, vis = W.vis[me], bit = 1 << me;
    const tx0 = Math.max(0, Math.floor(camX / T) - 1), ty0 = Math.max(0, Math.floor(camY / T) - 1);
    const tx1 = Math.min(map.w - 1, Math.floor((camX + vw) / T) + 1), ty1 = Math.min(map.h - 1, Math.floor((camY + vh) / T) + 1);
    const w = tx1 - tx0 + 1, h = ty1 - ty0 + 1;
    if (!cv || cv.width !== w || cv.height !== h) { cv = document.createElement("canvas"); cv.width = w; cv.height = h; g = cv.getContext("2d"); img = g.createImageData(w, h); }
    const px = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = (ty0 + y) * map.w + tx0 + x, i = (y * w + x) * 4;
      px[i] = 5; px[i + 1] = 7; px[i + 2] = 15;
      px[i + 3] = vis[t] ? 0 : (W.explored[t] & bit) ? 150 : 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, ox + tx0 * T - camX - T / 2, oy + ty0 * T - camY - T / 2, w * T + T, h * T + T);
    ctx.restore();
  };

  /* ---- the minimap ---- */
  const MM = PC.RenderMinimap = {};
  let base = null, baseFor = null;
  const TERRAIN = { [CLS.GROUND]: ["#5c4632", "#7a5c40", "#9a7a54"], [CLS.RAMP]: ["#86684a"], [CLS.ROCK]: ["#3c3a38"], [CLS.WATER]: ["#1e4a74"], [CLS.TREES]: ["#2e3c22"], [CLS.CLIFF]: ["#2a2622"] };
  function bake(W, size) {
    const map = W.map, c = document.createElement("canvas");
    c.width = c.height = size;
    const g2 = c.getContext("2d"), s = size / Math.max(map.w, map.h);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = y * map.w + x, cols = TERRAIN[map.cls[t]] || ["#000"];
      g2.fillStyle = cols[Math.min(cols.length - 1, map.height[t])];
      g2.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
    }
    return c;
  }
  /** Draws the minimap of W for viewer me into canvas context mg (size x size). */
  MM.draw = (mg, size, W, me, camX, camY, vw, vh) => {
    const map = W.map;
    if (baseFor !== W.map) { base = bake(W, size); baseFor = W.map; }
    mg.drawImage(base, 0, 0);
    const s = size / Math.max(map.w, map.h), bit = 1 << Math.max(0, me);
    /* fog first, then dots over it where seen */
    if (me >= 0) {
      const vis = W.vis[me];
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const t = y * map.w + x;
        if (vis[t]) continue;
        mg.fillStyle = (W.explored[t] & bit) ? "rgba(5,7,15,.55)" : "#05070f";
        mg.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
      }
    }
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE) || !PC.RenderSprites.shown(W, i)) continue;
      const p = W.owner[i], t = PC.Data.types[W.type[i]];
      mg.fillStyle = p === me ? "#4ade6a" : p >= C.MAX_PLAYERS ? "#ffb000" : (W.players[p] && W.players[me] && W.players[p].team === W.players[me].team) ? "#ffe040" : "#ff5266";
      const d = t.foot ? Math.max(2, Math.round(t.foot[0] * s)) : 2;
      mg.fillRect(Math.round(W.x[i] / C.TILE_FP * s - d / 2), Math.round(W.y[i] / C.TILE_FP * s - d / 2), d, t.foot ? Math.max(2, Math.round(t.foot[1] * s)) : 2);
    }
    mg.strokeStyle = "#dbe4fb"; mg.lineWidth = 1;
    mg.strokeRect(Math.round(camX / T * s) + 0.5, Math.round(camY / T * s) + 0.5, Math.round(vw / T * s), Math.round(vh / T * s));
  };
  MM.reset = () => { baseFor = null; };
})();
