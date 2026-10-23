/* PumaCraft engine -- commands in, orders out.
 *
 * A command is what a player (or the AI, through the same door) asks for:
 *   { t, p, k, u: [ids], x, y, tgt, q }
 * stamped with the tick it takes effect (t), the player (p), the kind (k, a
 * C.CMD), the units, a point in fixed point, a target (a unit id, or a type
 * id for BUILD and TRAIN), and q for Shift: queue it behind what the units
 * are doing rather than replacing it. Commands wait in W.pending, in (tick,
 * player, sequence) order, and are applied at the start of their tick. Each
 * applied command is appended to W.log, which with the seed is the whole
 * replay.
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

  /** Queues a command; it takes effect at tick cmd.t (no earlier than the current one). */
  O.issue = (W, cmd) => {
    const c = { t: Math.max(cmd.t | 0, W.hdr[0]), p: cmd.p | 0, k: cmd.k | 0, u: (cmd.u || []).map(v => v | 0), x: cmd.x | 0, y: cmd.y | 0, tgt: cmd.tgt | 0, q: cmd.q ? 1 : 0, s: W.hdr[2]++ };
    if (cmd.ai) c.ai = 1;   /* the bot's own: a replay runs the bot again rather than replaying these */
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
      if (!c.ai) W.log.push(c);
      apply(W, c);
    }
  };

  const slot = (W, i, k) => i * C.ORDERS + ((W.oHead[i] + k) % C.ORDERS);
  O.slot = slot;
  const clampX = (W, v) => Math.max(1, Math.min(W.map.w * C.TILE_FP - 1, v));
  const clampY = (W, v) => Math.max(1, Math.min(W.map.h * C.TILE_FP - 1, v));

  /** Gives unit i order kind k; queued behind the rest when q. */
  O.give = (W, i, k, x, y, tgt, q, x2 = 0, y2 = 0) => {
    if (!q) { W.oLen[i] = 0; W.target[i] = 0; }
    if (W.oLen[i] >= C.ORDERS) return false;
    const s = slot(W, i, W.oLen[i]);
    W.oK[s] = k; W.oX[s] = x; W.oY[s] = y; W.oT[s] = tgt; W.oX2[s] = x2; W.oY2[s] = y2;
    W.oLen[i]++;
    if (W.oLen[i] === 1) O.begin(W, i);
    return true;
  };

  /** Sets unit i walking to (x, y). */
  O.goTo = (W, i, x, y) => {
    W.goalX[i] = x; W.goalY[i] = y; W.pathLen[i] = 0; W.pathAt[i] = 0; W.stuck[i] = 0; W.repaths[i] = 0;
    W.flags[i] |= F.MOVING;
    if (!(W.flags[i] & F.AIR)) PC.Nav.want(W, i);
  };

  /** The head order has just become current: aim at it. */
  O.begin = (W, i) => {
    const s = slot(W, i, 0), k = W.oK[s];
    W.stuck[i] = 0; W.repaths[i] = 0; W.pathLen[i] = 0; W.pathAt[i] = 0; W.target[i] = 0;
    W.flags[i] &= ~F.MOVING;
    if (k === ORD.MOVE || k === ORD.PATROL || k === ORD.AMOVE || k === ORD.UNLOAD || k === ORD.LAND) O.goTo(W, i, W.oX[s], W.oY[s]);
    else if (k === ORD.ENTER || k === ORD.REPAIR) { const j = Wo.live(W, W.oT[s]); if (j >= 0) O.goTo(W, i, W.x[j], W.y[j]); }
    else if (k === ORD.GATHER || k === ORD.RETURN || k === ORD.BUILD) PC.Econ.begin(W, i, k, s);
  };
  /** The head order is done; the next begins. */
  O.done = (W, i) => {
    W.oHead[i] = (W.oHead[i] + 1) % C.ORDERS; W.oLen[i]--;
    W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0; W.target[i] = 0;
    if (W.oLen[i] > 0) O.begin(W, i);
  };
  O.headKind = (W, i) => W.oLen[i] ? W.oK[slot(W, i, 0)] : ORD.IDLE;

  function apply(W, c) {
    const units = [];
    for (const id of c.u) {
      const i = Wo.live(W, id);
      if (i < 0 || W.owner[i] !== c.p || (W.flags[i] & F.RESOURCE)) continue;
      if (units.indexOf(i) < 0) units.push(i);
    }
    if (!units.length) return;
    const T = PC.Data.types;
    /* buildings take production commands; everything else takes orders -- except a unit dug in, or digging, which can only fight or pack up, and one carried, which waits to be let out */
    const buildings = units.filter(i => (W.flags[i] & F.BUILDING) && W.mode[i] !== 4);
    const lifted = units.filter(i => (W.flags[i] & F.BUILDING) && W.mode[i] === 4);
    const mobile = units.filter(i => !(W.flags[i] & (F.BUILDING | F.INSIDE)) && (W.mode[i] === 0 || c.k === CMD.ABILITY || c.k === CMD.STOP || (c.k === CMD.ATTACK && c.tgt && W.mode[i] === 1)));
    if (c.k === CMD.TRAIN || c.k === CMD.CANCEL || c.k === CMD.RALLY || c.k === CMD.RESEARCH) { PC.Econ.command(W, c, buildings); return; }
    if (c.k === CMD.ABILITY) { ability(W, c, units); return; }
    const x = clampX(W, c.x), y = clampY(W, c.y);
    /* ---- buildings that fly ---- */
    if (c.k === CMD.LIFT) {
      for (const b of buildings) {
        const t = T[W.type[b]];
        if (!t.lift || (W.flags[b] & F.UNDER_CONSTRUCTION) || W.qLen[b]) continue;
        Wo.occupy(W, b, false); W.flags[b] |= F.AIR; W.mode[b] = 4; W.oLen[b] = 0; W.ev.push(["lift", b, 1]);
      }
      return;
    }
    if (lifted.length) {
      if (c.k === CMD.LAND) for (const b of lifted) O.give(W, b, ORD.LAND, x, y, 0, false);
      else if (c.k === CMD.MOVE) for (const b of lifted) O.give(W, b, ORD.MOVE, x, y, 0, c.q);
      else if (c.k === CMD.STOP) for (const b of lifted) { W.oLen[b] = 0; W.flags[b] &= ~F.MOVING; }
      if (!mobile.length) return;
    }
    /* ---- carriers ---- */
    if (c.k === CMD.UNLOAD) {
      for (const b of units) {
        const t = T[W.type[b]];
        if (t.bunker) O.unloadAll(W, b);
        else if (t.cargo) O.give(W, b, ORD.UNLOAD, c.x || c.y ? x : W.x[b], c.x || c.y ? y : W.y[b], 0, c.q);
      }
      return;
    }
    if (!mobile.length) return;
    if (c.k === CMD.LOAD) {
      for (const i of mobile) if (!(W.flags[i] & F.AIR) && !T[W.type[i]].cargo) O.give(W, i, ORD.ENTER, 0, 0, c.tgt, c.q);
      return;
    }
    if (c.k === CMD.REPAIR) { for (const i of mobile) if (W.flags[i] & F.WORKER) O.give(W, i, ORD.REPAIR, 0, 0, c.tgt, c.q); return; }
    if (c.k === CMD.STOP) { for (const i of mobile) { W.oLen[i] = 0; W.target[i] = 0; W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0; W.pathWant[i] = 0; } return; }
    if (c.k === CMD.HOLD) { for (const i of mobile) O.give(W, i, ORD.HOLD, W.x[i], W.y[i], 0, c.q); return; }
    if (c.k === CMD.ATTACK && c.tgt) {
      for (const i of mobile) {
        if (!PC.Data.types[W.type[i]].weapons.length) continue;
        if (W.mode[i] === 1) W.target[i] = c.tgt;   /* dug in: it turns its gun, it does not go */
        else O.give(W, i, ORD.ATTACK, 0, 0, c.tgt, c.q);
      }
      return;
    }
    if (c.k === CMD.GATHER) { for (const i of mobile) if (W.flags[i] & F.WORKER) O.give(W, i, ORD.GATHER, 0, 0, c.tgt, c.q); return; }
    if (c.k === CMD.RETURN) { for (const i of mobile) if ((W.flags[i] & F.WORKER) && W.carry[i]) O.give(W, i, ORD.RETURN, 0, 0, 0, c.q); return; }
    if (c.k === CMD.BUILD) { const i = mobile.find(j => W.flags[j] & F.WORKER); if (i !== undefined) O.give(W, i, ORD.BUILD, x, y, c.tgt, c.q); return; }
    const kind = c.k === CMD.MOVE ? ORD.MOVE : c.k === CMD.PATROL ? ORD.PATROL : c.k === CMD.ATTACK ? ORD.AMOVE : 0;
    if (!kind) return;
    /* keep a small group's shape */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    for (const i of mobile) { x0 = Math.min(x0, W.x[i]); y0 = Math.min(y0, W.y[i]); x1 = Math.max(x1, W.x[i]); y1 = Math.max(y1, W.y[i]); sx += W.x[i]; sy += W.y[i]; }
    const n = mobile.length, cx = Math.floor(sx / n), cy = Math.floor(sy / n);
    const keep = n > 1 && x1 - x0 <= 6 * C.TILE_FP && y1 - y0 <= 6 * C.TILE_FP;
    for (const i of mobile) {
      let gx = x, gy = y;
      if (keep) {
        const ox = clampX(W, x + W.x[i] - cx), oy = clampY(W, y + W.y[i] - cy);
        if ((W.flags[i] & F.AIR) || M.open(W.map, M.tileAt(W.map, ox, oy))) { gx = ox; gy = oy; }
      }
      let px = W.x[i], py = W.y[i];
      if (c.q && W.oLen[i]) { const s = slot(W, i, W.oLen[i] - 1); px = W.oX[s]; py = W.oY[s]; }
      O.give(W, i, kind, gx, gy, 0, c.q, px, py);
    }
  }

  /* ---- abilities a unit uses on itself, by number: 1 the adrenal shot ---- */
  O.ABILITY = { stim: 1, siege: 2, cloak: 3, matrix: 4, scan: 5 };
  function ability(W, c, units) {
    const T = PC.Data.types;
    if (c.tgt === O.ABILITY.cloak) {
      /* cloak (x 0) or uncloak (x 2), or toggle (x 1); cloaking costs 25 energy up front */
      const up = PC.Data.upByKey.a_cloak;
      if (!up || !W.upg[c.p * 64 + up.id]) return;
      for (const i of units) {
        if (!T[W.type[i]].abilities.includes("cloak")) continue;
        const on = W.flags[i] & F.CLOAKED, want = c.x === 1 ? !on : c.x !== 2;
        if (want && !on && W.energy[i] >= 25) { W.energy[i] -= 25; W.flags[i] |= F.CLOAKED; W.ev.push(["cloak", i, 1]); }
        else if (!want && on) { W.flags[i] &= ~F.CLOAKED; W.ev.push(["cloak", i, 0]); }
      }
      return;
    }
    if (c.tgt === O.ABILITY.scan) {
      /* a scanner sweep at (x, y): 50 energy from a Command Post, an eye there for ten seconds */
      const caster = units.find(i => T[W.type[i]].abilities.includes("scan") && W.energy[i] >= 50 && W.mode[i] === 0);
      const eye = PC.Data.byKey.a_scan;
      if (caster === undefined || !eye) return;
      W.energy[caster] -= 50;
      Wo.spawn(W, eye.id, c.p, clampX(W, c.x), clampY(W, c.y));
      W.ev.push(["scan", caster, c.x, c.y]);
      return;
    }
    if (c.tgt === O.ABILITY.matrix) {
      /* a defensive matrix on the unit named in x: 100 energy, 250 points of hits taken for it, ten seconds */
      const j = Wo.live(W, c.x);
      if (j < 0 || PC.Combat.hostile(W, units[0], j) || W.owner[j] >= C.MAX_PLAYERS) return;
      const caster = units.find(i => T[W.type[i]].abilities.includes("matrix") && W.energy[i] >= 100);
      if (caster === undefined) return;
      W.energy[caster] -= 100; W.matrix[j] = 1000; W.matrixT[j] = 240;
      W.ev.push(["matrix", caster, j]);
      return;
    }
    if (c.tgt === O.ABILITY.siege) {
      /* dig in, or pack up: each unit by the state it is in */
      const up = PC.Data.upByKey.a_siege, dig = c.x !== 2;   /* x 2 asks to pack up; anything else, to dig in (or toggle with x 1) */
      for (const i of units) {
        const t = T[W.type[i]];
        if (!t.siege) continue;
        const toggle = c.x === 1;
        if (W.mode[i] === 0 && (dig || toggle) && up && W.upg[c.p * 64 + up.id]) {
          W.mode[i] = 2; W.modeT[i] = t.siege.deploy; W.oLen[i] = 0; W.target[i] = 0; W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0;
          W.ev.push(["siege", i, 1]);
        } else if (W.mode[i] === 1 && (!dig || toggle)) {
          W.mode[i] = 3; W.modeT[i] = t.siege.deploy; W.target[i] = 0;
          W.ev.push(["siege", i, 0]);
        }
      }
      return;
    }
    if (c.tgt === O.ABILITY.stim) {
      const up = PC.Data.upByKey.a_stim;
      if (!up || !W.upg[c.p * 64 + up.id]) return;
      for (const i of units) {
        const t = T[W.type[i]];
        if (!t.abilities.includes("stim")) continue;
        const pay = t.stimCost;
        if (W.hp[i] <= pay) continue;
        W.hp[i] -= pay; W.stim[i] = 264;
        W.ev.push(["stim", i]);
      }
    }
  }

  /* ---- carrying ---- */
  /** The slots used in container b. */
  O.cargoUsed = (W, b) => { const me = Wo.id(W, b); let n = 0; for (let j = 0; j < C.MAX_UNITS; j++) if ((W.flags[j] & F.ALIVE) && W.inside[j] === me) n += PC.Data.types[W.type[j]].slots; return n; };
  O.capacity = (W, b) => { const t = PC.Data.types[W.type[b]]; return t.cargo || (t.bunker ? t.bunker.slots : 0); };
  /** Lets everyone out of container b, onto the open ground nearest it. */
  O.unloadAll = (W, b) => {
    const me = Wo.id(W, b), t = PC.Data.types[W.type[b]], used = [];
    for (let j = 0; j < C.MAX_UNITS; j++) {
      if (!(W.flags[j] & F.ALIVE) || W.inside[j] !== me) continue;
      let spot = null;
      if (t.foot) spot = PC.Econ.exitPoint(W, b, W.x[b], W.y[b] + 3 * C.TILE_FP);
      else {
        const tx = Math.floor(W.x[b] / C.TILE_FP), ty = Math.floor(W.y[b] / C.TILE_FP);
        for (let r = 0; r < 6 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const k = (ty + dy) * W.map.w + tx + dx;
          if (tx + dx < 0 || ty + dy < 0 || tx + dx >= W.map.w || ty + dy >= W.map.h || W.walk[k] !== M.FULL || used.includes(k)) continue;
          used.push(k); spot = [M.centre(tx + dx), M.centre(ty + dy)];
        }
      }
      if (!spot) continue;   /* nowhere to stand: they stay in */
      W.inside[j] = 0; W.flags[j] &= ~F.INSIDE;
      W.x[j] = W.px[j] = spot[0]; W.y[j] = W.py[j] = spot[1];
      W.ev.push(["unload", j, b]);
    }
  };
  /** Bunker b's extra reach for those inside it: its own range, from its rim. */
  const bunkerReach = (W, i) => { const b = Wo.live(W, W.inside[i]); if (b < 0) return 0; const t = PC.Data.types[W.type[b]]; return t.bunker ? t.bunker.range + (Math.min(t.foot[0], t.foot[1]) * C.TILE_FP >> 1) : 0; };
  O.bunkerReach = bunkerReach;

  /* ---- the step ---- */
  const reachOf = (W, i, t) => { let r = t.acquire; for (const w of PC.Combat.weapons(W, i)) if (w.range > r) r = w.range; return r; };
  const shortest = (W, i) => { let r = 1 << 30; for (const w of PC.Combat.weapons(W, i)) if (w.range < r) r = w.range; return r; };

  /** Every unit does its head order; order is the live slots, lowest first. */
  O.step = (W, order, count) => {
    const T = PC.Data.types, tick = W.hdr[0];
    for (let k = 0; k < count; k++) {
      const i = order[k];
      W.px[i] = W.x[i]; W.py[i] = W.y[i];
      const fl = W.flags[i];
      if (!(fl & F.ALIVE) || (fl & (F.RESOURCE | F.EFFECT))) continue;   /* killed earlier this tick, or not a unit */
      if (fl & F.INSIDE) {
        /* carried: it goes where its carrier goes; in a Bunker it fires out, with the Bunker's reach */
        const b = Wo.live(W, W.inside[i]);
        if (b < 0) { W.inside[i] = 0; W.flags[i] &= ~F.INSIDE; continue; }
        W.x[i] = W.px[i] = W.x[b]; W.y[i] = W.py[i] = W.y[b];
        if (PC.Data.types[W.type[b]].bunker && PC.Data.types[W.type[i]].weapons.length) {
          if (W.target[i] && !PC.Combat.fight(W, i, W.target[i], -1)) W.target[i] = 0;
          else if (!W.target[i] && (tick + i) % 8 === 0) { const j = PC.Combat.acquire(W, i, reachOf(W, i, T[W.type[i]]) + bunkerReach(W, i)); if (j >= 0) W.target[i] = Wo.id(W, j); }
        }
        continue;
      }
      if ((fl & F.BUILDING) && W.mode[i] === 4) {
        /* a building in the air: it flies where it is sent, and lands where it is told if the ground is clear */
        const t = T[W.type[i]], kind = O.headKind(W, i), s = slot(W, i, 0), ft = { speed: t.liftSpeed, r: t.r };
        if ((kind === ORD.MOVE || kind === ORD.LAND) && O.walk(W, i, ft)) {
          if (kind === ORD.LAND) {
            const why = PC.Econ.canPlace(W, W.owner[i], t, W.oX[s], W.oY[s], -1, i);
            if (why) W.ev.push(["error", W.owner[i], why, i]);
            else { W.x[i] = W.px[i] = W.oX[s]; W.y[i] = W.py[i] = W.oY[s]; W.mode[i] = 0; W.flags[i] &= ~F.AIR; Wo.occupy(W, i, true); W.ev.push(["lift", i, 0]); }
          }
          O.done(W, i);
        }
        continue;
      }
      if (fl & F.BUILDING) {
        /* a tower: fires on what comes in range, and never moves */
        if ((fl & F.UNDER_CONSTRUCTION) || !T[W.type[i]].weapons.length) continue;
        if (W.target[i] && !PC.Combat.fight(W, i, W.target[i], -1)) W.target[i] = 0;
        else if (!W.target[i] && (tick + i) % 8 === 0) { const j = PC.Combat.acquire(W, i, reachOf(W, i, T[W.type[i]])); if (j >= 0) W.target[i] = Wo.id(W, j); }
        continue;
      }
      const t = T[W.type[i]], s = slot(W, i, 0), armed = t.weapons.length > 0 && !(fl & F.WORKER);
      const scan = armed && (tick + i) % 8 === 0;
      if (W.mode[i] >= 2) {
        /* digging in or packing up: nothing else until it is done */
        if (--W.modeT[i] === 0) W.mode[i] = W.mode[i] === 2 ? 1 : 0;
        continue;
      }
      /* dug in, a unit fights where it stands, as if held */
      const kind = W.mode[i] === 1 ? ORD.HOLD : O.headKind(W, i);
      if (t.heal && (kind === ORD.IDLE || kind === ORD.HOLD || kind === ORD.AMOVE)) {
        /* a healer mends where it stands (held), or goes to who needs it; on an attack-move it mends on the way */
        if (PC.Combat.mend(W, i, t, kind !== ORD.HOLD)) continue;
        if (kind !== ORD.AMOVE) continue;
      }
      if (kind === ORD.IDLE || kind === ORD.HOLD) {
        if (W.target[i]) {
          if (!PC.Combat.fight(W, i, W.target[i], kind === ORD.HOLD ? -1 : 3 * C.TILE_FP)) { W.target[i] = 0; W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0; }
        } else if (scan) {
          const j = PC.Combat.acquire(W, i, kind === ORD.HOLD ? shortest(W, i) : reachOf(W, i, t));
          if (j >= 0) W.target[i] = Wo.id(W, j);
        }
        continue;
      }
      if (kind === ORD.ATTACK) { if (!PC.Combat.fight(W, i, W.oT[s], 1 << 30)) O.done(W, i); continue; }
      if (kind === ORD.AMOVE || kind === ORD.PATROL) {
        if (W.target[i]) {
          if (PC.Combat.fight(W, i, W.target[i], 2 * C.TILE_FP)) continue;
          W.target[i] = 0; O.goTo(W, i, W.oX[s], W.oY[s]);
        } else if (scan) {
          const j = PC.Combat.acquire(W, i, reachOf(W, i, t));
          if (j >= 0) { W.target[i] = Wo.id(W, j); continue; }
        }
      }
      if (kind === ORD.MOVE || kind === ORD.AMOVE || kind === ORD.PATROL) {
        if (O.walk(W, i, t)) {
          if (kind === ORD.PATROL) {
            const ax = W.oX[s], ay = W.oY[s];
            W.oX[s] = W.oX2[s]; W.oY[s] = W.oY2[s]; W.oX2[s] = ax; W.oY2[s] = ay;
            O.begin(W, i);
          } else O.done(W, i);
        }
        continue;
      }
      if (kind === ORD.ENTER) {
        /* walk to the carrier, and in, if there is room */
        const b = Wo.live(W, W.oT[s]), bt = b >= 0 ? T[W.type[b]] : null;
        if (!bt || W.owner[b] !== W.owner[i] || !(bt.cargo || bt.bunker) || (bt.bunker && !t.bio) || (W.flags[b] & F.UNDER_CONSTRUCTION)) { O.done(W, i); continue; }
        if (PC.Combat.gap(W, i, b) <= 12 * C.ONE) {
          if (O.cargoUsed(W, b) + t.slots > O.capacity(W, b)) { W.ev.push(["error", W.owner[i], "full", i]); O.done(W, i); continue; }
          W.inside[i] = Wo.id(W, b); W.flags[i] |= F.INSIDE; W.flags[i] &= ~F.MOVING; W.target[i] = 0; W.oLen[i] = 0; W.pathLen[i] = 0;
          W.ev.push(["load", i, b]);
          continue;
        }
        if (Fx.len(W.goalX[i] - W.x[b], W.goalY[i] - W.y[b]) > C.TILE_FP || !(W.flags[i] & F.MOVING)) O.goTo(W, i, W.x[b], W.y[b]);
        if (O.walk(W, i, t) && PC.Combat.gap(W, i, b) > 3 * C.TILE_FP) O.goTo(W, i, W.x[b], W.y[b]);
        continue;
      }
      if (kind === ORD.UNLOAD) {
        if (O.walk(W, i, t) || (W.x[i] === W.oX[s] && W.y[i] === W.oY[s])) { O.unloadAll(W, i); O.done(W, i); }
        continue;
      }
      PC.Econ.unit(W, i, kind, s, t);
    }
  };

  /** One tick's walk for unit i toward its goal; true when it has arrived. */
  O.walk = (W, i, t0) => {
    /* under an adrenal shot a unit moves half again as fast */
    const t = W.stim[i] ? { speed: t0.speed + (t0.speed >> 1), r: t0.r } : t0;
    const air = W.flags[i] & F.AIR, map = W.map;
    const gdx = W.goalX[i] - W.x[i], gdy = W.goalY[i] - W.y[i], gd = Fx.len(gdx, gdy);
    if (gd <= Math.max(t.speed, t.r >> 2)) {
      if (air || M.open(map, M.tileAt(map, W.goalX[i], W.goalY[i]))) { W.x[i] = W.goalX[i]; W.y[i] = W.goalY[i]; }
      W.flags[i] &= ~F.MOVING;
      return true;
    }
    W.flags[i] |= F.MOVING;
    let tx = W.goalX[i], ty = W.goalY[i];
    if (!air && W.pathLen[i] > W.pathAt[i]) { const b = i * C.PATH + W.pathAt[i]; tx = W.pathX[b]; ty = W.pathY[b]; }
    const dx = tx - W.x[i], dy = ty - W.y[i], d = Fx.len(dx, dy);
    if (d <= t.speed) {
      if (air || M.open(map, M.tileAt(map, tx, ty))) { W.x[i] = tx; W.y[i] = ty; }
      if (!air && W.pathLen[i] > W.pathAt[i]) {
        W.pathAt[i]++;
        if (W.pathAt[i] >= W.pathLen[i] && (tx !== W.goalX[i] || ty !== W.goalY[i])) PC.Nav.want(W, i);
      }
    } else {
      const [mx, my] = Fx.toward(dx, dy, t.speed, d);
      if (air || M.open(map, M.tileAt(map, W.x[i] + mx, W.y[i] + my))) { W.x[i] += mx; W.y[i] += my; }
      else PC.Nav.nudge(W, map, i, mx, my);
      W.facing[i] = Fx.heading(dx, dy);
    }
    const nd = Fx.len(W.goalX[i] - W.x[i], W.goalY[i] - W.y[i]);
    if (gd - nd < (t.speed >> 2)) W.stuck[i]++; else if (W.stuck[i] > 0) W.stuck[i]--;
    if (W.stuck[i] > 12 && nd <= t.r * 4) { W.flags[i] &= ~F.MOVING; return true; }
    if (W.stuck[i] > 36) {
      W.stuck[i] = 0;
      if (++W.repaths[i] > 4) { W.flags[i] &= ~F.MOVING; return true; }
      if (!air) PC.Nav.want(W, i);
    }
    return false;
  };
})();
