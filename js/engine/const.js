/* PumaCraft engine -- the numbers everything else is built from.
 *
 * The engine (js/engine/) is DOM-free and deterministic: the same seed and
 * the same commands give the same game, tick for tick, on any machine. That
 * is what makes replays, save/load, the headless bot in CI, and one day
 * lockstep multiplayer possible. The rules that keep it so:
 *   - integers only: positions are fixed point (FP fractional bits), and
 *     only + - * / and Math.floor/abs/min/max/imul touch them;
 *   - no Math.sin/cos/atan2/sqrt/pow/random, no Date or performance: angles
 *     come from the committed tables (tables.js), roots from isqrt, chance
 *     from the state's own PRNG;
 *   - state lives in typed arrays in a fixed order; nothing iterates a Map
 *     or Set to decide anything.
 * tools/lint-determinism.js enforces the first two. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C = {};

  /* ---- time ---- */
  C.TICK = 24;              /* simulation ticks per game second, at every speed */
  C.HASH_EVERY = 24;        /* a state-hash checkpoint every second */

  /* ---- space ---- */
  C.FP = 8;                 /* fractional bits: positions are 1/256 of a pixel */
  C.ONE = 1 << C.FP;
  C.TILE = 24;              /* pixels per tile */
  C.MINI = 6;               /* pixels per walkability minitile; 4x4 per tile */
  C.TILE_FP = C.TILE << C.FP;
  /* the balance tables are written in the original's measures: 32 px tiles.
   * One original pixel is 24/32 of ours. */
  C.ORIG_PX_NUM = 24; C.ORIG_PX_DEN = 32;

  /* ---- limits ---- */
  C.MAX_UNITS = 1700;       /* every unit, building and resource node at once */
  C.ID_BITS = 11;           /* index bits of an id; the rest is a generation count */
  C.ID_MASK = (1 << C.ID_BITS) - 1;
  C.MAX_PLAYERS = 8;        /* players 0..7; NEUTRAL owns resources and critters */
  C.NEUTRAL = 8;
  C.ORDERS = 8;             /* the shift-queue depth */
  C.PATH = 24;              /* waypoints a unit can hold */
  C.MAP_MAX = 256;          /* tiles a side */

  /* ---- commands, as issued by a player or the AI ---- */
  C.CMD = {
    MOVE: 1, STOP: 2, HOLD: 3, PATROL: 4, ATTACK: 5, AMOVE: 6, GATHER: 7, RETURN: 8,
    BUILD: 9, TRAIN: 10, CANCEL: 11, RESEARCH: 12, ABILITY: 13, RALLY: 14,
    LOAD: 15, UNLOAD: 16, LIFT: 17, LAND: 18, CLOAK: 19, BURROW: 20,
  };
  /* ---- orders, as a unit carries them ---- */
  C.ORD = { IDLE: 0, MOVE: 1, HOLD: 2, PATROL: 3, ATTACK: 4, AMOVE: 5, GATHER: 6, RETURN: 7, BUILD: 8 };

  /* ---- unit flags ---- */
  C.F = { ALIVE: 1, BUILDING: 2, AIR: 4, WORKER: 8, RESOURCE: 16, MOVING: 32, CLOAKED: 64, BURROWED: 128, UNDER_CONSTRUCTION: 256 };

  /* size classes */
  C.SIZE = { small: 0, medium: 1, large: 2 };
})();
