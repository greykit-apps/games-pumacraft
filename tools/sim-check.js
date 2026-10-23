#!/usr/bin/env node
/*
 * PumaCraft's engine, played headless.
 *
 *   node tools/sim-check.js [--seeds N] [--ticks T] [--verbose]
 *
 * For each seed, two armies on the Proving Ground take a few thousand ticks
 * of random orders (move, patrol, stop, hold, Shift-queued moves) and the
 * check fails if:
 *   - the same seed and orders, played again in a fresh engine, give a
 *     different state hash at any checkpoint (it names the first tick and
 *     the first array that differs);
 *   - a game saved half way, written out as JSON, loaded into a fresh
 *     engine and played on, ends anywhere but where the unbroken game does;
 *   - the replay (seed and command log alone) does not reproduce the game;
 *   - a ground unit ever stands on rock, water or a cliff, or anything
 *     leaves the map, or a position is not an integer;
 * and, once, if a trooper and a bike sent from one main to the other do not
 * get there through the ramps, a flyer does not cross straight, or a unit
 * sent into the lake does not settle on its shore.
 */
"use strict";
const { load } = require("./lib.js");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const SEEDS = opt("--seeds", 2), TICKS = opt("--ticks", 3000), VERBOSE = args.includes("--verbose");
let failures = 0, checks = 0;
const fail = m => { console.error("FAIL " + m); failures++; };
const ok = m => { checks++; if (VERBOSE) console.log("ok   " + m); };

/* the tool's own PRNG, for choosing orders; never the engine's */
const mulberry = a => () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Two armies near the two starts; returns [W, ids by player]. */
function setup(PC, seed) {
  const C = PC.C, W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], seed);
  const def = PC.Map.registry.proving, ids = [[], []];
  const army = [["a_trooper", 12], ["a_engineer", 6], ["a_hornet", 4], ["a_dropship", 2]];
  for (let p = 0; p < 2; p++) {
    const s = def.starts[p];
    let k = 0;
    for (const [key, n] of army) for (let j = 0; j < n; j++, k++) {
      const tx = s.x - 3 + (k % 7), ty = s.y - 2 + Math.floor(k / 7);
      const i = PC.World.spawn(W, PC.Data.type(key).id, p, PC.Map.centre(tx), PC.Map.centre(ty));
      ids[p].push(PC.World.id(W, i));
    }
  }
  return [W, ids];
}

/** The orders for a run: [{ t, p, k, u, x, y, q }], fixed by the seed alone. */
function script(PC, seed, ids, ticks) {
  const C = PC.C, rnd = mulberry(seed ^ 0x5eed), map = PC.Map.build(PC.Map.registry.proving), out = [];
  const openTile = () => { for (;;) { const tx = Math.floor(rnd() * map.w), ty = Math.floor(rnd() * map.h); if (map.walk[ty * map.w + tx] === PC.Map.FULL) return [tx, ty]; } };
  for (let t = 1; t < ticks; t += 4 + Math.floor(rnd() * 18)) {
    const p = rnd() < 0.5 ? 0 : 1, mine = ids[p], n = 1 + Math.floor(rnd() * Math.min(10, mine.length));
    const start = Math.floor(rnd() * mine.length), u = [];
    for (let j = 0; j < n; j++) u.push(mine[(start + j * 3) % mine.length]);
    const r = rnd(), [tx, ty] = openTile();
    const k = r < 0.62 ? C.CMD.MOVE : r < 0.77 ? C.CMD.PATROL : r < 0.85 ? C.CMD.STOP : r < 0.9 ? C.CMD.HOLD : C.CMD.MOVE;
    out.push({ t, p, k, u, x: PC.Map.centre(tx) + Math.floor(rnd() * 2000) - 1000, y: PC.Map.centre(ty) + Math.floor(rnd() * 2000) - 1000, q: r >= 0.9 });
  }
  return out;
}

/** Plays the script from tick `from` to `to` on W, issuing each order on its tick. */
function play(PC, W, cmds, to, onTick) {
  let k = 0;
  while (k < cmds.length && cmds[k].t < W.hdr[0]) k++;
  while (W.hdr[0] < to) {
    while (k < cmds.length && cmds[k].t === W.hdr[0]) PC.Orders.issue(W, cmds[k++]);
    PC.Sim.step(W);
    if (onTick) onTick(W);
  }
}

/** Every unit where it may stand. */
function invariants(PC, W, label) {
  const C = PC.C, F = C.F, map = W.map, maxX = map.w * C.TILE_FP, maxY = map.h * C.TILE_FP;
  for (let i = 0; i < C.MAX_UNITS; i++) {
    if (!(W.flags[i] & F.ALIVE)) continue;
    const x = W.x[i], y = W.y[i];
    if (x !== Math.floor(x) || y !== Math.floor(y)) return fail(`${label}: unit ${i} at a fractional position ${x},${y}`);
    if (x < 0 || y < 0 || x >= maxX || y >= maxY) return fail(`${label}: unit ${i} off the map at ${x},${y}`);
    if (!(W.flags[i] & F.AIR) && !PC.Map.open(map, PC.Map.tileAt(map, x, y)))
      return fail(`${label}: ground unit ${i} (${PC.Data.types[W.type[i]].key}) stands on closed tile ${Math.floor(x / C.TILE_FP)},${Math.floor(y / C.TILE_FP)} at tick ${W.hdr[0]}`);
  }
  return true;
}

const t0 = Date.now();
let stepsRun = 0;

/* Every typed array a world holds is saved and hashed. A field left out of
 * W.state only shows in a save test if some unit happens to need it at the
 * moment of the save; this catches it whether one does or not (seen
 * 2026-10-22: an unsaved stuck counter passed the save test). */
{
  const PC = load(), [W] = setup(PC, 1), saved = new Set(W.state.map(([n]) => n));
  const derived = new Set([]);   /* typed arrays on W that are rebuilt on load, by name */
  const loose = Object.keys(W).filter(k => ArrayBuffer.isView(W[k]) && !saved.has(k) && !derived.has(k));
  if (loose.length) fail(`the world holds typed arrays that are not saved or hashed: ${loose.join(", ")}`);
  else ok(`every typed array in the world is saved and hashed (${saved.size})`);
}
for (let seed = 1; seed <= SEEDS; seed++) {
  /* the unbroken game */
  const PC1 = load(), [W1, ids] = setup(PC1, seed), cmds = script(PC1, seed, ids, TICKS);
  let inv = true, savedJSON = null;
  play(PC1, W1, cmds, TICKS, W => {
    if (W.hdr[0] % 25 === 0 && inv) inv = invariants(PC1, W, `seed ${seed}`) === true;
    if (W.hdr[0] === Math.floor(TICKS / 2)) savedJSON = JSON.stringify(PC1.Serial.save(W));
  });
  stepsRun += TICKS;
  if (inv) ok(`seed ${seed}: every unit stood where it may`);
  const final1 = PC1.Serial.hash(W1);

  /* the same game again, in a fresh engine */
  const PC2 = load(), [W2] = setup(PC2, seed);
  play(PC2, W2, cmds, TICKS);
  stepsRun += TICKS;
  const a = W1.checks, b = W2.checks;
  const bad = a.findIndex((c, i) => !b[i] || c[1] !== b[i][1]);
  if (bad >= 0 || a.length !== b.length) {
    /* replay to the first divergent checkpoint and name the array */
    const tick = bad >= 0 ? a[bad][0] : Math.min(a.length, b.length) * 24;
    const PA = load(), [WA] = setup(PA, seed), PB = load(), [WB] = setup(PB, seed);
    play(PA, WA, cmds, tick); play(PB, WB, cmds, tick);
    fail(`seed ${seed}: the game played twice differs from tick ${tick}: ${PA.Serial.diff(WA, WB)}`);
  } else ok(`seed ${seed}: played twice, ${a.length} checkpoints match`);

  /* saved half way, loaded fresh, played on */
  const PC3 = load(), W3 = PC3.Serial.load(JSON.parse(savedJSON));
  play(PC3, W3, cmds, TICKS);
  stepsRun += TICKS / 2;
  const final3 = PC3.Serial.hash(W3);
  if (final3 !== final1) fail(`seed ${seed}: saved at ${TICKS / 2} and played on, it ends at ${final3}, not ${final1}: ${PC3.Serial.diff(W1, W3)}`);
  else ok(`seed ${seed}: a save half way plays on to the same end`);

  /* the replay: the seed and the command log alone */
  const PC4 = load(), [W4] = setup(PC4, seed);
  const log = JSON.parse(JSON.stringify(PC1.Serial.replay(W1).log));
  play(PC4, W4, log, TICKS);
  stepsRun += TICKS;
  if (PC4.Serial.hash(W4) !== final1) fail(`seed ${seed}: the replay ends at ${PC4.Serial.hash(W4)}, not ${final1}`);
  else ok(`seed ${seed}: the replay reproduces the game`);
}

/* ---- getting there ---- */
{
  const PC = load(), C = PC.C, W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], 7);
  const unit = (key, tx, ty) => PC.World.id(W, PC.World.spawn(W, PC.Data.type(key).id, 0, PC.Map.centre(tx), PC.Map.centre(ty)));
  const trooper = unit("a_trooper", 6, 5), hornet = unit("a_hornet", 9, 5), flyer = unit("a_dropship", 6, 8), wader = unit("a_trooper", 22, 30);
  const go = (u, tx, ty) => PC.Orders.issue(W, { t: 0, p: 0, k: C.CMD.MOVE, u: [u], x: PC.Map.centre(tx), y: PC.Map.centre(ty) });
  go(trooper, 56, 57); go(hornet, 54, 57); go(flyer, 57, 59); go(wader, 32, 32);
  const arrive = {};
  for (let t = 0; t < 2400; t++) {
    PC.Sim.step(W);
    for (const [name, u] of [["trooper", trooper], ["hornet", hornet], ["flyer", flyer], ["wader", wader]]) {
      const i = PC.World.live(W, u);
      if (!(name in arrive) && PC.Orders.headKind(W, i) === C.ORD.IDLE) arrive[name] = [W.hdr[0], Math.floor(W.x[i] / C.TILE_FP), Math.floor(W.y[i] / C.TILE_FP)];
    }
  }
  const near = (a, tx, ty, d) => a && Math.abs(a[1] - tx) <= d && Math.abs(a[2] - ty) <= d;
  if (!near(arrive.trooper, 56, 57, 1)) fail(`a trooper sent main to main did not get there: ${JSON.stringify(arrive.trooper)}`); else ok(`a trooper crossed main to main in ${arrive.trooper[0]} ticks`);
  if (!near(arrive.hornet, 54, 57, 1)) fail(`a hornet sent main to main did not get there: ${JSON.stringify(arrive.hornet)}`); else ok(`a hornet crossed in ${arrive.hornet[0]} ticks`);
  if (!near(arrive.flyer, 57, 59, 0)) fail(`a flyer did not cross straight: ${JSON.stringify(arrive.flyer)}`); else ok(`a flyer crossed in ${arrive.flyer[0]} ticks`);
  if (arrive.trooper && arrive.hornet && arrive.hornet[0] >= arrive.trooper[0]) fail("the hornet, faster, arrived no sooner than the trooper");
  const w = arrive.wader;
  if (!w) fail("a trooper sent into the lake never settled");
  else {
    const d = Math.max(Math.abs(w[1] - 32), Math.abs(w[2] - 32));
    if (d > 9 || !PC.Map.open(W.map, w[2] * W.map.w + w[1])) fail(`a trooper sent into the lake settled at ${w[1]},${w[2]}, not on its shore`);
    else ok(`a trooper sent into the lake settled on its shore at ${w[1]},${w[2]}`);
  }
  invariants(PC, W, "getting there");
}

const ms = Date.now() - t0;
/* A check that checks nothing must never read as a pass. */
if (checks === 0 && failures === 0) { console.error("sim-check: nothing was checked -- refusing to pass"); process.exit(1); }
if (failures) { console.error(`sim-check: ${failures} failure(s)`); process.exit(1); }
console.log(`sim-check: ${checks} checks over ${SEEDS} seed(s) x ${TICKS} ticks pass (${(ms / stepsRun * 1000).toFixed(0)} us a tick)`);
