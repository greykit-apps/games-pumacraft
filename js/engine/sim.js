/* PumaCraft engine -- one tick.
 *
 *   what each player has  ->  commands due  ->  the pathfinder's queue
 *   ->  the unit grid and who sees what  ->  every unit's order (moving,
 *   fighting, gathering, building)  ->  every building's construction and
 *   training  ->  cooldowns  ->  steering  ->  the clock
 *
 *   ->  the computer players, deciding for the next tick
 *
 * Triggers slot into this order when the campaign lands. Nothing outside
 * the engine changes the state except through PC.Orders.issue, which is how
 * the UI, the AI and a replay all speak. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C;
  const scratchOrder = new Int16Array(C.MAX_UNITS);
  const Sim = PC.Sim = {};

  /** A new game: map id, players [{ faction, team }], seed. With bases, each
   * player starts at the map's start for their slot with a town hall, four
   * workers and 50 ore, as the original began. */
  Sim.create = (mapId, players, seed, opts = {}) => {
    const def = PC.Map.registry[mapId] || PC.MapGen.ensure(mapId);
    if (!def) throw new Error("no such map: " + mapId);
    PC.Data.finish();
    const W = PC.newWorld(def, players, seed);
    W.seed = seed >>> 0;
    const fp = v => Math.floor(v * C.TILE_FP);
    for (const r of def.resources || []) {
      const t = PC.Data.type(r.t), i = PC.World.spawn(W, t.id, C.NEUTRAL, fp(r.x + t.foot[0] / 2), fp(r.y + t.foot[1] / 2));
      if (i >= 0 && r.n) W.amount[i] = r.n;
    }
    if (opts.bases) players.forEach((pl, p) => {
      const s = def.starts[p], f = PC.Data.factions[pl.faction], hall = PC.Data.types[f.buildings.find(id => PC.Data.types[id].dropoff)];
      const worker = PC.Data.types[f.units.find(id => PC.Data.types[id].worker)];
      const b = PC.World.spawn(W, hall.id, p, fp(s.x), fp(s.y));
      for (let k = 0; k < 4; k++) {
        const [x, y] = PC.Econ.exitPoint(W, b);
        PC.World.spawn(W, worker.id, p, x + (k * 2 - 3) * 5 * C.ONE, y);
      }
      W.ore[p] = 50;
    });
    Sim.rebuild(W);
    return W;
  };

  /** Rebuilds what is derived from the state: the data's cross-references and
   * who sees what (rebuilt anyway at the start of every tick). */
  Sim.rebuild = W => {
    PC.Data.finish();
    W.checks = W.checks || [];
    W.ev = W.ev || [];
    PC.Econ.count(W);
    const n = PC.World.alive(W, scratchOrder);
    PC.Combat.grid(W, scratchOrder, n);
    PC.Vision.update(W, scratchOrder, n);
  };

  Sim.tick = W => W.hdr[0];

  Sim.step = W => {
    W.ev.length = 0;
    PC.Econ.count(W);
    PC.Orders.applyDue(W);
    PC.Nav.serve(W);
    let n = PC.World.alive(W, scratchOrder);
    PC.Combat.grid(W, scratchOrder, n);
    PC.Vision.update(W, scratchOrder, n);
    PC.Orders.step(W, scratchOrder, n);
    PC.Econ.step(W, scratchOrder, n);
    PC.Combat.cool(W, scratchOrder, n);
    n = PC.World.alive(W, scratchOrder);
    PC.Nav.separate(W, scratchOrder, n);
    PC.AI.step(W);
    W.hdr[0]++;
    if (W.hdr[0] % C.HASH_EVERY === 0) W.checks.push([W.hdr[0], PC.Serial.hash(W)]);
  };

  /** Steps until tick t. */
  Sim.run = (W, t) => { while (W.hdr[0] < t) Sim.step(W); };
})();
