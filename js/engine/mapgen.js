/* PumaCraft engine -- maps from a seed.
 *
 * PC.MapGen.make({ seed, size, players }) returns a map definition in the
 * same shape as a drawn map's (js/engine/map.js), so the rest of the game
 * cannot tell the two apart. Its id is "gen:<seed>:<size>:<players>"; a
 * save names a generated map by that id and the map is made again on load,
 * so generation must be exact everywhere -- integers and the engine's own
 * hash only, like everything under js/engine/.
 *
 * Fair by construction: two players get the map turned half way round,
 * four get it turned a quarter at a time (square maps), so every start
 * sees the same ground. The steps:
 *   1. value noise, made symmetric, quantised to three levels and smoothed
 *      by majority so no level is a speck;
 *   2. each main a plateau of high ground, and a ring of middle ground
 *      round it for its natural expansion;
 *   3. lakes in the low ground, outcrops of rock and stands of trees, all
 *      kept off the mains;
 *   4. ramps: the regions of each level are joined up, one ramp at a time
 *      (four tiles wide, on a straight edge between them), until every
 *      region of any size reaches the first main -- each ramp placed with
 *      its turned copies;
 *   5. ore and vapour: an arc of eight veins and a vent at each main,
 *      turned away from the centre, and the same at each natural -- for two
 *      players laid out once and copied exactly, for four laid out at each
 *      base from its own (identical, turned) ground;
 *   6. a check that every start, vein and vent can be walked to from the
 *      first start. A seed that fails moves on to the next.
 * tools/mapgen-check.js runs hundreds of seeds through all of it. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, Fx = PC.Fixed;
  const G = PC.MapGen = {};
  const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 974634721)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) & 1023; };
  /* integer value noise, 0..1023, cells of `cell` tiles */
  const vnoise = (x, y, cell, seed) => {
    const x0 = Math.floor(x / cell), y0 = Math.floor(y / cell), fx = x - x0 * cell, fy = y - y0 * cell;
    const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
    const top = a * (cell - fx) + b * fx, bot = c * (cell - fx) + d * fx;
    return Math.floor((top * (cell - fy) + bot * fy) / (cell * cell));
  };

  /** The tiles turned with (x, y) on an n x n map for `players` (2: half turn; 4: quarter turns). */
  const images = (x, y, n, players) => players === 4 ? [[x, y], [n - 1 - y, x], [n - 1 - x, n - 1 - y], [y, n - 1 - x]] : [[x, y], [n - 1 - x, n - 1 - y]];
  /** The one of (x, y)'s images that stands for them all. */
  const canon = (x, y, n, players) => images(x, y, n, players).reduce((m, p) => (p[1] < m[1] || (p[1] === m[1] && p[0] < m[0])) ? p : m);

  G.idOf = o => `gen:${o.seed >>> 0}:${o.size}:${o.players}`;
  G.parse = id => { const m = /^gen:(\d+):(\d+):(\d)$/.exec(id); return m ? { seed: +m[1], size: +m[2], players: +m[3] } : null; };

  /** Makes (or finds) the map for id and registers it; null if id is not a generated map's. */
  G.ensure = id => {
    if (PC.Map.registry[id]) return PC.Map.registry[id];
    const o = G.parse(id);
    if (!o) return null;
    const def = G.make(o);
    def.id = id;
    PC.Map.register(def);
    return def;
  };

  G.make = o => {
    for (let k = 0; k < 64; k++) {
      const def = attempt(o.size, o.players, (o.seed + k * 7919) >>> 0);
      if (def) { def.id = G.idOf(o); def.gen = { seed: o.seed >>> 0, size: o.size, players: o.players, tries: k + 1 }; return def; }
    }
    throw new Error("no map could be made from seed " + o.seed);
  };

  /* ---- one try ---- */
  const LOW = 0, MID = 1, HIGH = 2;
  /* why the last tries failed, for tools/mapgen-check.js */
  G.why = [];
  const fail = why => { G.why.push(why); return null; };
  function attempt(n, players, seed) {
    const N = n * n, h = new Uint8Array(N), kind = new Uint8Array(N);   /* kind: 0 ground, 1 rock, 2 water, 3 trees, 4 ramp */
    const at = (x, y) => y * n + x, inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
    /* the starts: in the corners, a fifth of the way in */
    const m = Math.floor(n / 6) + 2;
    const starts = players === 4 ? [[m, m], [n - 1 - m, m], [n - 1 - m, n - 1 - m], [m, n - 1 - m]] : [[m, m], [n - 1 - m, n - 1 - m]];
    /* 1. the levels */
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const [cx, cy] = canon(x, y, n, players);
      const v = Math.floor((vnoise(cx, cy, 16, seed) * 3 + vnoise(cx, cy, 7, seed + 1) * 2) / 5);
      h[at(x, y)] = v < 430 ? LOW : v < 640 ? MID : HIGH;
    }
    /* 2. the mains and their rings */
    for (const [sx, sy] of starts) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d2 = (x - sx) * (x - sx) + (y - sy) * (y - sy);
      if (d2 <= 11 * 11) h[at(x, y)] = HIGH;
      else if (d2 <= 16 * 16 && h[at(x, y)] === HIGH) h[at(x, y)] = MID;
      else if (d2 <= 16 * 16 && h[at(x, y)] === LOW) h[at(x, y)] = MID;
    }
    /* smoothing: three passes of majority over the 3 x 3 around each tile (the turn maps neighbourhoods to neighbourhoods, so it keeps the symmetry) */
    for (let pass = 0; pass < 3; pass++) {
      const out = h.slice();
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const c = [0, 0, 0];
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) c[h[at(x + i, y + j)]]++;
        const best = c[0] >= c[1] && c[0] >= c[2] ? 0 : c[1] >= c[2] ? 1 : 2;
        if (c[best] >= 5) out[at(x, y)] = best;
      }
      h.set(out);
    }
    const nearStart = (x, y, r) => starts.some(([sx, sy]) => (x - sx) * (x - sx) + (y - sy) * (y - sy) <= r * r);
    /* 3. lakes, rock and trees, off the mains */
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const [cx, cy] = canon(x, y, n, players), i = at(x, y);
      if (nearStart(x, y, 20)) continue;
      const wet = vnoise(cx, cy, 11, seed + 7), stone = vnoise(cx, cy, 5, seed + 9), wood = vnoise(cx, cy, 6, seed + 11);
      if (h[i] === LOW && wet > 760) kind[i] = 2;
      else if (stone > 900) kind[i] = 1;
      else if (h[i] !== HIGH && wood > 880) kind[i] = 3;
    }
    /* the border */
    for (let k = 0; k < n; k++) { kind[at(k, 0)] = kind[at(k, n - 1)] = kind[at(0, k)] = kind[at(n - 1, k)] = 1; }
    /* specks of one level inside another are flattened into it */
    flattenSpecks(n, h, kind, 24);
    symmetrize(n, players, h, kind);

    /* 4. ramps */
    const rowsOf = () => rows(n, h, kind);
    let tries = 0;
    for (;;) {
      if (++tries > 40) return fail("ramps never joined it up");
      const def = { rows: rowsOf(), starts: [] , players };
      const map = PC.Map.build({ id: "gen", rows: def.rows });
      const comp = components(map);
      const home = comp.id[at(starts[0][0], starts[0][1])];
      if (home < 0) return fail("the first start is closed");
      /* the biggest region not yet joined, and where it can be joined */
      let need = -1, needSize = 0;
      for (let k = 0; k < comp.size.length; k++) if (k !== home && comp.size[k] >= 40 && comp.size[k] > needSize) { need = k; needSize = comp.size[k]; }
      if (need < 0) break;
      if (!joinRegion(n, players, h, kind, map, comp, need, home)) {
        /* no straight edge to put a ramp on: give the region up to rock rather than leave it cut off */
        for (let i = 0; i < N; i++) if (comp.id[i] === need) kind[i] = 1;
      }
      symmetrize(n, players, h, kind);
    }
    /* small unreachable pockets left over: make them rock */
    {
      const map = PC.Map.build({ id: "gen", rows: rows(n, h, kind) }), comp = components(map), home = comp.id[at(starts[0][0], starts[0][1])];
      for (let i = 0; i < N; i++) if (comp.id[i] >= 0 && comp.id[i] !== home) kind[i] = 1;
      symmetrize(n, players, h, kind);
    }

    /* 5. resources */
    const map = PC.Map.build({ id: "gen", rows: rows(n, h, kind) });
    const resources = [], taken = new Uint8Array(N);
    const free = (x, y, w, hh) => { for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) { const xx = x + i, yy = y + j; if (!inside(xx, yy) || taken[at(xx, yy)] || map.build[at(xx, yy)] !== 1) return false; } return true; };
    const take = (x, y, w, hh) => { for (let j = -1; j <= hh; j++) for (let i = -1; i <= w; i++) if (inside(x + i, y + j)) taken[at(x + i, y + j)] = 1; };
    /* a base at tile (bx, by): the hall's 4 x 3 kept clear with three tiles round it, an arc of veins and a vent */
    const base = (bx, by) => {
      const hx = bx - 2, hy = by - 1;
      if (!free(hx, hy, 4, 3)) return false;
      const ring = new Uint8Array(N);
      for (let j = -3; j < 6; j++) for (let i = -3; i < 7; i++) if (inside(hx + i, hy + j)) ring[at(hx + i, hy + j)] = 1;
      /* away from the centre */
      const ox = bx - (n >> 1), oy = by - (n >> 1), head = Fx.heading(ox, oy);
      let veins = 0;
      for (let k = 0; k < 8; k++) {
        const a = (head + (k - 3.5) * 9 + 256) & 255;
        for (let r = 6; r <= 10 && veins === k; r++) {
          const vx = bx + Math.floor(PC.COS[Math.floor(a)] * r / 1024) - 1, vy = by + Math.floor(PC.SIN[Math.floor(a)] * r / 1024);
          let clash = false;
          for (let j = 0; j < 1 && !clash; j++) for (let i = 0; i < 2; i++) if (!inside(vx + i, vy + j) || ring[at(vx + i, vy + j)]) clash = true;
          /* veins sit shoulder to shoulder, so only their own tiles are taken */
          if (!clash && free(vx, vy, 2, 1)) { resources.push({ t: "ore", x: vx, y: vy }); taken[at(vx, vy)] = taken[at(vx + 1, vy)] = 1; veins++; }
        }
      }
      if (veins < 6) return false;
      for (const side of [64, 192]) {
        const a = (head + side) & 255;
        for (let r = 7; r <= 10; r++) {
          const vx = bx + Math.floor(PC.COS[a] * r / 1024) - 2, vy = by + Math.floor(PC.SIN[a] * r / 1024) - 1;
          let clash = false;
          for (let j = 0; j < 2 && !clash; j++) for (let i = 0; i < 4; i++) if (!inside(vx + i, vy + j) || ring[at(vx + i, vy + j)]) clash = true;
          if (!clash && free(vx, vy, 4, 2)) { resources.push({ t: "vapour", x: vx, y: vy }); take(vx, vy, 4, 2); return true; }
        }
      }
      return false;
    };
    /* a base is laid out once, for the first player, and its turned copies
       placed for the rest, so every player's ore is where every other's is
       (exactly, for two; within a tile for four, where a 2 x 1 vein cannot
       turn on its side) */
    const turn = (r, k) => {
      const w = r.t === "ore" ? 2 : 4, hh = r.t === "ore" ? 1 : 2, X = r.x + w / 2, Y = r.y + hh / 2;
      const [tx, ty] = k === 0 ? [X, Y] : players === 2 || k === 2 ? [n - X, n - Y] : k === 1 ? [n - Y, X] : [Y, n - X];
      return { t: r.t, x: Math.floor(tx - w / 2), y: Math.floor(ty - hh / 2) };
    };
    const copies = from => {
      const mineRes = resources.slice(from);
      for (let k = 1; k < players; k++) for (const r of mineRes) {
        const c = turn(r, k), w = c.t === "ore" ? 2 : 4, hh = c.t === "ore" ? 1 : 2;
        if (!free(c.x, c.y, w, hh)) return false;
        resources.push(c); for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) taken[at(c.x + i, c.y + j)] = 1;
      }
      return true;
    };
    const startDefs = starts.map(([sx, sy]) => ({ x: sx, y: sy + 0.5 }));
    /* keep every hall's site clear before laying out the first base */
    for (const [sx, sy] of starts.slice(1)) for (let j = -1; j < 2; j++) for (let i = -2; i < 2; i++) taken[at(sx + i, sy + j)] = 1;
    if (players === 2) {
      const from = resources.length;
      if (!base(starts[0][0], starts[0][1]) || !copies(from)) return fail("a main has no room for its base");
    } else {
      /* a quarter turn would stand 2 x 1 veins on end, where they collide: each of the four is laid out on its own, from its own turned ground */
      for (const [sx, sy] of starts) for (let j = -1; j < 2; j++) for (let i = -2; i < 2; i++) taken[at(sx + i, sy + j)] = 0;
      for (const [sx, sy] of starts) if (!base(sx, sy)) return fail("a main has no room for its base");
    }
    /* naturals: the nearest good spot to each main, at ground distance 18-34, turned for each player */
    const dist = walkDistances(map, starts[0][0], starts[0][1]);
    let nat = null;
    for (let d = 18; d <= 34 && !nat; d++) for (let y = 2; y < n - 2 && !nat; y++) for (let x = 2; x < n - 2 && !nat; x++) {
      if (dist[at(x, y)] !== d || nearStart(x, y, 14)) continue;
      const imgs = images(x, y, n, players);
      if (imgs.some(([ix, iy]) => imgs.filter(([jx, jy]) => (ix - jx) * (ix - jx) + (iy - jy) * (iy - jy) < 30 * 30).length > 1)) continue;
      const saveR = resources.length, saveT = taken.slice();
      if (players === 2 ? base(x, y) && copies(saveR) : imgs.every(([ix, iy]) => base(ix, iy))) nat = [x, y];
      else { resources.length = saveR; taken.set(saveT); }
    }

    /* 6. everything can be walked to from the first start */
    const reach = walkDistances(map, starts[0][0], starts[0][1]);
    for (const [sx, sy] of starts) if (reach[at(sx, sy + 2)] < 0 && reach[at(sx, sy - 2)] < 0) return fail("a start cannot be walked to");
    for (const r of resources) {
      const w = r.t === "ore" ? 2 : 4, hh = r.t === "ore" ? 1 : 2;
      let ok = false;
      for (let j = -1; j <= hh && !ok; j++) for (let i = -1; i <= w && !ok; i++) if (inside(r.x + i, r.y + j) && reach[at(r.x + i, r.y + j)] >= 0) ok = true;
      if (!ok) return fail("a resource cannot be walked to");
    }
    return { name: `Generated ${n} x ${n}`, players, rows: rows(n, h, kind), starts: startDefs, resources, natural: nat };
  }

  /** Makes every set of turned copies agree: rock if any is rock, else a ramp if any
   * is a ramp, else whatever the copy that stands for them all is. Run after any
   * step that edits single tiles, so no edit can break the map's fairness. */
  function symmetrize(n, players, h, kind) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const [cx, cy] = canon(x, y, n, players);
      if (cx !== x || cy !== y) continue;
      const imgs = images(x, y, n, players).map(([ix, iy]) => iy * n + ix);
      const k = imgs.some(i => kind[i] === 1) ? 1 : imgs.some(i => kind[i] === 4) ? 4 : kind[imgs[0]];
      for (const i of imgs) { kind[i] = k; h[i] = h[imgs[0]]; }
    }
  }

  function rows(n, h, kind) {
    const out = [];
    for (let y = 0; y < n; y++) {
      let s = "";
      for (let x = 0; x < n; x++) {
        const i = y * n + x, k = kind[i];
        s += k === 1 ? "#" : k === 2 ? "~" : k === 3 ? "T" : k === 4 ? "/" : h[i] === 0 ? "." : h[i] === 1 ? "," : ":";
      }
      out.push(s);
    }
    return out;
  }

  /** Ground of one level enclosed in another, smaller than min tiles, takes the level around it. */
  function flattenSpecks(n, h, kind, min) {
    const N = n * n, seen = new Int32Array(N).fill(-1), stack = [];
    for (let s = 0; s < N; s++) {
      if (seen[s] >= 0) continue;
      const lvl = h[s], cells = [];
      seen[s] = s; stack.push(s);
      while (stack.length) {
        const c = stack.pop(); cells.push(c);
        const x = c % n, y = Math.floor(c / n);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const k = ny * n + nx;
          if (seen[k] < 0 && h[k] === lvl) { seen[k] = s; stack.push(k); }
        }
      }
      if (cells.length >= min) continue;
      /* the commonest level on its rim */
      const c3 = [0, 0, 0];
      for (const c of cells) { const x = c % n, y = Math.floor(c / n); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < n && ny < n && h[ny * n + nx] !== lvl) c3[h[ny * n + nx]]++; } }
      const to = c3[0] >= c3[1] && c3[0] >= c3[2] ? 0 : c3[1] >= c3[2] ? 1 : 2;
      for (const c of cells) h[c] = to;
    }
    void kind;
  }

  /** Connected walkable regions (8-way, no corner cutting): { id: Int32Array (-1 for closed), size: [] }. */
  function components(map) {
    const n = map.w * map.h, id = new Int32Array(n).fill(-1), size = [], open = map.walk, w = map.w;
    for (let s = 0; s < n; s++) {
      if (open[s] !== PC.Map.FULL || id[s] >= 0) continue;
      const k = size.length, stack = [s];
      id[s] = k; let count = 0;
      while (stack.length) {
        const c = stack.pop(); count++;
        const x = c % w, y = Math.floor(c / w);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
          const t = ny * w + nx;
          if (open[t] !== PC.Map.FULL || id[t] >= 0) continue;
          if (dx && dy && (open[y * w + nx] !== PC.Map.FULL || open[ny * w + x] !== PC.Map.FULL)) continue;
          id[t] = k; stack.push(t);
        }
      }
      size.push(count);
    }
    return { id, size };
  }

  /** Steps from (sx, sy) to every open tile, -1 where it cannot be walked. */
  function walkDistances(map, sx, sy) {
    const w = map.w, n = w * map.h, d = new Int32Array(n).fill(-1), q = new Int32Array(n), open = map.walk;
    let head = 0, tail = 0;
    const s = sy * w + sx;
    if (open[s] !== PC.Map.FULL) return d;
    d[s] = 0; q[tail++] = s;
    while (head < tail) {
      const c = q[head++], x = c % w, y = Math.floor(c / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
        const t = ny * w + nx;
        if (open[t] === PC.Map.FULL && d[t] < 0) { d[t] = d[c] + 1; q[tail++] = t; }
      }
    }
    return d;
  }
  G.walkDistances = walkDistances;

  /**
   * Joins region `need` toward the joined world with one ramp (and its turned
   * copies): on the boundary between two levels where a run of four ground
   * tiles of the lower level faces a run of four of the higher, and one side
   * of it is reachable from home or the region itself. True if it placed one.
   */
  function joinRegion(n, players, h, kind, map, comp, need, home) {
    const at = (x, y) => y * n + x;
    let best = null, bestScore = Infinity;
    /* a ramp strip: four tiles along an edge of the lower ground, the higher ground on its other side */
    for (let y = 3; y < n - 4; y++) for (let x = 3; x < n - 4; x++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      /* strip tiles (x + k * ax, y + k * ay), k = 0..3, the lower side; the high side one step (dx, dy) beyond, through the cliff */
      const ax = dy !== 0 ? 1 : 0, ay = dx !== 0 ? 1 : 0;
      let ok = true, lo = -1, hi = -1, touchesNeed = false, touchesHome = false;
      for (let k = 0; k < 4 && ok; k++) {
        const sx = x + k * ax, sy = y + k * ay, cx = sx + dx, cy = sy + dy, hx = sx + 2 * dx, hy = sy + 2 * dy;
        if (hx < 1 || hy < 1 || hx >= n - 1 || hy >= n - 1) { ok = false; break; }
        const s = at(sx, sy), c = at(cx, cy), hh = at(hx, hy);
        if (kind[s] || kind[c] || kind[hh]) { ok = false; break; }
        if (lo < 0) { lo = h[s]; hi = h[hh]; }
        /* lower ground, the cliff edge of the higher, then the higher's open ground */
        if (h[s] !== lo || h[c] !== hi || h[hh] !== hi || hi !== lo + 1) { ok = false; break; }
        const ls = comp.id[s], lh = comp.id[hh];
        if (ls < 0 || lh < 0 || ls === lh) { ok = false; break; }
        if (ls === need || lh === need) touchesNeed = true;
        if (ls === home || lh === home) touchesHome = true;
      }
      if (!ok || !touchesNeed) continue;
      /* prefer joining straight to home, then near the middle of the map */
      const score = (touchesHome ? 0 : 100000) + Math.abs(x - (n >> 1)) + Math.abs(y - (n >> 1));
      if (score < bestScore) { bestScore = score; best = [x, y, dx, dy]; }
    }
    if (!best) return false;
    const [x, y, dx, dy] = best, ax = dy !== 0 ? 1 : 0, ay = dx !== 0 ? 1 : 0;
    /* the ramp is the cliff-edge row of the higher ground, so the levels meet on it; widened by one each side, so it opens two tiles wide */
    for (let k = -1; k < 5; k++) {
      const cx = x + k * ax + dx, cy = y + k * ay + dy;
      for (const [ix, iy] of images(cx, cy, n, players)) if (ix > 0 && iy > 0 && ix < n - 1 && iy < n - 1 && !kind[at(ix, iy)]) { kind[at(ix, iy)] = 4; }
    }
    void map;
    return true;
  }
})();
