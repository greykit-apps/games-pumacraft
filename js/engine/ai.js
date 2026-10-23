/* PumaCraft engine -- the computer opponent.
 *
 * The bot plays by the rules: it sees what its units see, pays what
 * anyone pays, and acts only through PC.Orders.issue, the door the player
 * uses. Its commands are marked as its own and left out of the replay's
 * log, because a replay runs the bot again and it does exactly the same:
 * it is part of the engine, deterministic, and everything it remembers is
 * in W.ai, a row of integers per player that is saved and hashed with the
 * rest of the state.
 *
 * Every few ticks (more often the harder it is) a bot:
 *   - puts idle workers on the nearest vein, and trains workers until its
 *     veins are full (two and a half a vein, three a refinery);
 *   - keeps its supply ahead of its spending with depots;
 *   - follows its faction's build (js/data/ai_<faction>.js), then keeps
 *     building on its own;
 *   - keeps every factory training, in the proportions its faction gives;
 *   - gathers its army at a rally point in front of its base, and sends it
 *     to attack when it is big enough, each wave bigger than the last;
 *   - turns everything it has on whatever attacks it.
 * Difficulty is how often it thinks, how big its waves are, and how far
 * it can see (only "hard" scouts ahead of its army). */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, CMD = C.CMD, ORD = C.ORD, Fx = PC.Fixed, Wo = PC.World;
  const A = PC.AI = {};
  PC.Data.aiDefs = PC.Data.aiDefs || Object.create(null);
  PC.Data.ai = (faction, def) => { PC.Data.aiDefs[faction] = def; };

  /* W.ai[p * SLOTS + k] */
  const SLOTS = 32;
  const K = { STEP: 0, WAVE: 1, WAVES: 2, ATT_TICK: 3, ATT_X: 4, ATT_Y: 5, TGT_X: 6, TGT_Y: 7, ATTACKING: 8, BUILDER: 9, PEND_TYPE: 10, PEND_TICK: 11, EXPANDED: 12, TRAIN_ROT: 13, SCOUT: 14, STUCK: 15 };
  A.SLOTS = SLOTS; A.K = K;
  const THINK = { easy: 48, normal: 24, hard: 12 };

  const T = () => PC.Data.types;
  const say = (W, p, k, u, extra) => PC.Orders.issue(W, Object.assign({ t: W.hdr[0] + 1, p, k, u, ai: 1 }, extra || {}));

  /** Called once each tick, after everything else, for every bot. */
  A.step = W => {
    for (let p = 0; p < W.players.length; p++) {
      const pl = W.players[p];
      if (!pl.ai || !THINK[pl.ai]) continue;
      watch(W, p);
      if ((W.hdr[0] + p * 7) % THINK[pl.ai] === 0) think(W, p, pl);
    }
  };

  /* every tick: remember the last time something of ours was hit, and where */
  function watch(W, p) {
    const m = W.ai, b = p * SLOTS;
    for (const e of W.ev) {
      if (e[0] !== "hit") continue;
      const v = e[1], a = e[2];
      if (W.owner[v] !== p || !(W.flags[a] & F.ALIVE) || W.owner[a] === p) continue;
      m[b + K.ATT_TICK] = W.hdr[0]; m[b + K.ATT_X] = W.x[a]; m[b + K.ATT_Y] = W.y[a];
    }
  }

  function think(W, p, pl) {
    const def = PC.Data.aiDefs[pl.faction];
    if (!def) return;
    const m = W.ai, b = p * SLOTS, TT = T();
    /* what we have */
    const mine = { workers: [], idle: [], army: [], halls: [], buildings: [], building: 0 };
    for (let i = 0; i < C.MAX_UNITS; i++) {
      const f = W.flags[i];
      if (!(f & F.ALIVE) || W.owner[i] !== p) continue;
      const t = TT[W.type[i]];
      if (f & F.BUILDING) { mine.buildings.push(i); if (t.dropoff && !(f & F.UNDER_CONSTRUCTION)) mine.halls.push(i); if (f & F.UNDER_CONSTRUCTION) mine.building++; continue; }
      if (f & F.WORKER) { mine.workers.push(i); if (!W.oLen[i]) mine.idle.push(i); continue; }
      if (t.weapons.length) mine.army.push(i);
    }
    if (!mine.halls.length && !mine.buildings.length) return;
    const home = mine.halls[0] !== undefined ? mine.halls[0] : mine.buildings[0];
    const id = i => Wo.id(W, i);

    /* ---- workers ---- */
    for (const i of mine.idle) {
      if (Wo.live(W, m[b + K.BUILDER]) === i && W.hdr[0] - m[b + K.PEND_TICK] < 24 * 20) continue;
      const v = nearestVein(W, i);
      if (v >= 0) say(W, p, CMD.GATHER, [id(i)], { tgt: id(v) });
    }
    /* draw vapour: three at each finished refinery */
    for (const r of mine.buildings) {
      const t = TT[W.type[r]];
      if (!t.onVapour || (W.flags[r] & F.UNDER_CONSTRUCTION)) continue;
      let on = 0;
      for (const w of mine.workers) if (PC.Orders.headKind(W, w) === ORD.GATHER && Wo.live(W, W.oT[PC.Orders.slot(W, w, 0)]) === r) on++;
      for (const w of mine.workers) { if (on >= 3) break; if (PC.Orders.headKind(W, w) === ORD.GATHER && !W.carry[w] && Wo.live(W, W.oT[PC.Orders.slot(W, w, 0)]) !== r) { say(W, p, CMD.GATHER, [id(w)], { tgt: id(r) }); on++; } }
    }
    const veins = countVeins(W, mine.halls);
    const wantWorkers = Math.min(60, Math.floor(veins * 5 / 2) + 3 * mine.buildings.filter(r => TT[W.type[r]].onVapour).length + 2);
    const workerType = PC.Data.type(def.workers).id;
    if (mine.workers.length < wantWorkers) for (const h of mine.halls) if (W.qLen[h] < 2 && afford(W, p, TT[workerType].cost)) say(W, p, CMD.TRAIN, [id(h)], { tgt: workerType });

    /* ---- supply ---- */
    const used = W.supplyUsed[p], cap = W.supplyCap[p];
    const depot = TT.find(t => t && t.faction === pl.faction && t.supplyGive && !t.dropoff);
    const pendingSupply = mine.buildings.some(i => (W.flags[i] & F.UNDER_CONSTRUCTION) && TT[W.type[i]].supplyGive) || (m[b + K.PEND_TYPE] === (depot && depot.id) && W.hdr[0] - m[b + K.PEND_TICK] < 24 * 15);
    if (depot && cap < C.SUPPLY_MAX && cap - used < 3 + Math.floor(used / 8) && !pendingSupply && afford(W, p, depot.cost)) { place(W, p, depot, mine, home); return; }

    /* ---- the build ---- */
    const step = m[b + K.STEP];
    if (step < def.build.length) {
      const s = def.build[step];
      if (used >= s.at) {
        if (s.expand) {
          const hall = TT[W.type[home]];
          if (afford(W, p, hall.cost)) { if (expand(W, p, hall, mine)) m[b + K.STEP]++; }
        } else {
          const t = PC.Data.type(s.build);
          if (!PC.Econ.unlocked(W, p, t)) m[b + K.STEP]++;   /* cannot yet: let it pass rather than stall */
          else if (afford(W, p, t.cost)) {
            if (place(W, p, t, mine, home)) { m[b + K.STEP]++; m[b + K.STUCK] = 0; }
            /* nowhere to put it (no free vent, a full base): give up on this step after a few tries */
            else if (++m[b + K.STUCK] > 6) { m[b + K.STEP]++; m[b + K.STUCK] = 0; }
          }
        }
      }
    } else if (mine.building === 0 && W.hdr[0] - m[b + K.PEND_TICK] > 24 * 10) {
      /* the build is done: money left over goes into more factories, up to a limit */
      for (const [key, limit] of def.more || []) {
        const t = PC.Data.type(key);
        const have = mine.buildings.filter(i => W.type[i] === t.id).length;
        if (have < limit && W.ore[p] > t.cost[0] + 150 && W.vapour[p] >= t.cost[1] && PC.Econ.unlocked(W, p, t)) { place(W, p, t, mine, home); break; }
      }
    }

    /* ---- production ---- */
    for (const f of mine.buildings) {
      if (W.flags[f] & F.UNDER_CONSTRUCTION) continue;
      const list = def.train[TT[W.type[f]].key];
      if (!list || W.qLen[f] >= 2) continue;
      const pick = PC.Data.type(list[(m[b + K.TRAIN_ROT] + f) % list.length]);
      if (!PC.Econ.unlocked(W, p, pick) || !afford(W, p, pick.cost)) continue;
      /* save for the build's next step when it is near */
      const next = def.build[m[b + K.STEP]];
      if (next && used >= next.at - 1 && next.build && W.ore[p] - pick.cost[0] < PC.Data.type(next.build).cost[0]) continue;
      say(W, p, CMD.TRAIN, [id(f)], { tgt: pick.id });
      m[b + K.TRAIN_ROT]++;
    }

    /* ---- the army ---- */
    const [rx, ry] = rally(W, home);
    const att = m[b + K.ATT_TICK];
    if (att && W.hdr[0] - att < 24 * 6 && Fx.len(m[b + K.ATT_X] - W.x[home], m[b + K.ATT_Y] - W.y[home]) < 30 * C.TILE_FP) {
      /* defend: everything that can fight goes to the trouble */
      const free = mine.army.filter(i => !W.target[i]);
      if (free.length) say(W, p, CMD.ATTACK, free.map(id), { x: m[b + K.ATT_X], y: m[b + K.ATT_Y] });
      return;
    }
    const [first, more] = (def.waves[pl.ai] || def.waves.normal);
    const need = first + more * m[b + K.WAVES];
    let armySupply = 0;
    for (const i of mine.army) armySupply += TT[W.type[i]].supply;
    if (!m[b + K.ATTACKING] && armySupply >= need) {
      const [tx, ty] = target(W, p);
      m[b + K.ATTACKING] = 1; m[b + K.WAVES]++; m[b + K.TGT_X] = tx; m[b + K.TGT_Y] = ty;
      say(W, p, CMD.ATTACK, mine.army.map(id), { x: tx, y: ty });
      return;
    }
    if (m[b + K.ATTACKING]) {
      /* the wave is spent when few are left fighting: the rest come home and build up again */
      const out = mine.army.filter(i => Fx.len(W.x[i] - W.x[home], W.y[i] - W.y[home]) > 20 * C.TILE_FP);
      if (out.length < 3) m[b + K.ATTACKING] = 0;
      else {
        /* the wave reached its point and found nothing: on to the next thing it knows of */
        const idleOut = out.filter(i => !W.oLen[i] && !W.target[i]);
        if (idleOut.length > out.length / 2) { const [tx, ty] = target(W, p); say(W, p, CMD.ATTACK, idleOut.map(id), { x: tx, y: ty }); }
      }
      /* new troops join the wave */
      const homeIdle = mine.army.filter(i => !W.oLen[i] && !W.target[i] && Fx.len(W.x[i] - W.x[home], W.y[i] - W.y[home]) <= 20 * C.TILE_FP);
      if (homeIdle.length >= 4 && m[b + K.ATTACKING]) say(W, p, CMD.ATTACK, homeIdle.map(id), { x: m[b + K.TGT_X], y: m[b + K.TGT_Y] });
      return;
    }
    const strays = mine.army.filter(i => !W.oLen[i] && !W.target[i] && Fx.len(W.x[i] - rx, W.y[i] - ry) > 5 * C.TILE_FP);
    if (strays.length) say(W, p, CMD.MOVE, strays.map(id), { x: rx, y: ry });
  }

  const afford = (W, p, cost) => W.ore[p] >= cost[0] && W.vapour[p] >= cost[1];
  function nearestVein(W, i) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < C.MAX_UNITS; j++) {
      if (!(W.flags[j] & F.RESOURCE) || T()[W.type[j]].gather !== 1) continue;
      const d = Fx.len(W.x[j] - W.x[i], W.y[j] - W.y[i]);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }
  function countVeins(W, halls) {
    let n = 0;
    for (let j = 0; j < C.MAX_UNITS; j++) {
      if (!(W.flags[j] & F.RESOURCE) || T()[W.type[j]].gather !== 1) continue;
      if (halls.some(h => Fx.len(W.x[j] - W.x[h], W.y[j] - W.y[h]) < 12 * C.TILE_FP)) n++;
    }
    return n;
  }
  /** In front of the base: a third of the way from its hall toward the middle of the map. */
  function rally(W, home) {
    const cx = W.map.w * C.TILE_FP >> 1, cy = W.map.h * C.TILE_FP >> 1;
    return [W.x[home] + Math.floor((cx - W.x[home]) / 4), W.y[home] + Math.floor((cy - W.y[home]) / 4)];
  }
  /** Where to attack: the nearest enemy building the bot has seen; else the nearest enemy start. */
  function target(W, p) {
    const bit = 1 << p, home = W.players[p];
    let best = null, bd = Infinity;
    const sx = W.map.def.starts[p].x * C.TILE_FP, sy = W.map.def.starts[p].y * C.TILE_FP;
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE) || !(W.flags[i] & F.BUILDING) || W.owner[i] >= C.MAX_PLAYERS) continue;
      const q = W.players[W.owner[i]];
      if (!q || q.team === home.team) continue;
      const t = PC.Map.tileAt(W.map, W.x[i], W.y[i]);
      if (t < 0 || !(W.explored[t] & bit)) continue;
      const d = Fx.len(W.x[i] - sx, W.y[i] - sy);
      if (d < bd) { bd = d; best = [W.x[i], W.y[i]]; }
    }
    if (best) return best;
    /* nothing known: search the base sites it cannot see now, the nearest first (enemy starts before the rest) */
    const sites = (W.map.def.bases || W.map.def.starts).map((s, q) => [Math.floor(s.x * C.TILE_FP), Math.floor(s.y * C.TILE_FP), q < W.map.def.starts.length && q < W.players.length && W.players[q].team !== home.team]);
    for (const pass of [true, false]) {
      for (const [x, y, enemyStart] of sites) {
        if (pass && !enemyStart) continue;
        if (PC.Vision.sees(W, p, x, y)) continue;
        const d = Fx.len(x - sx, y - sy);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best) return best;
    }
    /* every site in sight and still nothing: sweep the map's corners in turn */
    const m = W.ai, k = (m[p * SLOTS + K.SCOUT]++) % 4, X = W.map.w * C.TILE_FP, Y = W.map.h * C.TILE_FP;
    return [[X >> 3, Y >> 3], [X - (X >> 3), Y >> 3], [X - (X >> 3), Y - (Y >> 3)], [X >> 3, Y - (Y >> 3)]][k];
  }

  /** A worker to build with: the one remembered, else a gatherer not carrying, nearest the hall. */
  function builder(W, p, mine, home) {
    const m = W.ai, b = p * SLOTS, kept = Wo.live(W, m[b + K.BUILDER]);
    if (kept >= 0 && W.owner[kept] === p && PC.Orders.headKind(W, kept) !== ORD.CONSTRUCT && PC.Orders.headKind(W, kept) !== ORD.BUILD) return kept;
    let best = -1, bd = Infinity;
    for (const w of mine.workers) {
      const k = PC.Orders.headKind(W, w);
      if (k === ORD.BUILD || k === ORD.CONSTRUCT || W.carry[w]) continue;
      const d = Fx.len(W.x[w] - W.x[home], W.y[w] - W.y[home]);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }
  /** Puts up a building of type t near the base; true if a builder was sent. */
  function place(W, p, t, mine, home) {
    const w = builder(W, p, mine, home);
    if (w < 0) return false;
    let site = null;
    if (t.onVapour) {
      let bd = 14 * C.TILE_FP;
      for (let j = 0; j < C.MAX_UNITS; j++) if ((W.flags[j] & F.RESOURCE) && T()[W.type[j]].gather === 2) { const d = Fx.len(W.x[j] - W.x[home], W.y[j] - W.y[home]); if (d < bd) { bd = d; site = [W.x[j], W.y[j]]; } }
    } else site = findSite(W, p, t, home, w);
    if (!site) return false;
    const m = W.ai, b = p * SLOTS;
    m[b + K.BUILDER] = Wo.id(W, w); m[b + K.PEND_TYPE] = t.id; m[b + K.PEND_TICK] = W.hdr[0];
    say(W, p, CMD.BUILD, [Wo.id(W, w)], { x: site[0], y: site[1], tgt: t.id });
    return true;
  }
  /** The nearest site to the hall, in a spiral, where t fits with a tile to spare on every side and does not sit between the hall and its ore. */
  function findSite(W, p, t, home, w) {
    const htx = Math.floor(W.x[home] / C.TILE_FP), hty = Math.floor(W.y[home] / C.TILE_FP), fw = t.foot[0], fh = t.foot[1];
    const veinsNear = [];
    for (let j = 0; j < C.MAX_UNITS; j++) if ((W.flags[j] & F.RESOURCE) && Fx.len(W.x[j] - W.x[home], W.y[j] - W.y[home]) < 12 * C.TILE_FP) veinsNear.push(j);
    for (let r = 3; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = htx + dx, ty = hty + dy;
      const cx = Math.floor((tx + fw / 2) * C.TILE_FP), cy = Math.floor((ty + fh / 2) * C.TILE_FP);
      /* not in the mining lane: keep off the line from the hall to any vein */
      if (veinsNear.some(j => { const vx = W.x[j], vy = W.y[j], hx = W.x[home], hy = W.y[home]; return Math.min(hx, vx) - 2 * C.TILE_FP < cx && cx < Math.max(hx, vx) + 2 * C.TILE_FP && Math.min(hy, vy) - 2 * C.TILE_FP < cy && cy < Math.max(hy, vy) + 2 * C.TILE_FP; })) continue;
      if (PC.Econ.canPlace(W, p, t, cx, cy, w)) continue;
      /* a tile of room round it, so nothing walls the base shut */
      if (!roomy(W, tx, ty, fw, fh)) continue;
      return [cx, cy];
    }
    return null;
  }
  function roomy(W, tx, ty, fw, fh) {
    const m = W.map;
    for (let y = ty - 1; y <= ty + fh; y++) for (let x = tx - 1; x <= tx + fw; x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
      if (W.occ[y * m.w + x] >= 0) return false;
    }
    return true;
  }
  /** A command post at the nearest base site with no hall: the map's naturals and other mains. */
  function expand(W, p, hall, mine) {
    const sites = (W.map.def.bases || W.map.def.starts).map(s => [Math.floor(s.x * C.TILE_FP), Math.floor(s.y * C.TILE_FP)]);
    const home = mine.halls[0];
    if (home === undefined) return false;
    let best = null, bd = Infinity;
    for (const [x, y] of sites) {
      let taken = false;
      for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && (W.flags[i] & F.BUILDING) && T()[W.type[i]].dropoff && Fx.len(W.x[i] - x, W.y[i] - y) < 6 * C.TILE_FP) { taken = true; break; }
      if (taken) continue;
      const d = Fx.len(x - W.x[home], y - W.y[home]);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) return true;   /* nowhere left: count the step done */
    const w = builder(W, p, mine, home);
    if (w < 0) return false;
    const m = W.ai, b = p * SLOTS;
    m[b + K.BUILDER] = Wo.id(W, w); m[b + K.PEND_TYPE] = hall.id; m[b + K.PEND_TICK] = W.hdr[0]; m[b + K.EXPANDED]++;
    say(W, p, CMD.BUILD, [Wo.id(W, w)], { x: best[0], y: best[1], tgt: hall.id });
    return true;
  }
})();
