/* PumaCraft engine -- commands in, orders out.
 *
 * A command is what a player (or the AI, through the same door) asks for:
 *   { t, p, k, u: [ids], x, y, tgt, q }
 * stamped with the tick it takes effect (t), the player (p), the kind (k, a
 * C.CMD), the units, a point in fixed point, a target id, and q for Shift:
 * queue it behind what the units are doing rather than replacing it.
 * Commands wait in W.pending, in (tick, player, sequence) order, and are
 * applied at the start of their tick. Each applied command is appended to
 * W.log, which with the seed is the whole replay.
 *
 * An order is what one unit carries: up to C.ORDERS of them in a ring, the
 * head being done now. A group told to move keeps its shape if it is small
 * enough to have one (within six tiles across, as the original did);
 * otherwise everyone heads for the point and spreads where they arrive. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, CMD = C.CMD, ORD = C.ORD, Fx = PC.Fixed, M = PC.Map, Wo = PC.World;
  const O = PC.Orders = {};

  /** Queues a command; it takes effect at tick cmd.t (no earlier than the next). */
  O.issue = (W, cmd) => {
    const c = { t: Math.max(cmd.t | 0, W.hdr[0]), p: cmd.p | 0, k: cmd.k | 0, u: (cmd.u || []).map(v => v | 0), x: cmd.x | 0, y: cmd.y | 0, tgt: cmd.tgt | 0, q: cmd.q ? 1 : 0, s: W.hdr[2]++ };
    /* keep pending sorted by (t, p, s): insertion from the back, since commands arrive nearly in order */
    let i = W.pending.length;
    while (i > 0) { const o = W.pending[i - 1]; if (o.t < c.t || (o.t === c.t && (o.p < c.p || (o.p === c.p && o.s < c.s)))) break; i--; }
    W.pending.splice(i, 0, c);
    return c;
  };

  /** Applies every command due this tick. */
  O.applyDue = W => {
    const t = W.hdr[0];
    while (W.pending.length && W.pending[0].t <= t) {
      const c = W.pending.shift();
      W.log.push(c);
      apply(W, c);
    }
  };

  const slot = (W, i, k) => i * C.ORDERS + ((W.oHead[i] + k) % C.ORDERS);
  const clampX = (W, v) => Math.max(1, Math.min(W.map.w * C.TILE_FP - 1, v));
  const clampY = (W, v) => Math.max(1, Math.min(W.map.h * C.TILE_FP - 1, v));

  /** Gives unit i order kind k at (x, y); queued behind the rest when q. */
  O.give = (W, i, k, x, y, tgt, q, x2 = 0, y2 = 0) => {
    if (!q) W.oLen[i] = 0;
    if (W.oLen[i] >= C.ORDERS) return false;
    const s = slot(W, i, W.oLen[i]);
    W.oK[s] = k; W.oX[s] = x; W.oY[s] = y; W.oT[s] = tgt; W.oX2[s] = x2; W.oY2[s] = y2;
    W.oLen[i]++;
    if (W.oLen[i] === 1) begin(W, i);
    return true;
  };

  /** The head order has just become current: aim at it. */
  function begin(W, i) {
    const s = slot(W, i, 0), k = W.oK[s];
    W.stuck[i] = 0; W.repaths[i] = 0; W.pathLen[i] = 0; W.pathAt[i] = 0;
    if (k === ORD.MOVE || k === ORD.PATROL) {
      W.goalX[i] = W.oX[s]; W.goalY[i] = W.oY[s];
      W.flags[i] |= F.MOVING;
      if (!(W.flags[i] & F.AIR)) PC.Nav.want(W, i);
    } else W.flags[i] &= ~F.MOVING;
  }
  /** The head order is done; the next begins. */
  function done(W, i) {
    W.oHead[i] = (W.oHead[i] + 1) % C.ORDERS; W.oLen[i]--;
    W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0;
    if (W.oLen[i] > 0) begin(W, i);
  }
  O.headKind = (W, i) => W.oLen[i] ? W.oK[slot(W, i, 0)] : ORD.IDLE;

  function apply(W, c) {
    const units = [];
    for (const id of c.u) {
      const i = Wo.live(W, id);
      if (i < 0 || W.owner[i] !== c.p || (W.flags[i] & (F.BUILDING | F.RESOURCE))) continue;
      if (units.indexOf(i) < 0) units.push(i);
    }
    if (!units.length) return;
    const x = clampX(W, c.x), y = clampY(W, c.y);
    if (c.k === CMD.STOP) { for (const i of units) { W.oLen[i] = 0; W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0; W.pathWant[i] = 0; } return; }
    if (c.k === CMD.HOLD) { for (const i of units) O.give(W, i, ORD.HOLD, W.x[i], W.y[i], 0, c.q); return; }
    if (c.k !== CMD.MOVE && c.k !== CMD.PATROL) return;   /* the rest arrive with combat and the economy */
    /* keep a small group's shape */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    for (const i of units) { x0 = Math.min(x0, W.x[i]); y0 = Math.min(y0, W.y[i]); x1 = Math.max(x1, W.x[i]); y1 = Math.max(y1, W.y[i]); sx += W.x[i]; sy += W.y[i]; }
    const n = units.length, cx = Math.floor(sx / n), cy = Math.floor(sy / n);
    const keep = n > 1 && x1 - x0 <= 6 * C.TILE_FP && y1 - y0 <= 6 * C.TILE_FP;
    for (const i of units) {
      let gx = x, gy = y;
      if (keep) {
        const ox = clampX(W, x + W.x[i] - cx), oy = clampY(W, y + W.y[i] - cy);
        if ((W.flags[i] & F.AIR) || M.open(W.map, M.tileAt(W.map, ox, oy))) { gx = ox; gy = oy; }
      }
      /* the start of a patrol is where the unit is when it begins; with Shift, where its last order leaves it */
      let px = W.x[i], py = W.y[i];
      if (c.q && W.oLen[i]) { const s = slot(W, i, W.oLen[i] - 1); px = W.oX[s]; py = W.oY[s]; }
      O.give(W, i, c.k === CMD.MOVE ? ORD.MOVE : ORD.PATROL, gx, gy, 0, c.q, px, py);
    }
  }

  /* ---- the step ---- */
  /** Moves every unit along its order; order is the live slots, lowest first. */
  O.step = (W, order, count) => {
    const T = PC.Data.types;
    for (let k = 0; k < count; k++) {
      const i = order[k];
      W.px[i] = W.x[i]; W.py[i] = W.y[i];
      if (!W.oLen[i]) continue;
      const s = slot(W, i, 0), kind = W.oK[s];
      if (kind !== ORD.MOVE && kind !== ORD.PATROL) continue;
      const t = T[W.type[i]];
      if (advance(W, i, t)) {
        if (kind === ORD.PATROL) {
          /* turn about: the patrol's two ends change places */
          const ax = W.oX[s], ay = W.oY[s];
          W.oX[s] = W.oX2[s]; W.oY[s] = W.oY2[s]; W.oX2[s] = ax; W.oY2[s] = ay;
          begin(W, i);
        } else done(W, i);
      }
    }
  };

  /** One tick's walk for unit i; true when it has arrived. */
  function advance(W, i, t) {
    const air = W.flags[i] & F.AIR, map = W.map;
    const gdx = W.goalX[i] - W.x[i], gdy = W.goalY[i] - W.y[i], gd = Fx.len(gdx, gdy);
    if (gd <= Math.max(t.speed, t.r >> 2)) { W.x[i] = W.goalX[i]; W.y[i] = W.goalY[i]; return true; }
    /* the next point to walk at: a waypoint, or the goal itself */
    let tx = W.goalX[i], ty = W.goalY[i];
    if (!air && W.pathLen[i] > W.pathAt[i]) { const b = i * C.PATH + W.pathAt[i]; tx = W.pathX[b]; ty = W.pathY[b]; }
    const dx = tx - W.x[i], dy = ty - W.y[i], d = Fx.len(dx, dy);
    if (d <= t.speed) {
      W.x[i] = tx; W.y[i] = ty;
      if (!air && W.pathLen[i] > W.pathAt[i]) {
        W.pathAt[i]++;
        /* the path ran out short of the goal (it was longer than a unit holds): plan the rest */
        if (W.pathAt[i] >= W.pathLen[i] && (tx !== W.goalX[i] || ty !== W.goalY[i])) PC.Nav.want(W, i);
      }
    } else {
      const [mx, my] = Fx.toward(dx, dy, t.speed, d);
      if (air || M.open(map, M.tileAt(map, W.x[i] + mx, W.y[i] + my))) { W.x[i] += mx; W.y[i] += my; }
      else PC.Nav.nudge(W, map, i, mx, my);
      W.facing[i] = Fx.heading(dx, dy);
    }
    /* headway: a unit pressed in a crowd short of its goal settles there */
    const nd = Fx.len(W.goalX[i] - W.x[i], W.goalY[i] - W.y[i]);
    if (gd - nd < (t.speed >> 2)) W.stuck[i]++; else if (W.stuck[i] > 0) W.stuck[i]--;
    if (W.stuck[i] > 12 && nd <= t.r * 4) return true;
    if (W.stuck[i] > 36) {
      W.stuck[i] = 0;
      if (++W.repaths[i] > 4) return true;
      if (!air) PC.Nav.want(W, i);
    }
    return false;
  }
})();
