/* PumaCraft engine -- the state of a game, all of it.
 *
 * Struct-of-arrays: one typed array per field, indexed by unit slot. Every
 * array is registered, in a fixed order, in W.state; saving, loading and the
 * state hash all walk that one list, so a field added here is saved and
 * hashed without anyone remembering to.
 *
 * A unit's id is its slot plus a generation count above C.ID_BITS, so an
 * order aimed at a unit that has died and whose slot was reused finds a
 * different generation and lets go. Slots are handed out from a stack that
 * is itself state, lowest first. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C, F = C.F, N = C.MAX_UNITS, P = C.MAX_PLAYERS + 1;

  /** A new game on map def with the given players: [{ faction, team }]. */
  PC.newWorld = (mapDef, players, seed) => {
    const map = PC.Map.build(mapDef);
    const W = { map, players: players.map((p, i) => Object.assign({ slot: i }, p)), state: [], log: [], pending: [], seq: 0 };
    const reg = (name, arr) => { W[name] = arr; W.state.push([name, arr]); return arr; };

    /* the clock, the PRNG and the slot stack */
    reg("hdr", new Int32Array(4));          /* [tick, freeTop, nextCmdSeq, spare] */
    reg("rng", new Uint32Array([seed >>> 0]));
    reg("free", new Int16Array(N));
    for (let i = 0; i < N; i++) W.free[i] = N - 1 - i;
    W.hdr[1] = N;

    /* units */
    reg("type", new Uint16Array(N));
    reg("owner", new Uint8Array(N));
    reg("flags", new Uint16Array(N));
    reg("gen", new Uint16Array(N));
    reg("x", new Int32Array(N)); reg("y", new Int32Array(N));
    reg("px", new Int32Array(N)); reg("py", new Int32Array(N));   /* last tick's, for the renderer's lerp */
    reg("hp", new Int32Array(N)); reg("shield", new Int32Array(N)); reg("energy", new Int32Array(N));
    reg("facing", new Uint8Array(N));
    reg("target", new Int32Array(N));
    reg("cd", new Uint16Array(N));
    /* the order ring: C.ORDERS deep, head and length per unit */
    const O = N * C.ORDERS;
    reg("oK", new Uint8Array(O)); reg("oX", new Int32Array(O)); reg("oY", new Int32Array(O)); reg("oT", new Int32Array(O));
    reg("oX2", new Int32Array(O)); reg("oY2", new Int32Array(O));
    reg("oHead", new Uint8Array(N)); reg("oLen", new Uint8Array(N));
    /* the path: waypoints in fixed point, the next one to reach, and a request flag */
    const PW = N * C.PATH;
    reg("pathX", new Int32Array(PW)); reg("pathY", new Int32Array(PW));
    reg("pathLen", new Uint8Array(N)); reg("pathAt", new Uint8Array(N));
    reg("pathWant", new Uint8Array(N));      /* 1 while waiting in the pathfinder's queue */
    reg("goalX", new Int32Array(N)); reg("goalY", new Int32Array(N));
    reg("stuck", new Uint16Array(N));         /* ticks spent making little headway */
    reg("repaths", new Uint8Array(N));
    /* the pathfinder's queue, as state so a save mid-search resumes the same */
    reg("pq", new Int16Array(N)); reg("pqHdr", new Int32Array(2));   /* [head, count] */

    /* players */
    reg("ore", new Int32Array(P)); reg("vapour", new Int32Array(P));
    reg("supplyUsed", new Int32Array(P)); reg("supplyCap", new Int32Array(P));

    /* the ground, where buildings change it */
    reg("walk", map.walk);
    reg("buildable", map.build);
    return W;
  };

  PC.World = {
    idx: id => id & C.ID_MASK,
    /** The live slot an id names, or -1 if that unit is gone. */
    live(W, id) {
      if (id <= 0) return -1;
      const i = id & C.ID_MASK;
      return (W.flags[i] & F.ALIVE) && W.gen[i] === (id >>> C.ID_BITS) ? i : -1;
    },
    id: (W, i) => (W.gen[i] << C.ID_BITS) | i,

    /** A new unit of type t for player p at fixed-point (x, y); its slot, or -1 if full. */
    spawn(W, t, p, x, y) {
      if (W.hdr[1] === 0) return -1;
      const i = W.free[--W.hdr[1]];
      const T = PC.Data.types[t];
      /* generations start at 1, so no live id is ever 0 */
      W.gen[i] = (W.gen[i] % 0x7fff) + 1;
      W.type[i] = t; W.owner[i] = p;
      W.flags[i] = F.ALIVE | (T.kind === "building" ? F.BUILDING : 0) | (T.air ? F.AIR : 0) | (T.worker ? F.WORKER : 0) | (T.kind === "resource" ? F.RESOURCE : 0);
      W.x[i] = W.px[i] = x; W.y[i] = W.py[i] = y;
      W.hp[i] = T.hp; W.shield[i] = T.shield; W.energy[i] = 0;
      W.facing[i] = 64; W.target[i] = 0; W.cd[i] = 0;
      W.oHead[i] = 0; W.oLen[i] = 0;
      W.pathLen[i] = 0; W.pathAt[i] = 0; W.pathWant[i] = 0; W.stuck[i] = 0; W.repaths[i] = 0;
      if (p < C.MAX_PLAYERS) { W.supplyUsed[p] += T.supply; W.supplyCap[p] += T.supplyGive; }
      return i;
    },

    /** Removes slot i; its slot goes back on the stack. */
    kill(W, i) {
      if (!(W.flags[i] & F.ALIVE)) return;
      const T = PC.Data.types[W.type[i]], p = W.owner[i];
      if (p < C.MAX_PLAYERS) { W.supplyUsed[p] -= T.supply; W.supplyCap[p] -= T.supplyGive; }
      W.flags[i] = 0; W.oLen[i] = 0; W.pathLen[i] = 0; W.pathWant[i] = 0;
      W.free[W.hdr[1]++] = i;
    },

    /** Every live slot, lowest first, into out (an Int16Array); returns the count. */
    alive(W, out) {
      let n = 0;
      for (let i = 0; i < N; i++) if (W.flags[i] & F.ALIVE) out[n++] = i;
      return n;
    },
  };
})();
