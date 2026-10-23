/* PumaCraft engine -- who sees what.
 *
 * Each player has a count per tile of the units seeing it, rebuilt every
 * tick from where the units stand. That makes it derived, not state: a
 * loaded game rebuilds it from the loaded units and sees exactly what the
 * unbroken game saw. What a player has ever seen (the explored map, which
 * keeps the dark of fog from the black of the unknown) is state, a bit per
 * player per tile.
 *
 * The height rule: a ground unit sees no tile higher than the one it stands
 * on, so high ground hides what is on it until someone climbs. Ramps count
 * as the level below them. Flyers see everything in their sight. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, CLS = PC.Map.CLS;
  const V = PC.Vision = {};
  /* disc offsets for each sight radius in tiles, [dx, dy] pairs */
  const discs = [];
  for (let r = 0; r <= 14; r++) {
    const d = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) d.push(dx, dy);
    discs.push(Int8Array.from(d));
  }

  /** Rebuilds every player's view from the units. */
  V.update = (W, order, count) => {
    const map = W.map, w = map.w, h = map.h, T = PC.Data.types, H = map.height;
    for (const v of W.vis) if (v) v.fill(0);
    for (let k = 0; k < count; k++) {
      const i = order[k], p = W.owner[i];
      if (p >= C.MAX_PLAYERS || !W.vis[p]) continue;
      const t = T[W.type[i]], vis = W.vis[p], bit = 1 << p;
      const tx = Math.floor(W.x[i] / C.TILE_FP), ty = Math.floor(W.y[i] / C.TILE_FP);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const air = W.flags[i] & F.AIR, ht = H[ty * w + tx], d = discs[Math.min(14, (W.flags[i] & F.UNDER_CONSTRUCTION) ? Math.min(t.sight, 3) : t.sight)];
      for (let j = 0; j < d.length; j += 2) {
        const x = tx + d[j], y = ty + d[j + 1];
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const n = y * w + x;
        if (!air && H[n] > ht && map.cls[n] !== CLS.RAMP) continue;
        vis[n]++;
        W.explored[n] |= bit;
      }
    }
  };

  /** Whether player p sees the tile under fixed-point (x, y) now. */
  V.sees = (W, p, x, y) => {
    const v = W.vis[p];
    if (!v) return true;
    const t = PC.Map.tileAt(W.map, x, y);
    return t >= 0 && v[t] > 0;
  };
  /** Whether player p sees unit j (buildings and resources once explored count as seen for targeting). */
  V.seesUnit = (W, p, j) => V.sees(W, p, W.x[j], W.y[j]);
})();
