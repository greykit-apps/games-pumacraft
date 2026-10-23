/* PumaCraft engine -- the ground.
 *
 * A map is a grid of 24 px tiles. Its file (js/maps/<id>.js) gives one
 * character a tile, row by row, so a map reads as a picture of itself:
 *
 *   .  low ground     ,  middle ground   :  high ground
 *   /  ramp           #  rock            ~  water        T  trees
 *
 * Height steps make cliffs: a tile beside lower ground that is not a ramp is
 * a cliff face, walked by nothing and built on by nothing. Ramps join the
 * levels; for sight a ramp counts as the level below it. Water and rock stop
 * the ground but not the air.
 *
 * Each tile carries a 16-bit walkability mask, one bit per 6 px minitile
 * (4 x 4). Terrain gives whole tiles; buildings and doodads, later, take
 * minitiles. The pathfinder walks tiles whose mask is full. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C;
  const CLS = { GROUND: 0, ROCK: 1, WATER: 2, RAMP: 3, TREES: 4, CLIFF: 5 };
  const CHARS = { ".": [CLS.GROUND, 0], ",": [CLS.GROUND, 1], ":": [CLS.GROUND, 2], "/": [CLS.RAMP, 0], "#": [CLS.ROCK, 0], "~": [CLS.WATER, 0], "T": [CLS.TREES, 0] };
  const FULL = 0xffff;

  const M = PC.Map = { CLS, FULL, registry: Object.create(null), order: [] };

  /** A map file registers itself here. */
  M.register = def => {
    if (M.registry[def.id]) throw new Error("map registered twice: " + def.id);
    M.registry[def.id] = def; M.order.push(def.id);
  };

  /** The grids of a map definition: { w, h, cls, height, walk, build, def }. */
  M.build = def => {
    const rows = def.rows, h = rows.length, w = rows[0].length;
    if (w > C.MAP_MAX || h > C.MAP_MAX) throw new Error(def.id + ": larger than " + C.MAP_MAX + " tiles");
    const n = w * h, cls = new Uint8Array(n), height = new Uint8Array(n), walk = new Uint16Array(n), build = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error(def.id + ": row " + y + " is " + rows[y].length + " wide, not " + w);
      for (let x = 0; x < w; x++) {
        const c = CHARS[rows[y][x]];
        if (!c) throw new Error(def.id + ": unknown tile '" + rows[y][x] + "' at " + x + "," + y);
        cls[y * w + x] = c[0]; height[y * w + x] = c[1];
      }
    }
    const at = (x, y) => y * w + x, inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    /* a ramp sits at the lowest level beside it */
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cls[at(x, y)] !== CLS.RAMP) continue;
      let lo = 3;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const nx = x + i, ny = y + j;
        if (inside(nx, ny) && cls[at(nx, ny)] === CLS.GROUND && height[at(nx, ny)] < lo) lo = height[at(nx, ny)];
      }
      height[at(x, y)] = lo === 3 ? 0 : lo;
    }
    /* cliffs: ground beside lower ground (not a ramp) is a cliff face --
       decided against the grid as drawn, then applied, so the order of the
       scan cannot change the answer */
    const cliffs = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i0 = at(x, y);
      if (cls[i0] !== CLS.GROUND) continue;
      let cliff = false;
      for (let j = -1; j <= 1 && !cliff; j++) for (let i = -1; i <= 1; i++) {
        const nx = x + i, ny = y + j;
        if (!inside(nx, ny)) continue;
        const k = at(nx, ny);
        if (cls[k] === CLS.GROUND && height[k] < height[i0]) { cliff = true; break; }
      }
      if (cliff) cliffs.push(i0);
    }
    for (const i of cliffs) cls[i] = CLS.CLIFF;
    for (let i = 0; i < n; i++) {
      const open = cls[i] === CLS.GROUND || cls[i] === CLS.RAMP;
      walk[i] = open ? FULL : 0;
      build[i] = cls[i] === CLS.GROUND ? 1 : 0;
    }
    return { id: def.id, w, h, cls, height, walk, walkBase: walk.slice(), build, def };
  };

  /** The tile index under a fixed-point position, or -1 off the map. */
  M.tileAt = (map, fx, fy) => {
    const tx = Math.floor(fx / C.TILE_FP), ty = Math.floor(fy / C.TILE_FP);
    return tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? -1 : ty * map.w + tx;
  };
  M.open = (map, t) => t >= 0 && map.walk[t] === FULL;
  /** The centre of tile (tx, ty), fixed point. */
  M.centre = t => t * C.TILE_FP + (C.TILE_FP >> 1);
})();
