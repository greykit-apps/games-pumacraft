/* PumaCraft engine -- getting there.
 *
 * Pathfinding is A* over tiles, 8-connected, never cutting a blocked corner,
 * with costs 10 and 14 and the octile heuristic. A unit that wants a path
 * joins a queue (state, so a save resumes it); each tick the queue is
 * served lowest-first until C.NAV_BUDGET expansions are spent. A search
 * always runs to its end once begun, so nothing is ever half done between
 * ticks. Until it is served a unit walks straight at its goal.
 *
 * A goal that cannot be reached gets the reachable tile nearest it. The
 * tile path is string-pulled: each waypoint is the farthest tile still in
 * a clear line from the one before, so units cut across open ground rather
 * than walking the grid.
 *
 * Steering keeps ground units from standing in one another: each tick every
 * pair closer than their radii is pushed apart, the moving one yielding a
 * quarter of the overlap and a still one three quarters (an idle unit is
 * shoved aside, as it was in the original), never onto ground it cannot
 * stand on. Units go in slot order, so the result is the same everywhere. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, Fx = PC.Fixed, M = PC.Map;
  C.NAV_BUDGET = 6000;        /* A* expansions a tick, across every search */
  C.NAV_SEARCH_MAX = 24000;   /* expansions one search may spend before it settles for its best */

  /* scratch, per map size; derived, never state */
  let S = null;
  const scratch = n => {
    if (S && S.n === n) return S;
    S = { n, g: new Int32Array(n), seen: new Int32Array(n), closed: new Int32Array(n), from: new Int32Array(n), heapN: new Int32Array(Math.max(n, C.NAV_SEARCH_MAX) * 8 + 16), heapF: new Int32Array(Math.max(n, C.NAV_SEARCH_MAX) * 8 + 16),
      stamp: 0, tiles: new Int32Array(n), cellHead: null, cellNext: new Int16Array(C.MAX_UNITS) };
    return S;
  };

  const octile = (ax, ay, bx, by) => { const dx = ax > bx ? ax - bx : bx - ax, dy = ay > by ? ay - by : by - ay; return dx > dy ? 10 * dx + 4 * dy : 10 * dy + 4 * dx; };

  /** A* from tile s to tile t on map; fills S.tiles with the path from s
   * (exclusive) to the reached tile (inclusive); returns [length, expansions]. */
  function search(map, s, t) {
    const w = map.w, n = w * map.h, sc = scratch(n), open = map.walk;
    const stamp = ++sc.stamp, tx = t % w, ty = Math.floor(t / w);
    let hn = 0;
    const push = (node, f) => {
      let i = hn++;
      while (i > 0) { const p = (i - 1) >> 1; if (sc.heapF[p] <= f) break; sc.heapN[i] = sc.heapN[p]; sc.heapF[i] = sc.heapF[p]; i = p; }
      sc.heapN[i] = node; sc.heapF[i] = f;
    };
    const pop = () => {
      const top = sc.heapN[0], ln = sc.heapN[--hn], lf = sc.heapF[hn];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hn) break;
        if (c + 1 < hn && sc.heapF[c + 1] < sc.heapF[c]) c++;
        if (sc.heapF[c] >= lf) break;
        sc.heapN[i] = sc.heapN[c]; sc.heapF[i] = sc.heapF[c]; i = c;
      }
      sc.heapN[i] = ln; sc.heapF[i] = lf;
      return top;
    };
    sc.g[s] = 0; sc.seen[s] = stamp; sc.from[s] = -1;
    push(s, octile(s % w, Math.floor(s / w), tx, ty));
    let best = s, bestH = octile(s % w, Math.floor(s / w), tx, ty), exp = 0;
    while (hn > 0 && exp < C.NAV_SEARCH_MAX) {
      const cur = pop();
      if (sc.closed[cur] === stamp) continue;
      sc.closed[cur] = stamp; exp++;
      if (cur === t) { best = t; break; }
      const cx = cur % w, cy = Math.floor(cur / w), h = octile(cx, cy, tx, ty);
      if (h < bestH) { bestH = h; best = cur; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
        const nb = ny * w + nx;
        if (open[nb] !== M.FULL || sc.closed[nb] === stamp) continue;
        if (dx && dy && (open[cy * w + nx] !== M.FULL || open[ny * w + cx] !== M.FULL)) continue;
        const g = sc.g[cur] + (dx && dy ? 14 : 10);
        if (sc.seen[nb] === stamp && sc.g[nb] <= g) continue;
        sc.seen[nb] = stamp; sc.g[nb] = g; sc.from[nb] = cur;
        push(nb, g + octile(nx, ny, tx, ty));
      }
    }
    /* walk back from the tile reached */
    let len = 0;
    for (let k = best; k !== s && k !== -1; k = sc.from[k]) len++;
    let k = best;
    for (let i = len - 1; i >= 0; i--) { sc.tiles[i] = k; k = sc.from[k]; }
    return [len, exp];
  }

  /** Whether a straight walk from tile a to tile b crosses only open tiles,
   * squeezing past no blocked corner. */
  function clear(map, a, b) {
    const w = map.w, open = map.walk;
    let x = a % w, y = Math.floor(a / w);
    const x1 = b % w, y1 = Math.floor(b / w), dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
    let err = dx - dy;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      const stepX = e2 > -dy, stepY = e2 < dx;
      if (stepX && stepY && (open[y * w + x + sx] !== M.FULL || open[(y + sy) * w + x] !== M.FULL)) return false;
      if (stepX) { err -= dy; x += sx; }
      if (stepY) { err += dx; y += sy; }
      if (open[y * w + x] !== M.FULL) return false;
    }
    return true;
  }

  const N = PC.Nav = { search, clear };

  /** Unit i wants a path to its goal. */
  N.want = (W, i) => {
    if (W.pathWant[i]) return;
    W.pathWant[i] = 1;
    const q = W.pqHdr;
    W.pq[(q[0] + q[1]) % C.MAX_UNITS] = i; q[1]++;
  };

  /** Serves the queue for one tick. */
  N.serve = W => {
    const q = W.pqHdr, map = W.map;
    let budget = C.NAV_BUDGET;
    while (q[1] > 0 && budget > 0) {
      const i = W.pq[q[0]];
      q[0] = (q[0] + 1) % C.MAX_UNITS; q[1]--;
      if (!(W.flags[i] & F.ALIVE) || !W.pathWant[i]) continue;
      W.pathWant[i] = 0;
      budget -= plan(W, i, map);
    }
  };

  /** Plans unit i's path to its goal now; returns the expansions spent. */
  function plan(W, i, map) {
    const s = M.tileAt(map, W.x[i], W.y[i]), t = M.tileAt(map, W.goalX[i], W.goalY[i]);
    W.pathAt[i] = 0;
    if (s < 0 || t < 0) { W.pathLen[i] = 0; return 1; }
    if (s === t) { W.pathX[i * C.PATH] = W.goalX[i]; W.pathY[i * C.PATH] = W.goalY[i]; W.pathLen[i] = 1; return 1; }
    const [len, exp] = search(map, s, t), sc = S, w = map.w;
    /* string-pull the tiles into waypoints */
    let n = 0, anchor = s, k = 0;
    const base = i * C.PATH;
    while (k < len && n < C.PATH) {
      let far = k;
      for (let j = k + 1; j < len; j++) if (clear(map, anchor, sc.tiles[j])) far = j; else if (j > far + 6) break;
      const tile = sc.tiles[far];
      if (far === len - 1 && tile === t) { W.pathX[base + n] = W.goalX[i]; W.pathY[base + n] = W.goalY[i]; }
      else { W.pathX[base + n] = M.centre(tile % w); W.pathY[base + n] = M.centre(Math.floor(tile / w)); }
      n++; anchor = tile; k = far + 1;
    }
    /* the goal tile was unreachable: stop at the nearest reachable one */
    if (len > 0 && sc.tiles[len - 1] !== t && n > 0) { W.goalX[i] = W.pathX[base + n - 1]; W.goalY[i] = W.pathY[base + n - 1]; }
    if (len === 0) { W.goalX[i] = W.x[i]; W.goalY[i] = W.y[i]; }
    W.pathLen[i] = n;
    return exp + 1;
  }

  /* ---- steering ---- */
  /** Pushes overlapping ground units apart; moving[i] is 1 for units under way. */
  N.separate = (W, order, count) => {
    const map = W.map, w = map.w, h = map.h, sc = scratch(w * h);
    if (!sc.cellHead || sc.cellHead.length !== w * h) sc.cellHead = new Int16Array(w * h);
    const head = sc.cellHead, next = sc.cellNext, T = PC.Data.types;
    head.fill(-1);
    for (let k = count - 1; k >= 0; k--) {
      const i = order[k];
      if (W.flags[i] & (F.AIR | F.BUILDING | F.RESOURCE | F.INSIDE | F.EFFECT)) continue;
      const t = M.tileAt(map, W.x[i], W.y[i]);
      if (t < 0) continue;
      next[i] = head[t]; head[t] = i;
    }
    for (let k = 0; k < count; k++) {
      const i = order[k];
      if (W.flags[i] & (F.AIR | F.BUILDING | F.RESOURCE | F.INSIDE | F.EFFECT)) continue;
      const tx = Math.floor(W.x[i] / C.TILE_FP), ty = Math.floor(W.y[i] / C.TILE_FP), ri = T[W.type[i]].r;
      const ghost = W.flags[i] & F.WORKER && (W.oLen[i] && (W.oK[i * C.ORDERS + W.oHead[i]] === C.ORD.GATHER || W.oK[i * C.ORDERS + W.oHead[i]] === C.ORD.RETURN));
      if (ghost) continue;
      for (let cy = ty - 1; cy <= ty + 1; cy++) for (let cx = tx - 1; cx <= tx + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        for (let j = head[cy * w + cx]; j !== -1; j = next[j]) {
          if (j <= i) continue;
          const dx = W.x[j] - W.x[i], dy = W.y[j] - W.y[i], rr = ri + T[W.type[j]].r;
          if (dx >= rr || dx <= -rr || dy >= rr || dy <= -rr) continue;
          let d = Fx.len(dx, dy);
          if (d >= rr) continue;
          let ux = dx, uy = dy;
          if (d === 0) { ux = (i & 1) ? 1 : -1; uy = (j & 1) ? 1 : -1; d = 1; ux *= C.ONE; uy *= C.ONE; d = Fx.len(ux, uy); }
          const over = rr - d, mi = W.flags[i] & F.MOVING, mj = W.flags[j] & F.MOVING;
          /* the share each yields: a still unit gives way to a moving one */
          const si = mi && !mj ? 1 : !mi && mj ? 3 : 2;
          let pi = Math.floor(over * si / 4), pj = over - pi;
          /* a unit dug in does not budge: the other takes the whole push (two dug in, neither) */
          if (W.mode[i]) { pj += pi; pi = 0; }
          if (W.mode[j]) { pi += pj; pj = 0; if (W.mode[i]) pi = 0; }
          nudge(W, map, i, -Math.floor(ux * pi / d), -Math.floor(uy * pi / d));
          nudge(W, map, j, Math.floor(ux * pj / d), Math.floor(uy * pj / d));
        }
      }
    }
  };
  /** Moves unit i by (dx, dy) if it lands on ground it can stand on; else slides along one axis. */
  function nudge(W, map, i, dx, dy) {
    if (M.open(map, M.tileAt(map, W.x[i] + dx, W.y[i] + dy))) { W.x[i] += dx; W.y[i] += dy; }
    else if (M.open(map, M.tileAt(map, W.x[i] + dx, W.y[i]))) W.x[i] += dx;
    else if (M.open(map, M.tileAt(map, W.x[i], W.y[i] + dy))) W.y[i] += dy;
  }
  N.nudge = nudge;
})();
