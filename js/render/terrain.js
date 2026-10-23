/* PumaCraft render -- the ground, from the terrain sheet.
 *
 * The map is drawn in chunks of 8 x 8 tiles, each painted once into a
 * canvas of its own and kept, so a frame blits a handful of chunks rather
 * than hundreds of tiles. A chunk is repainted when something marks it
 * dirty (a building's footprint, later; creep).
 *
 * Each tile picks its art from what it is: ground of its level, a ramp,
 * rock, water, woods, or a cliff face over its level's ground, the face
 * chosen by which of its four sides drop to lower ground. Variants are
 * chosen by a hash of the tile's position, so the map looks the same every
 * time it is drawn. */
"use strict";
(() => {
  const C = PC.C, CLS = PC.Map.CLS, T = C.TILE, CH = 8;
  const Tr = PC.RenderTerrain = { CH };
  const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

  /** Clears the cache (a new map). */
  Tr.reset = map => { Tr.map = map; Tr.chunks = Object.create(null); };
  Tr.dirty = (tx, ty) => { delete Tr.chunks[Math.floor(tx / CH) + "," + Math.floor(ty / CH)]; };

  function tileArt(map, x, y) {
    const w = map.w, i = y * w + x, cls = map.cls[i], h = map.height[i], v = hash(x, y);
    const A = PC.ATLAS.tiles, pick = key => { const vs = A[key].v; return vs[v % vs.length]; };
    if (cls === CLS.ROCK) return [pick("rock")];
    if (cls === CLS.WATER) return [pick("water")];
    if (cls === CLS.TREES) return [pick("trees")];
    if (cls === CLS.RAMP) return [pick("ramp")];
    const base = pick("ground" + Math.min(2, h));
    if (cls !== CLS.CLIFF) return [base];
    /* the sides that drop: N 1, E 2, S 4, W 8 */
    let mask = 0;
    const lower = (nx, ny) => nx >= 0 && ny >= 0 && nx < w && ny < map.h && map.cls[ny * w + nx] !== CLS.RAMP && map.height[ny * w + nx] < h;
    if (lower(x, y - 1)) mask |= 1; if (lower(x + 1, y)) mask |= 2; if (lower(x, y + 1)) mask |= 4; if (lower(x - 1, y)) mask |= 8;
    /* a corner drop with no side drop: show the face on the side the corner leans to */
    if (!mask) { if (lower(x + 1, y + 1) || lower(x - 1, y + 1)) mask = 4; else if (lower(x + 1, y - 1) || lower(x - 1, y - 1)) mask = 1; }
    return [base, A.cliff.v[mask]];
  }

  /* smooth noise in world pixels, for the broad strokes across the map */
  const vnoise = (x, y, s, seed) => {
    const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const g = (i, j) => (hash(i * 7 + seed, j * 13 - seed) & 0xffff) / 65535;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  function paintChunk(cx, cy) {
    const map = Tr.map, c = document.createElement("canvas"), S = CH * T;
    c.width = c.height = S;
    const g = c.getContext("2d"), sheet = PC.Sheets.images.terrain, A = PC.ATLAS.tiles;
    for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
      const x = cx * CH + tx, y = cy * CH + ty;
      if (x >= map.w || y >= map.h) continue;
      for (const [sx, sy] of tileArt(map, x, y)) g.drawImage(sheet, sx, sy, T, T, tx * T, ty * T, T, T);
    }
    /* the broad strokes: darker and paler drifts, and green where the low
       ground holds water, across tile edges as if the ground were one piece */
    const img = g.getImageData(0, 0, S, S), px = img.data;
    for (let py = 0; py < S; py++) for (let qx = 0; qx < S; qx++) {
      const wx = cx * S + qx, wy = cy * S + py, t = Math.floor(wy / T) * map.w + Math.floor(wx / T);
      if (wx >= map.w * T || wy >= map.h * T) continue;
      const cls = map.cls[t];
      if (cls !== CLS.GROUND && cls !== CLS.RAMP && cls !== CLS.CLIFF) continue;
      const i = (py * S + qx) * 4;
      const n1 = vnoise(wx, wy, 72, 3), n2 = vnoise(wx, wy, 23, 5), shade = (n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.1;
      const green = map.height[t] === 0 ? Math.max(0, vnoise(wx, wy, 48, 9) - 0.55) * 1.6 : 0;
      /* quantised to steps of 1/16, so the drifts band like the rest of the palette */
      const k = 1 + Math.round(shade * 16) / 16;
      px[i] = Math.min(255, px[i] * k * (1 - green * 0.25));
      px[i + 1] = Math.min(255, px[i + 1] * k * (1 + green * 0.12));
      px[i + 2] = Math.min(255, px[i + 2] * k * (1 - green * 0.3));
    }
    g.putImageData(img, 0, 0);
    /* decals: scrub on the low ground, stones anywhere open */
    for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
      const x = cx * CH + tx, y = cy * CH + ty;
      if (x >= map.w || y >= map.h || map.cls[y * map.w + x] !== CLS.GROUND) continue;
      const h = hash(x * 3 + 1, y * 5 + 2), r = (h & 1023) / 1024;
      const key = r < 0.16 && map.height[y * map.w + x] === 0 ? "tuft" : r > 0.93 ? "stones" : null;
      if (!key) continue;
      const vs = A[key].v, [sx, sy] = vs[(h >>> 10) % vs.length];
      g.drawImage(sheet, sx, sy, T, T, tx * T, ty * T, T, T);
    }
    return c;
  }

  /** Draws the ground under a camera at world pixel (camX, camY), vw x vh, at screen offset (ox, oy). */
  Tr.draw = (g, camX, camY, vw, vh, ox, oy) => {
    const span = CH * T, x0 = Math.floor(camX / span), y0 = Math.floor(camY / span), x1 = Math.floor((camX + vw - 1) / span), y1 = Math.floor((camY + vh - 1) / span);
    for (let cy = Math.max(0, y0); cy <= y1; cy++) for (let cx = Math.max(0, x0); cx <= x1; cx++) {
      if (cx * CH >= Tr.map.w || cy * CH >= Tr.map.h) continue;
      const k = cx + "," + cy;
      const c = Tr.chunks[k] || (Tr.chunks[k] = paintChunk(cx, cy));
      g.drawImage(c, ox + cx * span - camX, oy + cy * span - camY);
    }
  };
})();
