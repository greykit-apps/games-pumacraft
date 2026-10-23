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

  /** i's weapons as it stands now: dug in, a sieged unit's own. */
  K.weapons = (W, i) => { const t = PC.Data.types[W.type[i]]; return W.mode[i] === 1 && t.siege ? t.siege.weapons : t.weapons; };
  /** The weapon i would use on j, or null. */
  K.weapon = (W, i, j) => {
    const air = W.flags[j] & F.AIR;
    for (const w of K.weapons(W, i)) if (air ? w.air : w.ground) return w;
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
      if (j === i || !(W.flags[j] & F.ALIVE) || !hostile(W, i, j)) return;
      const w = K.weapon(W, i, j);
      if (!w || !PC.Vision.seesUnit(W, W.owner[i], j)) return;
      const d = K.gap(W, i, j);
      if (d < w.min) return;
      /* fighters before buildings, then nearest, then lowest slot */
      const score = d + ((W.flags[j] & F.BUILDING) && !PC.Data.types[W.type[j]].weapons.length ? 8 * C.TILE_FP : 0);
      if (d <= r && score < bestD) { bestD = score; best = j; }
    });
    return best;
  };

  /** i's weapon w, upgraded: its damage a hit, in quarter-points. */
  K.damage = (W, i, w) => w.dmg + (w.upgrade !== null ? W.upg[W.owner[i] * 64 + w.upgrade] * w.upg : 0);
  /** j's armour, upgraded, in whole points. */
  K.armour = (W, j) => { const t = PC.Data.types[W.type[j]]; return t.armor + (t.armorUpgrade !== null && W.owner[j] < C.MAX_PLAYERS ? W.upg[W.owner[j] * 64 + t.armorUpgrade] : 0); };

  /** j takes a hit from i's weapon w: every one of its hits, scaled by k percent (splash). */
  K.hit = (W, i, j, w, k = 100) => {
    const T = PC.Data.types, tj = T[W.type[j]], arm = K.armour(W, j);
    for (let h = 0; h < w.hits && (W.flags[j] & F.ALIVE); h++) {
      let d = Math.floor(K.damage(W, i, w) * k / 100);
      if (W.shield[j] > 0) {
        const s = Math.min(W.shield[j], d);
        W.shield[j] -= s; d -= s;
        if (d <= 0) continue;
      }
      d = Math.floor(d * PC.Data.FACTOR[w.dtype][tj.size] / 100) - arm * 4;
      if (d < 2) d = 2;
      W.hp[j] -= d;
      if (W.hp[j] <= 0) break;
    }
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
    if (gap < w.min) return false;   /* too close for this gun (a dug-in howitzer's) */
    W.facing[i] = Fx.heading(W.x[j] - W.x[i], W.y[j] - W.y[i]);
    if (gap <= w.range) {
      W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0;
      if (W.cd[i] === 0) {
        W.cd[i] = W.stim[i] ? w.cd >> 1 : w.cd;
        W.ev.push(["fire", i, j, w.sfx]);
        const jx = W.x[j], jy = W.y[j];
        K.hit(W, i, j, w);
        if (w.splash) splash(W, i, j, w, jx, jy);
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

  /** Splash: enemies round the point struck take all, half or a quarter of the hit by how near they stand. Friends are spared. */
  function splash(W, i, j, w, x, y) {
    const [r1, r2, r3] = w.splash, ground = !(W.flags[j] & F.AIR);
    K.near(W, x, y, r3, k => {
      /* most splash spares friends; a siege shell spares no one but the gun that fired it */
      if (k === j || k === i || !(W.flags[k] & F.ALIVE) || (W.flags[k] & F.RESOURCE) || (!w.friendly && !hostile(W, i, k))) return;
      if (!(W.flags[k] & F.AIR) !== ground) return;
      const d = Math.max(0, Fx.len(W.x[k] - x, W.y[k] - y) - PC.Data.types[W.type[k]].r);
      const pct = d <= r1 ? 100 : d <= r2 ? 50 : d <= r3 ? 25 : 0;
      if (pct) K.hit(W, i, k, w, pct);
    });
  }

  /** Cooldowns tick down, adrenal shots wear off, energy comes back (a point every 30 ticks). */
  K.cool = (W, order, count) => {
    const T = PC.Data.types, tick = W.hdr[0];
    for (let k = 0; k < count; k++) {
      const i = order[k];
      if (W.cd[i]) W.cd[i]--;
      if (W.stim[i]) W.stim[i]--;
      const t = T[W.type[i]];
      if (t.energy && W.energy[i] < t.energy && (tick + i) % 30 === 0) W.energy[i]++;
    }
  };

  /* ---- healing: a healer finds the nearest hurt friend of flesh and blood and mends them ---- */
  /** One tick of healer i: true while it has someone to mend. */
  K.mend = (W, i, t, chase) => {
    let j = Wo.live(W, W.target[i]);
    const bio = k => (W.flags[k] & F.ALIVE) && PC.Data.types[W.type[k]].bio && W.hp[k] < PC.Data.types[W.type[k]].hp && !K.hostile(W, i, k) && W.owner[k] < C.MAX_PLAYERS && k !== i;
    if (j >= 0 && !bio(j)) { W.target[i] = 0; j = -1; }
    if (j < 0) {
      if ((W.hdr[0] + i) % 8 !== 0) return false;
      let bd = 6 * C.TILE_FP;
      K.near(W, W.x[i], W.y[i], bd, k => { if (!bio(k)) return; const d = Fx.len(W.x[k] - W.x[i], W.y[k] - W.y[i]); if (d < bd) { bd = d; j = k; } });
      if (j < 0) return false;
      W.target[i] = Wo.id(W, j);
    }
    const gap = K.gap(W, i, j), h = t.heal;
    W.facing[i] = Fx.heading(W.x[j] - W.x[i], W.y[j] - W.y[i]);
    if (gap <= h.range) {
      W.flags[i] &= ~F.MOVING; W.pathLen[i] = 0;
      if ((W.hdr[0] + i) % h.every === 0 && W.energy[i] >= h.cost) {
        W.energy[i] -= h.cost;
        W.hp[j] = Math.min(PC.Data.types[W.type[j]].hp, W.hp[j] + h.amount);
        if ((W.hdr[0] + i) % (h.every * 6) === 0) W.ev.push(["heal", i, j]);
      }
      return true;
    }
    if (!chase) return false;
    if (Fx.len(W.goalX[i] - W.x[j], W.goalY[i] - W.y[j]) > C.TILE_FP || !(W.flags[i] & F.MOVING)) { W.goalX[i] = W.x[j]; W.goalY[i] = W.y[j]; W.pathLen[i] = 0; W.flags[i] |= F.MOVING; PC.Nav.want(W, i); }
    PC.Orders.walk(W, i, t);
    return true;
  };
})();
