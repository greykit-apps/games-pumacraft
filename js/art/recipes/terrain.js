/* PumaCraft art -- the ground, as 24 px tiles. One biome so far, the
 * Badlands: red dirt on three levels (higher ground drier and paler),
 * scrub on the low ground, ramps of packed earth, rock, water, woods, and
 * cliff faces.
 *
 * A tile recipe paints a tile pixel by pixel: paint(x, y, v) returns a ramp
 * colour for pixel (x, y) of variant v. Tiles wrap seamlessly on the noise
 * period (24 px), so variants can sit side by side in any order.
 *
 * Cliffs: a cliff tile is high ground whose edge drops away. Its variant is
 * a mask of the sides that drop (1 north, 2 east, 4 south, 8 west); a south
 * drop shows a tall rock face (the camera looks north), the others a lip.
 * Cliff tiles are overlays: empty except for the faces, drawn over the
 * ground of the tile's own level. A paint function returns null for an
 * empty pixel. */
"use strict";
(() => {
  const R = PC.Recipes, P = PC.Paint, PAL = PC.PAL;
  const T = 24;
  R.tiles = R.tiles || [];
  const tile = (key, def) => { def.key = key; def.kind = "tile"; R.tiles.push(def); };
  const n = (x, y, s, sc) => P.noise(x, y, s, sc, T);

  /* the three levels of ground: fine grain only, so any two tiles meet
     without a seam and no pattern repeats at the tile's size. The broad
     strokes -- where the ground is darker, drier, greener -- are painted
     across the whole map when a chunk is drawn (js/render/terrain.js), and
     scrub and stones are scattered over the top as decals. */
  const ground = (lvl) => (x, y, v) => {
    const base = 0.58 - lvl * 0.14, grain = n(x + v * 5, y + v * 11, 3 + v, 3), fine = n(x + v * 3, y, 9 + v, 2);
    let t = base + (grain - 0.5) * 0.22 + (fine - 0.5) * 0.12;
    if (P.hash(x + v * 31, y, 5 + lvl) > 0.982) t -= 0.18;
    return P.pick(PAL.dirt, t, x, y);
  };
  /* decals: a tuft of scrub, a scatter of stones; transparent around them */
  tile("tuft", { sheet: "terrain", variants: 4, paint: (x, y, v) => {
    const cx = 12 + (P.hash(v, 1, 61) - 0.5) * 6, cy = 13 + (P.hash(v, 2, 61) - 0.5) * 6;
    for (let k = 0; k < 7; k++) {
      const bx = cx + (P.hash(v, k, 62) - 0.5) * 12, by = cy + (P.hash(v, k, 63) - 0.5) * 8, r = 2 + P.hash(v, k, 64) * 2.5;
      const dx = x - bx, dy = y - by;
      if (dx * dx + dy * dy < r * r) return P.pick(PAL.grass, 0.3 + (dx + dy) / (r * 4) + P.hash(x, y, v) * 0.15, x, y);
    }
    return null;
  } });
  tile("stones", { sheet: "terrain", variants: 4, paint: (x, y, v) => {
    for (let k = 0; k < 4; k++) {
      const bx = 4 + P.hash(v, k, 71) * 16, by = 4 + P.hash(v, k, 72) * 16, rx = 1.2 + P.hash(v, k, 73) * 2, ry = rx * 0.75;
      const dx = (x - bx) / rx, dy = (y - by) / ry, d = dx * dx + dy * dy;
      if (d < 1) return P.pick(PAL.rock, 0.25 + (dx + dy) * 0.2 + d * 0.2, x, y);
      if (d < 1.8 && dx > 0 && dy > 0) return P.pick(PAL.dirt, 0.85, x, y);   /* its shadow */
    }
    return null;
  } });
  tile("ground0", { sheet: "terrain", variants: 4, paint: ground(0) });
  tile("ground1", { sheet: "terrain", variants: 4, paint: ground(1) });
  tile("ground2", { sheet: "terrain", variants: 4, paint: ground(2) });
  tile("ramp", { sheet: "terrain", variants: 2, paint: (x, y, v) => P.pick(PAL.dirt, 0.38 + (n(x, y + v * 9, 4, 4) - 0.5) * 0.3 + ((y % 6) < 1 ? 0.15 : 0), x, y) });
  tile("rock", { sheet: "terrain", variants: 3, paint: (x, y, v) => {
    const a = n(x + v * 9, y, 7, 8), b = n(x, y + v * 5, 8, 4);
    return P.pick(PAL.rock, 0.25 + (1 - a) * 0.5 + (b - 0.5) * 0.35, x, y);
  } });
  tile("water", { sheet: "terrain", variants: 4, paint: (x, y, v) => {
    /* the four variants are four frames of a slow swell */
    const w = n(x + v * 6, y * 2, 9, 8), glint = n(x * 2 + v * 12, y, 10, 4) > 0.82;
    return P.pick(PAL.water, glint ? 0.05 : 0.35 + (w - 0.5) * 0.6, x, y);
  } });
  tile("trees", { sheet: "terrain", variants: 3, paint: (x, y, v) => {
    /* crowns, lit from the upper left, over dark undergrowth */
    let best = 2;
    for (let k = 0; k < 5; k++) {
      const cx = P.hash(k, v, 41) * T, cy = P.hash(k, v, 42) * T, r = 5 + P.hash(k, v, 43) * 4;
      for (let oy = -1; oy <= 1; oy++) for (let oxx = -1; oxx <= 1; oxx++) {
        const dx = x - (cx + oxx * T), dy = y - (cy + oy * T), d = (dx * dx + dy * dy) / (r * r);
        if (d < 1) { const lit = (-dx - dy) / (r * 1.6); best = Math.min(best, 0.45 - lit * 0.4 + d * 0.3); }
      }
    }
    return best > 1.5 ? P.pick(PAL.grass, 0.92, x, y) : P.pick(PAL.grass, best, x, y);
  } });
  /* cliff faces, by mask of the sides that drop away. The south face, the
     one the camera looks at, fills the tile: a sunlit lip, then the rock
     falling away in vertical strata, darkest at its foot. The others show
     as a narrower band of rock at that edge. */
  const cliff = (x, y, mask) => {
    const face = PAL.rock;
    const strata = (n(x * 2, y * 0.25, 17, 4) - 0.5) * 0.35 + (P.hash(x, 0, 19) > 0.7 ? 0.12 : 0);
    if (mask & 4) {
      if (y < 3) return P.pick(face, 0.05 + y * 0.06, x, y);
      if (y > 21) return P.pick(face, 0.92, x, y);
      return P.pick(face, 0.3 + (y - 3) / 18 * 0.45 + strata, x, y);
    }
    if ((mask & 2) && x > 16) return P.pick(face, x > 22 ? 0.92 : 0.45 + (x - 16) * 0.05 + strata * 0.6, x, y);
    if ((mask & 8) && x < 8) return P.pick(face, x < 1 ? 0.1 : 0.2 + (7 - x) * 0.04 + strata * 0.6, x, y);
    if ((mask & 1) && y < 5) return P.pick(face, y < 1 ? 0.08 : 0.25 + y * 0.08, x, y);
    return null;
  };
  tile("cliff", { sheet: "terrain", variants: 16, paint: cliff });
})();
