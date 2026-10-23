/* PumaCraft engine -- one tick.
 *
 *   commands due  ->  the pathfinder's queue  ->  every unit's order
 *   ->  steering  ->  the clock
 *
 * Combat, the economy, the AI, triggers and vision slot into this order as
 * they land. Nothing outside the engine changes the state except through
 * PC.Orders.issue, which is how the UI, the AI and a replay all speak. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C;
  const scratchOrder = new Int16Array(C.MAX_UNITS);
  const Sim = PC.Sim = {};

  /** A new game: map id, players [{ faction, team }], seed. */
  Sim.create = (mapId, players, seed) => {
    const def = PC.Map.registry[mapId];
    if (!def) throw new Error("no such map: " + mapId);
    const W = PC.newWorld(def, players, seed);
    W.seed = seed >>> 0;
    Sim.rebuild(W);
    return W;
  };

  /** Rebuilds what is derived from the state (nothing yet beyond the lists). */
  Sim.rebuild = W => { W.checks = W.checks || []; };

  Sim.tick = W => W.hdr[0];

  Sim.step = W => {
    PC.Orders.applyDue(W);
    PC.Nav.serve(W);
    const n = PC.World.alive(W, scratchOrder);
    PC.Orders.step(W, scratchOrder, n);
    PC.Nav.separate(W, scratchOrder, n);
    W.hdr[0]++;
    if (W.hdr[0] % C.HASH_EVERY === 0) W.checks.push([W.hdr[0], PC.Serial.hash(W)]);
  };

  /** Steps until tick t. */
  Sim.run = (W, t) => { while (W.hdr[0] < t) Sim.step(W); };
})();
