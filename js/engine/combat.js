/* PumaCraft engine -- the fight.
 *
 * Ranges run edge to edge: from the attacker's rim to the target's rim, or
 * to the edge of a building's footprint. Damage is the original's model, in
 * quarter-points so every percentage is exact:
 *   the weapon's damage (plus its upgrades), scaled by its type against the
 *   target's size -- normal 100/100/100, concussive 100/50/25, explosive
 *   50/75/100 against small/medium/large -- then less the target's armour,
 *   and never less than half a point.
 *
 * A unit fights in four ways. Told to attack something, it closes and
 * fires until the target is gone. Told to attack-move, it walks and turns
 * on whatever enemy comes within its acquisition range, then walks on. Left
 * idle, it does the same where it stands, and gives chase a little way.
 * Held, it fires on what comes into range and never moves. A unit that is
 * hit while idle turns on what hit it, if it can. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, Fx = PC.Fixed, Wo = PC.World;
  const K = PC.Combat = {};

  /* ---- a grid of every unit, by 96 px cell, rebuilt each tick ---- */
  const CELL = 4 * C.TILE_FP;
  let G = null;
  K.grid = (W, order, count) => {
    const cw = Math.ceil(W.map.w / 4), ch = Math.ceil(W.map.h / 4);
    if (!G || G.cw !== cw || G.ch !== ch) G = { cw, ch, head: new Int16Array(cw * ch), next: new Int16Array(C.MAX_UNITS) };
    G.head.fill(-1);
    for (let k = count - 1; k >= 0; k--) {
      const i = order[k], cx = Math.floor(W.x[i] / CELL), cy = Math.floor(W.y[i] / CELL);
      if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) continue;
      G.next[i] = G.head[cy * cw + cx]; G.head[cy * cw + cx] = i;
    }
  };
  /** Calls f(j) for every unit within about r of (x, y), slot order within each cell. */
  K.near = (W, x, y, r, f) => {
    const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(G.cw - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(G.ch - 1, Math.floor((y + r) / CELL));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (let j = G.head[cy * G.cw + cx]; j !== -1; j = G.next[j]) f(j);
  };

  /** The gap between i's rim and j's rim (or j's footprint), fixed point. */
  K.gap = (W, i, j) => {
    const T = PC.Data.types, ti = T[W.type[i]], tj = T[W.type[j]];
    let dx = W.x[j] - W.x[i], dy = W.y[j] - W.y[i];
    if (tj.foot) {
      const hw = tj.foot[0] * C.TILE_FP / 2, hh = tj.foot[1] * C.TILE_FP / 2;
      dx = Math.max(0, Math.abs(dx) - hw); dy = Math.max(0, Math.abs(dy) - hh);
      return Math.max(0, Fx.len(dx, dy) - ti.r);
    }
    return Math.max(0, Fx.len(dx, dy) - ti.r - tj.r);
  };

  /** The weapon i would use on j, or null. */
  K.weapon = (W, i, j) => {
    const ws = PC.Data.types[W.type[i]].weapons, air = W.flags[j] & F.AIR;
    for (const w of ws) if (air ? w.air : w.ground) return w;
    return null;
  };
  const hostile = (W, i, j) => {
    const pi = W.owner[i], pj = W.owner[j];
    if (pj >= C.MAX_PLAYERS || pi === pj) return false;
    const a = W.players[pi], b = W.players[pj];
    return !(a && b && a.team === b.team);
  };
  K.hostile = hostile;

  /** The nearest enemy i can hurt and its owner can see, within r; -1 if none. */
  K.acquire = (W, i, r) => {
    let best = -1, bestD = Infinity;
    K.near(W, W.x[i], W.y[i], r + 4 * C.TILE_FP, j => {
      if (j === i || !(W.flags[j] & F.ALIVE) || !hostile(W, i, j) || !K.weapon(W, i, j)) return;
      if (!PC.Vision.seesUnit(W, W.owner[i], j)) return;
      const d = K.gap(W, i, j);
      /* fighters before buildings, then nearest, then lowest slot */
      const score = d + ((W.flags[j] & F.BUILDING) && !PC.Data.types[W.type[j]].weapons.length ? 8 * C.TILE_FP : 0);
      if (d <= r && score < bestD) { bestD = score; best = j; }
    });
    return best;
  };

  /** j takes a hit from i's weapon w. */
  K.hit = (W, i, j, w) => {
    const T = PC.Data.types, tj = T[W.type[j]];
    let d = w.dmg;
    if (W.shield[j] > 0) {
      const s = Math.min(W.shield[j], d);
      W.shield[j] -= s; d -= s;
      if (d <= 0) return;
    }
    d = Math.floor(d * PC.Data.FACTOR[w.dtype][tj.size] / 100) - tj.armor * 4;
    if (d < 2) d = 2;
    W.hp[j] -= d;
    W.ev.push(["hit", j, i]);
    if (W.hp[j] <= 0) {
      W.ev.push(["die", j, W.x[j], W.y[j], W.type[j], W.owner[j]]);
      W.kills[i]++;
      if (W.flags[j] & F.BUILDING) PC.Econ.destroyed(W, j);
      Wo.kill(W, j);
      return;
    }
    /* turned on: an idle unit answers fire it can return */
    if (!W.oLen[j] && !W.target[j] && !(W.flags[j] & F.WORKER) && K.weapon(W, j, i)) W.target[j] = Wo.id(W, i);
  };

  /**
   * One tick of i fighting its target (an id). chase: how far past its
   * acquisition range it will follow (0 to stand). Returns false when the
   * fight is over (the target is gone, out of reach, or out of sight).
   */
  K.fight = (W, i, tid, chase) => {
    const j = Wo.live(W, tid);
    if (j < 0 || !(W.flags[j] & F.ALIVE)) return false;
    const w = K.weapon(W, i, j);
    if (!w || !PC.Vision.seesUnit(W, W.owner[i], j)) return false;
    const gap = K.gap(W, i, j), t = PC.Data.types[W.type[i]];
    W.facing[i] = Fx.heading(W.x[j] - W.x[i], W.y[j] - W.y[i]);
    if (gap <= w.range) {
      W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0;
      if (W.cd[i] === 0) {
        W.cd[i] = w.cd;
        W.ev.push(["fire", i, j, w.sfx]);
        K.hit(W, i, j, w);
      }
      return true;
    }
    if (chase < 0 || gap > w.range + chase) return false;
    /* close in: aim at where the target is; plan again when it has moved off */
    if (Fx.len(W.goalX[i] - W.x[j], W.goalY[i] - W.y[j]) > 2 * C.TILE_FP || !(W.flags[i] & F.MOVING)) {
      W.goalX[i] = W.x[j]; W.goalY[i] = W.y[j]; W.pathLen[i] = 0;
      W.flags[i] |= F.MOVING;
      if (!(W.flags[i] & F.AIR)) PC.Nav.want(W, i);
    }
    PC.Orders.walk(W, i, t);
    return true;
  };

  /** Cooldowns tick down. */
  K.cool = (W, order, count) => { for (let k = 0; k < count; k++) { const i = order[k]; if (W.cd[i]) W.cd[i]--; } };
})();
