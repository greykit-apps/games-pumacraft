/* PumaCraft engine -- the economy: gathering, building, training.
 *
 * Gathering. A worker walks to its vein, waits its turn (one at a vein at
 * once; after half a second it tries the nearest free vein instead), mines
 * for its type's `mine` ticks, carries its load (eight) to the nearest
 * drop-off its owner has finished, and goes back to the same vein. A vein
 * that runs dry is gone. Vapour is drawn the same way, from a finished
 * refinery built over a vent; the refinery holds what the vent held, and
 * the vent comes back with what is left if the refinery is destroyed.
 *
 * Building. A worker told to build walks to the site; when it arrives the
 * site must still be clear and the cost still affordable, or it gives up
 * and says why. The building appears at a tenth of its health and grows to
 * full over its build time, but only while its builder stays at it (the
 * PDF way; the other factions build differently, later). It gives its
 * supply when it is finished.
 *
 * Training. A building trains from a queue five deep; the cost is paid when
 * a unit is queued and refunded if it is cancelled. The head of the queue
 * waits, at no cost, while its owner lacks the supply for it; once it
 * begins, its supply is held until it is born (or cancelled, or its
 * factory falls), so two factories can never both take the last of it. The unit
 * steps out on the side nearest the building's rally point and goes there.
 *
 * Errors go out as events (W.ev) for the screen to say: "ore", "vapour",
 * "supply", "place", "queue", "tech". */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, ORD = C.ORD, CMD = C.CMD, Fx = PC.Fixed, M = PC.Map, Wo = PC.World;
  const E = PC.Econ = {};
  const T = () => PC.Data.types;
  const err = (W, p, what, i = -1) => W.ev.push(["error", p, what, i]);

  /* ---- what each player has finished, counted at the start of each tick ---- */
  E.count = W => {
    const nt = T().length;
    if (!W.have || W.have.length !== C.MAX_PLAYERS * nt) W.have = new Uint16Array(C.MAX_PLAYERS * nt);
    W.have.fill(0);
    for (let i = 0; i < C.MAX_UNITS; i++) {
      const f = W.flags[i];
      if (!(f & F.ALIVE) || (f & F.UNDER_CONSTRUCTION) || W.owner[i] >= C.MAX_PLAYERS) continue;
      W.have[W.owner[i] * nt + W.type[i]]++;
    }
  };
  E.has = (W, p, type) => W.have[p * T().length + type] > 0;
  E.unlocked = (W, p, t) => t.req.every(r => E.has(W, p, r));
  const afford = (W, p, cost) => W.ore[p] >= cost[0] && W.vapour[p] >= cost[1];
  const pay = (W, p, cost, sign = 1) => { W.ore[p] -= sign * cost[0]; W.vapour[p] -= sign * cost[1]; };

  /* ---- placement ---- */
  /** Whether player p may put a building of type t centred on (cx, cy); the
   * reason it may not, as an error word, if not. builder may stand on the site. */
  E.canPlace = (W, p, t, cx, cy, builder = -1) => {
    const m = W.map, fw = t.foot[0], fh = t.foot[1];
    const tx = Math.floor(cx / C.TILE_FP - fw / 2 + 0.5), ty = Math.floor(cy / C.TILE_FP - fh / 2 + 0.5);
    if (tx < 0 || ty < 0 || tx + fw > m.w || ty + fh > m.h) return "place";
    if (t.onVapour) {
      const v = E.ventAt(W, cx, cy);
      return v < 0 ? "place" : null;
    }
    for (let y = ty; y < ty + fh; y++) for (let x = tx; x < tx + fw; x++) {
      const k = y * m.w + x;
      if (!W.buildable[k] || !(W.explored[k] & (1 << p))) return "place";
    }
    /* a drop-off keeps three tiles from any resource, so workers have room to work */
    if (t.dropoff) for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.RESOURCE)) continue;
      const [rx, ry, rw, rh] = Wo.footprint(W, i);
      if (rx < tx + fw + 3 && rx + rw > tx - 3 && ry < ty + fh + 3 && ry + rh > ty - 3) return "place";
    }
    /* no ground unit stands on it but the builder */
    const x0 = tx * C.TILE_FP, y0 = ty * C.TILE_FP, x1 = (tx + fw) * C.TILE_FP, y1 = (ty + fh) * C.TILE_FP;
    for (let i = 0; i < C.MAX_UNITS; i++) {
      const f = W.flags[i];
      if (!(f & F.ALIVE) || (f & (F.AIR | F.BUILDING | F.RESOURCE)) || i === builder) continue;
      const r = T()[W.type[i]].r;
      if (W.x[i] + r > x0 && W.x[i] - r < x1 && W.y[i] + r > y0 && W.y[i] - r < y1) return "place";
    }
    return null;
  };
  /** The vent whose centre is (cx, cy), or -1. */
  E.ventAt = (W, cx, cy) => {
    for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && T()[W.type[i]].gather === 2 && Math.abs(W.x[i] - cx) < C.TILE_FP && Math.abs(W.y[i] - cy) < C.TILE_FP) return i;
    return -1;
  };

  /** The open tile nearest building b's footprint, toward (tx, ty) if given; its centre, fixed point. */
  E.exitPoint = (W, b, towardX, towardY) => {
    const [fx, fy, fw, fh] = Wo.footprint(W, b), m = W.map;
    let best = null, bestD = Infinity;
    for (let r = 1; r <= 6 && !best; r++) {
      for (let y = fy - r; y < fy + fh + r; y++) for (let x = fx - r; x < fx + fw + r; x++) {
        if (x > fx - r && x < fx + fw + r - 1 && y > fy - r && y < fy + fh + r - 1) continue;   /* the ring only */
        if (x < 0 || y < 0 || x >= m.w || y >= m.h || W.walk[y * m.w + x] !== M.FULL) continue;
        const px = M.centre(x), py = M.centre(y);
        /* toward the rally point if there is one; else out of the bottom, the way the camera faces */
        const d = towardX !== undefined ? Fx.len(px - towardX, py - towardY) : (fy + fh - y) * 1000 + Math.abs(x - (fx + (fw >> 1)));
        if (d < bestD) { bestD = d; best = [px, py]; }
      }
    }
    return best || [W.x[b], W.y[b] + (fh * C.TILE_FP >> 1) + C.TILE_FP];
  };

  /** The nearest finished drop-off of player p to unit i, or -1. */
  function dropoff(W, i) {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < C.MAX_UNITS; j++) {
      const f = W.flags[j];
      if (!(f & F.ALIVE) || (f & F.UNDER_CONSTRUCTION) || W.owner[j] !== W.owner[i] || !T()[W.type[j]].dropoff) continue;
      const d = Fx.len(W.x[j] - W.x[i], W.y[j] - W.y[i]);
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }
  /** Is node j something i can gather from? 1 ore, 2 vapour, 0 no. */
  function source(W, i, j) {
    if (j < 0 || !(W.flags[j] & F.ALIVE)) return 0;
    const t = T()[W.type[j]];
    if (W.flags[j] & F.RESOURCE) return t.gather === 1 ? 1 : 0;   /* a bare vent gives nothing */
    if (t.onVapour && W.owner[j] === W.owner[i] && !(W.flags[j] & F.UNDER_CONSTRUCTION)) return 2;
    return 0;
  }

  /* ---- workers ---- */
  E.begin = (W, i, k, s) => {
    if (k === ORD.GATHER) {
      const j = Wo.live(W, W.oT[s]);
      if (!source(W, i, j)) { PC.Orders.done(W, i); return; }
      W.home[i] = W.oT[s]; W.wait[i] = 0; W.prog[i] = 0;
      PC.Orders.goTo(W, i, W.x[j], W.y[j]);
    } else if (k === ORD.RETURN) {
      const d = dropoff(W, i);
      if (d < 0) { PC.Orders.done(W, i); return; }
      W.target[i] = Wo.id(W, d);
      PC.Orders.goTo(W, i, W.x[d], W.y[d]);
    } else if (k === ORD.BUILD) {
      PC.Orders.goTo(W, i, W.oX[s], W.oY[s]);
    }
  };

  const NEAR = 10 * C.ONE;   /* how close counts as at a vein or a drop-off */
  /** Walks i toward node j until it is at it; true once it is. A worker pressed
   * by a crowd a little short counts as there; one far short tries again,
   * and gives up after a few tries. */
  function reach(W, i, j, s, t) {
    const g = PC.Combat.gap(W, i, j);
    if (g <= NEAR) return true;
    if (!PC.Orders.walk(W, i, t)) return false;
    if (g <= 3 * NEAR) return true;
    PC.Orders.goTo(W, i, W.x[j], W.y[j]);
    if (++W.wait[i] > 4) { W.wait[i] = 0; PC.Orders.done(W, i); }
    return false;
  }
  E.unit = (W, i, kind, s, t) => {
    if (kind === ORD.GATHER) {
      if (W.carry[i]) { W.oK[s] = ORD.RETURN; E.begin(W, i, ORD.RETURN, s); return; }
      let j = Wo.live(W, W.oT[s]);
      if (!source(W, i, j)) { j = nearestVein(W, i, 1, -1); if (j < 0) { PC.Orders.done(W, i); return; } W.oT[s] = Wo.id(W, j); W.home[i] = W.oT[s]; PC.Orders.goTo(W, i, W.x[j], W.y[j]); }
      if (!reach(W, i, j, s, t)) return;
      W.flags[i] &= ~F.MOVING;
      W.facing[i] = Fx.heading(W.x[j] - W.x[i], W.y[j] - W.y[i]);
      const miner = Wo.live(W, W.target[j]);
      if (miner >= 0 && miner !== i && O_minerBusy(W, miner, j)) {
        /* someone is at it: wait, then try another */
        if (++W.wait[i] > 12) {
          const k2 = nearestVein(W, i, source(W, i, j), j);
          if (k2 >= 0) { W.oT[s] = Wo.id(W, k2); W.home[i] = W.oT[s]; W.wait[i] = 0; PC.Orders.goTo(W, i, W.x[k2], W.y[k2]); }
          else W.wait[i] = 0;
        }
        return;
      }
      W.target[j] = Wo.id(W, i); W.wait[i] = 0;
      if (++W.prog[i] < (source(W, i, j) === 2 ? Math.floor(t.mine / 2) : t.mine)) { if (W.prog[i] % 12 === 1) W.ev.push(["mine", i, j]); return; }
      /* a load */
      const kindGot = source(W, i, j), got = Math.min(t.carry, W.amount[j]);
      W.amount[j] -= got; W.prog[i] = 0; W.target[j] = 0;
      W.carry[i] = kindGot; W.amount[i] = kindGot === 2 && got === 0 ? 2 : got;   /* a spent refinery still gives a trickle */
      if (kindGot === 1 && W.amount[j] <= 0) { W.ev.push(["depleted", j]); Wo.kill(W, j); }
      W.oK[s] = ORD.RETURN; E.begin(W, i, ORD.RETURN, s);
      return;
    }
    if (kind === ORD.RETURN) {
      let d = Wo.live(W, W.target[i]);
      if (d < 0) { d = dropoff(W, i); if (d < 0) { PC.Orders.done(W, i); return; } W.target[i] = Wo.id(W, d); PC.Orders.goTo(W, i, W.x[d], W.y[d]); }
      if (!reach(W, i, d, s, t)) return;
      const p = W.owner[i];
      if (W.carry[i] === 1) W.ore[p] += W.amount[i]; else if (W.carry[i] === 2) W.vapour[p] += W.amount[i];
      W.ev.push(["deposit", i, W.carry[i], W.amount[i]]);
      W.carry[i] = 0; W.amount[i] = 0; W.target[i] = 0;
      /* and back to the vein */
      const home = Wo.live(W, W.home[i]);
      if (source(W, i, home)) { W.oK[s] = ORD.GATHER; W.oT[s] = W.home[i]; E.begin(W, i, ORD.GATHER, s); }
      else {
        const k2 = nearestVein(W, i, 1, -1);
        if (k2 >= 0) { W.oK[s] = ORD.GATHER; W.oT[s] = Wo.id(W, k2); E.begin(W, i, ORD.GATHER, s); }
        else PC.Orders.done(W, i);
      }
      return;
    }
    if (kind === ORD.BUILD) {
      const bt = T()[W.oT[s]], cx = W.oX[s], cy = W.oY[s];
      if (!bt || !bt.foot) { PC.Orders.done(W, i); return; }
      const far = Fx.len(cx - W.x[i], cy - W.y[i]) > (Math.max(bt.foot[0], bt.foot[1]) * C.TILE_FP >> 1) + C.TILE_FP;
      if (far && !PC.Orders.walk(W, i, t)) return;
      const p = W.owner[i];
      if (!E.unlocked(W, p, bt)) { err(W, p, "tech", i); PC.Orders.done(W, i); return; }
      if (!afford(W, p, bt.cost)) { err(W, p, W.ore[p] < bt.cost[0] ? "ore" : "vapour", i); PC.Orders.done(W, i); return; }
      const why = E.canPlace(W, p, bt, cx, cy, i);
      if (why) { err(W, p, why, i); PC.Orders.done(W, i); return; }
      pay(W, p, bt.cost);
      let vented = 0;
      if (bt.onVapour) { const v = E.ventAt(W, cx, cy); vented = W.amount[v]; Wo.kill(W, v); }
      const b = Wo.spawn(W, bt.id, p, cx, cy, false);
      if (b < 0) { pay(W, p, bt.cost, -1); PC.Orders.done(W, i); return; }
      if (bt.onVapour) W.amount[b] = vented;
      W.target[b] = Wo.id(W, i);
      W.ev.push(["place", b, i]);
      /* the builder steps off the site to work at its edge */
      const [ex, ey] = E.exitPoint(W, b, W.x[i], W.y[i]);
      W.x[i] = W.px[i] = ex; W.y[i] = W.py[i] = ey;
      W.oK[s] = ORD.CONSTRUCT; W.oT[s] = Wo.id(W, b);
      W.flags[i] &= ~F.MOVING;
      return;
    }
    if (kind === ORD.CONSTRUCT) {
      const b = Wo.live(W, W.oT[s]);
      if (b < 0 || !(W.flags[b] & F.UNDER_CONSTRUCTION)) PC.Orders.done(W, i);
      else { W.facing[i] = Fx.heading(W.x[b] - W.x[i], W.y[b] - W.y[i]); if ((W.hdr[0] + i) % 16 === 0) W.ev.push(["weld", i, b]); }
      return;
    }
    /* an order this build does not know yet: drop it rather than hang */
    PC.Orders.done(W, i);
  };
  /* a miner is busy at vein j if its head order is gathering there */
  function O_minerBusy(W, m, j) {
    if (PC.Orders.headKind(W, m) !== ORD.GATHER) return false;
    return Wo.live(W, W.oT[PC.Orders.slot(W, m, 0)]) === j && PC.Combat.gap(W, m, j) <= NEAR;
  }
  /** The nearest vein of kind (1 ore, 2 vapour) to i within ten tiles, not `except`, preferring a free one. */
  function nearestVein(W, i, kind, except) {
    let best = -1, bestD = 10 * C.TILE_FP;
    for (let j = 0; j < C.MAX_UNITS; j++) {
      if (j === except || source(W, i, j) !== kind) continue;
      const busy = Wo.live(W, W.target[j]) >= 0 ? 3 * C.TILE_FP : 0, d = Fx.len(W.x[j] - W.x[i], W.y[j] - W.y[i]) + busy;
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  /* ---- buildings ---- */
  E.command = (W, c, buildings) => {
    const p = c.p;
    if (c.k === CMD.RALLY) { for (const b of buildings) { W.rallyX[b] = c.x; W.rallyY[b] = c.y; W.rallyT[b] = c.tgt; } return; }
    if (c.k === CMD.TRAIN) {
      const ut = T()[c.tgt];
      if (!ut) return;
      /* the least busy building that can train it */
      let b = -1;
      for (const j of buildings) {
        if ((W.flags[j] & F.UNDER_CONSTRUCTION) || T()[W.type[j]].trains.indexOf(ut.id) < 0) continue;
        if (b < 0 || W.qLen[j] < W.qLen[b]) b = j;
      }
      if (b < 0) return;
      if (!E.unlocked(W, p, ut)) { err(W, p, "tech", b); return; }
      if (W.qLen[b] >= 5) { err(W, p, "queue", b); return; }
      if (!afford(W, p, ut.cost)) { err(W, p, W.ore[p] < ut.cost[0] ? "ore" : "vapour", b); return; }
      pay(W, p, ut.cost);
      W.queue[b * 5 + W.qLen[b]] = ut.id; W.qLen[b]++;
      return;
    }
    if (c.k === CMD.CANCEL) {
      for (const b of buildings) {
        if (W.flags[b] & F.UNDER_CONSTRUCTION) {
          /* three quarters back, and the site is cleared */
          const bt = T()[W.type[b]];
          W.ore[p] += Math.floor(bt.cost[0] * 3 / 4); W.vapour[p] += Math.floor(bt.cost[1] * 3 / 4);
          E.destroyed(W, b); Wo.kill(W, b);
          continue;
        }
        const k = c.tgt >= 0 && c.tgt < W.qLen[b] ? c.tgt : W.qLen[b] - 1;
        if (k < 0) continue;
        const qt = T()[W.queue[b * 5 + k]];
        pay(W, p, qt.cost, -1);
        if (k === 0 && W.prog[b] > 0) W.supplyUsed[p] -= qt.supply;   /* the head was holding its supply */
        for (let m = k; m < W.qLen[b] - 1; m++) W.queue[b * 5 + m] = W.queue[b * 5 + m + 1];
        W.qLen[b]--;
        if (k === 0) W.prog[b] = 0;
      }
    }
  };

  /** Before a building is removed: give back what it stood on (a refinery's vent). */
  E.destroyed = (W, b) => {
    const t = T()[W.type[b]];
    if (t.onVapour) {
      const x = W.x[b], y = W.y[b], amt = W.amount[b];
      /* lift the refinery off its tiles first, so the vent takes them and the kill that follows leaves them be */
      Wo.occupy(W, b, false);
      const v = Wo.spawn(W, PC.Data.type("vapour").id, C.NEUTRAL, x, y, true);
      if (v >= 0) W.amount[v] = amt;
    }
  };

  /** Every building's construction and training, for one tick. */
  E.step = (W, order, count) => {
    const TT = T();
    for (let k = 0; k < count; k++) {
      const b = order[k], f = W.flags[b];
      if (!(f & F.BUILDING) || !(f & F.ALIVE)) continue;
      const t = TT[W.type[b]], p = W.owner[b];
      if (f & F.UNDER_CONSTRUCTION) {
        const w = Wo.live(W, W.target[b]);
        if (w < 0 || PC.Orders.headKind(W, w) !== ORD.CONSTRUCT || Wo.live(W, W.oT[PC.Orders.slot(W, w, 0)]) !== b) continue;   /* no one at it: it waits */
        const n = t.buildTicks || 1, prev = W.prog[b]++, grow = v => Math.floor(t.hp / 10 + (t.hp - Math.floor(t.hp / 10)) * v / n);
        W.hp[b] = Math.min(t.hp, W.hp[b] + grow(W.prog[b]) - grow(prev));
        if (W.prog[b] >= n) {
          W.flags[b] &= ~F.UNDER_CONSTRUCTION; W.prog[b] = 0; W.target[b] = 0;
          if (p < C.MAX_PLAYERS) W.supplyCap[p] += t.supplyGive;
          W.ev.push(["built", b]);
          PC.Orders.done(W, w);
        }
        continue;
      }
      if (!W.qLen[b]) continue;
      const ut = TT[W.queue[b * 5]];
      if (W.prog[b] === 0) {
        /* training begins: its supply is held from now, so two factories cannot both take the last of it */
        if (ut.supply && W.supplyUsed[p] + ut.supply > Math.min(W.supplyCap[p], C.SUPPLY_MAX)) {
          if ((W.hdr[0] + b) % 96 === 0) err(W, p, "supply", b);
          continue;
        }
        W.supplyUsed[p] += ut.supply;
      }
      if (++W.prog[b] < ut.buildTicks) continue;
      /* out it comes */
      const rally = W.rallyX[b] || W.rallyY[b];
      const [ex, ey] = E.exitPoint(W, b, rally ? W.rallyX[b] : undefined, rally ? W.rallyY[b] : undefined);
      const u = Wo.spawn(W, ut.id, p, ut.air ? W.x[b] : ex, ut.air ? W.y[b] : ey, true, true);
      if (u < 0) { W.prog[b] = ut.buildTicks - 1; continue; }
      for (let m = 0; m < 4; m++) W.queue[b * 5 + m] = W.queue[b * 5 + m + 1];
      W.qLen[b]--; W.prog[b] = 0;
      W.facing[u] = 64;
      W.ev.push(["trained", u, b]);
      if (rally) {
        const rt = Wo.live(W, W.rallyT[b]);
        if (rt >= 0 && (W.flags[u] & F.WORKER) && source(W, u, rt)) PC.Orders.give(W, u, ORD.GATHER, 0, 0, W.rallyT[b], false);
        else PC.Orders.give(W, u, ORD.MOVE, W.rallyX[b], W.rallyY[b], 0, false);
      }
    }
  };
  C.SUPPLY_MAX = 200;
})();
