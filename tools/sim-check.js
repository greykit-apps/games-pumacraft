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
  const C = PC.C, W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], seed, { bases: seed % 2 === 0 });
  if (seed % 2 === 0) { W.ore[0] = W.ore[1] = 5000; W.vapour[0] = W.vapour[1] = 2000; }
  const def = PC.Map.registry.proving, ids = [[], []];
  const army = [["a_trooper", 12], ["a_engineer", 6], ["a_hornet", 4], ["a_dropship", 2]];
  for (let p = 0; p < 2; p++) {
    const s = def.starts[p], used = new Set();
    /* each unit on its own open, unoccupied tile, nearest the start first */
    const spot = () => {
      for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.floor(s.x) + dx, ty = Math.floor(s.y) + dy, t = ty * W.map.w + tx;
        if (tx < 0 || ty < 0 || tx >= W.map.w || ty >= W.map.h || W.walk[t] !== PC.Map.FULL || used.has(t)) continue;
        used.add(t); return [tx, ty];
      }
      throw new Error("no room for the army");
    };
    for (const [key, n] of army) for (let j = 0; j < n; j++) {
      const [tx, ty] = spot();
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
    const k = r < 0.45 ? C.CMD.MOVE : r < 0.6 ? C.CMD.ATTACK : r < 0.7 ? C.CMD.PATROL : r < 0.78 ? C.CMD.STOP : r < 0.83 ? C.CMD.HOLD : C.CMD.MOVE;
    out.push({ t, p, k, u, x: PC.Map.centre(tx) + Math.floor(rnd() * 2000) - 1000, y: PC.Map.centre(ty) + Math.floor(rnd() * 2000) - 1000, q: r >= 0.9 });
    /* with bases: the economy too -- gather, train, build at a random spot (most will be refused, which is tested too) */
    if (seed % 2 === 0 && rnd() < 0.5) {
      const e = rnd(), b = p === 0 ? 0 : 1;
      if (e < 0.3) out.push({ t, p, k: C.CMD.GATHER, u, tgt: 0, x: 0, y: 0, gatherNear: b });
      else if (e < 0.6) out.push({ t, p, k: C.CMD.TRAIN, u: "buildings", tgt: ["a_engineer", "a_trooper", "a_hornet"][Math.floor(rnd() * 3)] });
      else out.push({ t, p, k: C.CMD.BUILD, u: [u[0]], x: PC.Map.centre(tx), y: PC.Map.centre(ty), tgt: ["a_depot", "a_barracks", "a_garage"][Math.floor(rnd() * 3)] });
    }
  }
  return out;
}

/** Fills in a scripted command's symbolic parts from the world as it stands:
 * "buildings" (all the player's buildings), a type key, the nearest vein. */
function resolve(PC, W, c) {
  const C = PC.C, F = C.F;
  if (!c.gatherNear && c.u !== "buildings" && typeof c.tgt !== "string") return c;
  const o = Object.assign({}, c);
  if (typeof o.tgt === "string") o.tgt = PC.Data.type(o.tgt).id;
  if (o.u === "buildings") { o.u = []; for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.BUILDING) && W.owner[i] === c.p) o.u.push(PC.World.id(W, i)); }
  if (o.gatherNear !== undefined) {
    const s = PC.Map.registry.proving.starts[o.gatherNear], sx = s.x * C.TILE_FP, sy = s.y * C.TILE_FP;
    let best = -1, bd = Infinity;
    for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && PC.Data.types[W.type[i]].gather === 1) { const d = Math.abs(W.x[i] - sx) + Math.abs(W.y[i] - sy); if (d < bd) { bd = d; best = i; } }
    o.tgt = best >= 0 ? PC.World.id(W, best) : 0; delete o.gatherNear;
  }
  return o;
}

/** Plays the script from tick `from` to `to` on W, issuing each order on its tick. */
function play(PC, W, cmds, to, onTick) {
  let k = 0;
  while (k < cmds.length && cmds[k].t < W.hdr[0]) k++;
  while (W.hdr[0] < to) {
    while (k < cmds.length && cmds[k].t === W.hdr[0]) PC.Orders.issue(W, resolve(PC, W, cmds[k++]));
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
    if (!(W.flags[i] & (F.AIR | F.BUILDING | F.RESOURCE)) && !PC.Map.open(map, PC.Map.tileAt(map, x, y)))
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
  const derived = new Set(["have"]);   /* typed arrays on W that are rebuilt on load, by name: what each player has finished */
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

/* ---- the economy, the fight ---- */
{
  const PC = load(), C = PC.C, F = C.F, T = k => PC.Data.type(k);
  const W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], 11, { bases: true });
  const mine = (p, key) => { const out = []; for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && W.owner[i] === p && (!key || PC.Data.types[W.type[i]].key === key)) out.push(i); return out; };
  const id = i => PC.World.id(W, i), fp = v => Math.floor(v * C.TILE_FP);
  const hall = mine(0, "a_command")[0], workers = mine(0, "a_engineer");
  if (!hall && hall !== 0 || workers.length !== 4) fail(`a base starts with a command post and four engineers, not ${workers.length}`);
  if (W.supplyCap[0] !== 10 || W.supplyUsed[0] !== 4 || W.ore[0] !== 50) fail(`a base starts at 4/10 supply and 50 ore, not ${W.supplyUsed[0]}/${W.supplyCap[0]} and ${W.ore[0]}`);
  /* every worker to the ore */
  let vein = -1;
  for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && PC.Data.types[W.type[i]].key === "ore" && W.x[i] < fp(20) && W.y[i] < fp(20)) { vein = i; break; }
  PC.Orders.issue(W, { t: 0, p: 0, k: C.CMD.GATHER, u: workers.map(id), tgt: id(vein) });
  const ore0 = W.ore[0];
  PC.Sim.run(W, 24 * 60);
  const perMin = W.ore[0] - ore0;
  if (perMin < 120) fail(`four engineers mined only ${perMin} ore in a minute`); else ok(`four engineers mined ${perMin} ore in a game minute`);
  /* train a fifth */
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.TRAIN, u: [id(hall)], tgt: T("a_engineer").id });
  PC.Sim.run(W, W.hdr[0] + T("a_engineer").buildTicks + 2);
  if (mine(0, "a_engineer").length !== 5 || W.supplyUsed[0] !== 5) fail(`training an engineer left ${mine(0, "a_engineer").length} engineers at ${W.supplyUsed[0]} supply`);
  else ok("a command post trains an engineer in its build time");
  /* build a depot and a barracks, then troopers */
  W.ore[0] = 1000; W.vapour[0] = 500;
  const [b1, b2] = mine(0, "a_engineer");
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.BUILD, u: [id(b1)], x: fp(11.5), y: fp(10), tgt: T("a_depot").id });
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.BUILD, u: [id(b2)], x: fp(5), y: fp(11.5), tgt: T("a_barracks").id });
  PC.Sim.run(W, W.hdr[0] + 24 * 60);
  const depot = mine(0, "a_depot")[0], rax = mine(0, "a_barracks")[0];
  if (depot === undefined || (W.flags[depot] & F.UNDER_CONSTRUCTION)) fail("an engineer sent to build a depot did not finish it in a minute");
  else if (W.supplyCap[0] !== 18) fail(`a finished depot left supply at ${W.supplyCap[0]}, not 18`);
  else ok("an engineer builds a depot, and it gives its supply");
  if (rax === undefined || (W.flags[rax] & F.UNDER_CONSTRUCTION)) fail("an engineer sent to build a barracks did not finish it in a minute");
  else {
    for (let k = 0; k < 5; k++) PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.TRAIN, u: [id(rax)], tgt: T("a_trooper").id });
    PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.TRAIN, u: [id(rax)], tgt: T("a_trooper").id });   /* a sixth: the queue is full */
    PC.Sim.run(W, W.hdr[0] + 2);
    if (W.qLen[rax] !== 5) fail(`a barracks queue holds ${W.qLen[rax]}, not 5`);
    PC.Sim.run(W, W.hdr[0] + 5 * T("a_trooper").buildTicks + 10);
    if (mine(0, "a_trooper").length !== 5) fail(`a barracks trained ${mine(0, "a_trooper").length} troopers from a queue of five`); else ok("a barracks trains its queue of five, and refuses a sixth");
  }
  /* the damage table, by hand: concussive is half against medium; armour comes off after the size */
  const h = PC.World.spawn(W, T("a_hornet").id, 1, fp(30), fp(40)), h2 = PC.World.spawn(W, T("a_hornet").id, 0, fp(31), fp(40));
  const before = W.hp[h2];
  PC.Combat.hit(W, h, h2, PC.Data.types[W.type[h]].weapons[0]);
  if (before - W.hp[h2] !== 40) fail(`a hornet's shrapnel took ${(before - W.hp[h2]) / 4} from a hornet, not 10 (20 concussive against medium)`); else ok("20 concussive against medium takes 10");
  const hb = W.hp[hall], tr = PC.World.spawn(W, T("a_trooper").id, 1, fp(8), fp(10));
  PC.Combat.hit(W, tr, hall, PC.Data.types[W.type[tr]].weapons[0]);
  if (hb - W.hp[hall] !== 20) fail(`a carbine took ${(hb - W.hp[hall]) / 4} from a command post, not 5 (6 less 1 armour)`); else ok("6 normal against 1 armour takes 5");
  PC.World.kill(W, h); PC.World.kill(W, h2); PC.World.kill(W, tr); W.hp[hall] = hb;
  /* a fight: five troopers against five, attack-moving into each other */
  const blue = [], red = [];
  for (let k = 0; k < 5; k++) { blue.push(id(PC.World.spawn(W, T("a_trooper").id, 0, fp(30 + k), fp(36)))); red.push(id(PC.World.spawn(W, T("a_trooper").id, 1, fp(30 + k), fp(46)))); }
  const flyer = id(PC.World.spawn(W, T("a_dropship").id, 0, fp(40), fp(41)));
  const bike = id(PC.World.spawn(W, T("a_hornet").id, 1, fp(40), fp(44)));
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.ATTACK, u: blue, x: fp(32), y: fp(46) });
  PC.Orders.issue(W, { t: W.hdr[0], p: 1, k: C.CMD.ATTACK, u: red, x: fp(32), y: fp(36) });
  PC.Sim.run(W, W.hdr[0] + 24 * 30);
  const alive = ids => ids.filter(u => PC.World.live(W, u) >= 0).length;
  const left = [alive(blue), alive(red)];
  if (left[0] + left[1] >= 8) fail(`ten troopers attack-moving into each other left ${left[0]} and ${left[1]} standing after half a minute`);
  else ok(`ten troopers met: ${left[0]} and ${left[1]} left standing`);
  const fi = PC.World.live(W, flyer), bi = PC.World.live(W, bike);
  if (fi >= 0 && bi >= 0 && W.hp[fi] !== PC.Data.types[W.type[fi]].hp) fail("a hornet, which fires at the ground only, hurt a Pelican");
  else ok("a hornet leaves a Pelican alone");
  /* vapour: a refinery on the vent, three engineers drawing from it */
  let vent = -1;
  for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && PC.Data.types[W.type[i]].key === "vapour" && W.x[i] < fp(20)) vent = i;
  const v0 = W.vapour[0], es = mine(0, "a_engineer").slice(0, 3);
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.BUILD, u: [id(es[0])], x: W.x[vent], y: W.y[vent], tgt: T("a_refinery").id });
  PC.Sim.run(W, W.hdr[0] + 24 * 35);
  const ref = mine(0, "a_refinery")[0];
  if (ref === undefined || (W.flags[ref] & F.UNDER_CONSTRUCTION)) fail("an engineer sent to the vent did not finish a refinery");
  else {
    PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.GATHER, u: es.map(id), tgt: id(ref) });
    PC.Sim.run(W, W.hdr[0] + 24 * 60);
    const got = W.vapour[0] - v0;
    if (got < 100) fail(`three engineers drew only ${got} vapour in a minute`); else ok(`three engineers drew ${got} vapour in a minute from a refinery`);
  }
  invariants(PC, W, "the economy and the fight");
}

/* ---- research, the adrenal shot, splash and healing ---- */
{
  const PC = load(), C = PC.C, F = C.F, T = k => PC.Data.type(k), fp = v => Math.floor(v * C.TILE_FP);
  const W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], 21, { bases: true });
  W.ore[0] = W.vapour[0] = 5000;
  const spawn = (k, p, x, y, built = true) => PC.World.spawn(W, T(k).id, p, fp(x), fp(y), built);
  const id = i => PC.World.id(W, i);
  /* the shot is refused before the research */
  const tr = spawn("a_trooper", 0, 30, 40);
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.ABILITY, u: [id(tr)], tgt: PC.Orders.ABILITY.stim });
  PC.Sim.step(W);
  if (W.stim[tr]) fail("an adrenal shot was taken before it was researched"); else ok("the adrenal shot waits for its research");
  /* research at a finished academy and drill hall */
  const acad = spawn("a_academy", 0, 12, 11), hall = spawn("a_drillhall", 0, 5, 11.5);
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.RESEARCH, u: [id(acad)], tgt: PC.Data.upgrade("a_stim").id });
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.RESEARCH, u: [id(hall)], tgt: PC.Data.upgrade("a_inf_weapons").id });
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.RESEARCH, u: [id(hall)], tgt: PC.Data.upgrade("a_inf_weapons").id });   /* twice: refused as busy */
  PC.Sim.step(W);
  if (W.qLen[hall] !== 1) fail(`the same research could be queued twice (${W.qLen[hall]})`);
  const d0 = PC.Combat.damage(W, tr, PC.Data.types[W.type[tr]].weapons[0]);
  PC.Sim.run(W, W.hdr[0] + 4010);
  const up = PC.Data.upgrade("a_inf_weapons"), lvl = W.upg[up.id];
  if (lvl !== 1 || PC.Combat.damage(W, tr, PC.Data.types[W.type[tr]].weapons[0]) !== d0 + 4) fail(`infantry weapons research left level ${lvl} and damage ${PC.Combat.damage(W, tr, PC.Data.types[W.type[tr]].weapons[0]) / 4}`);
  else ok("infantry weapons level 1 adds a point to a carbine");
  /* the shot: 10 health, half the cooldown, half again the speed */
  const hp0 = W.hp[tr];
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.ABILITY, u: [id(tr)], tgt: PC.Orders.ABILITY.stim });
  PC.Sim.step(W);
  if (!W.stim[tr] || hp0 - W.hp[tr] !== 40) fail(`an adrenal shot left ${W.stim[tr]} ticks and cost ${(hp0 - W.hp[tr]) / 4} health`); else ok("an adrenal shot costs a trooper 10 health");
  const x0 = W.x[tr];
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.MOVE, u: [id(tr)], x: fp(50), y: fp(40) });
  PC.Sim.run(W, W.hdr[0] + 25);
  const moved = W.x[tr] - x0, plain = PC.Data.types[W.type[tr]].speed * 24;
  if (moved < plain * 1.35) fail(`a trooper under the shot moved ${moved / C.ONE} px in a second, not half again its ${plain / C.ONE}`); else ok("under the shot a trooper moves half again as fast");
  /* splash: a torcher's lance hurts the enemies round its target, and spares its friends */
  /* on dry ground, south of the lake */
  const to = spawn("a_torcher", 0, 30, 39), victim = spawn("a_trooper", 1, 31.4, 39), beside = spawn("a_trooper", 1, 31.9, 39.4), friend = spawn("a_trooper", 0, 31.8, 38.6);
  PC.Combat.hit(W, to, victim, PC.Data.types[W.type[to]].weapons[0]);
  const fhp = W.hp[friend];
  PC.Sim.run(W, W.hdr[0] + 1);
  const w = PC.Data.types[W.type[to]].weapons[0];
  const order = new Int16Array(C.MAX_UNITS), n = PC.World.alive(W, order); PC.Combat.grid(W, order, n);
  const bhp = W.hp[beside];
  W.cd[to] = 0; PC.Vision.update(W, order, n);
  PC.Combat.fight(W, to, id(victim), 0);
  if (W.hp[beside] >= bhp) fail("a torcher's lance did not splash the trooper beside its target"); else ok(`a torcher's splash took ${(bhp - W.hp[beside]) / 4} from the trooper beside its target`);
  if (W.hp[friend] !== fhp) fail("a torcher's splash hurt a friend"); else ok("a torcher's splash spares its friends");
  /* healing: a corpsman mends a hurt trooper, and pays for it in energy */
  const medic = spawn("a_corpsman", 0, 20, 30), hurt = spawn("a_trooper", 0, 20.6, 30);
  W.hp[hurt] = 40; W.energy[medic] = 100;
  PC.Sim.run(W, W.hdr[0] + 48);
  if (W.hp[hurt] <= 40 || W.energy[medic] >= 100) fail(`a corpsman beside a hurt trooper left it at ${W.hp[hurt] / 4} health, using ${100 - W.energy[medic]} energy`);
  else ok(`a corpsman mended ${(W.hp[hurt] - 40) / 4} health in two seconds for ${100 - W.energy[medic]} energy`);
  invariants(PC, W, "research, the shot, splash and healing");
}

/* ---- siege mode ---- */
{
  const PC = load(), C = PC.C, F = C.F, T = k => PC.Data.type(k), fp = v => Math.floor(v * C.TILE_FP);
  const W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], 31, { bases: true });
  const id = i => PC.World.id(W, i), spawn = (k, p, x, y) => PC.World.spawn(W, T(k).id, p, fp(x), fp(y));
  const gun = spawn("a_howitzer", 0, 24, 40), siege = { tgt: PC.Orders.ABILITY.siege, x: 0 };
  PC.Orders.issue(W, Object.assign({ t: W.hdr[0], p: 0, k: C.CMD.ABILITY, u: [id(gun)] }, siege));
  PC.Sim.step(W);
  if (W.mode[gun]) fail("a howitzer dug in before siege mode was researched"); else ok("siege mode waits for its research");
  W.upg[PC.Data.upgrade("a_siege").id] = 1;
  PC.Orders.issue(W, Object.assign({ t: W.hdr[0], p: 0, k: C.CMD.ABILITY, u: [id(gun)] }, siege));
  PC.Sim.run(W, W.hdr[0] + 2);
  const dep = PC.Data.types[W.type[gun]].siege.deploy;
  if (W.mode[gun] !== 2) fail(`a howitzer told to dig in is in mode ${W.mode[gun]}`);
  PC.Sim.run(W, W.hdr[0] + dep);
  if (W.mode[gun] !== 1) fail(`a howitzer was not dug in ${dep} ticks after it began (mode ${W.mode[gun]})`); else ok(`a howitzer digs in in ${dep} ticks`);
  const x0 = W.x[gun];
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.MOVE, u: [id(gun)], x: fp(40), y: fp(40) });
  PC.Sim.run(W, W.hdr[0] + 48);
  if (W.x[gun] !== x0) fail("a dug-in howitzer moved when told to"); else ok("a dug-in howitzer stays where it is");
  /* it reaches far, and will not aim at a foe under its barrel (splash may still reach one) */
  /* within its sight (ten tiles) but past its tank-mode range (seven): a dug-in gun reaches it */
  const far = spawn("a_trooper", 1, 33.5, 40), close = spawn("a_trooper", 1, 24.9, 40.6);
  PC.Sim.run(W, W.hdr[0] + 120);
  if (PC.World.live(W, id(far)) >= 0 && W.hp[far] === PC.Data.types[W.type[far]].hp) fail("a dug-in howitzer did not shell a trooper nine tiles off"); else ok("a dug-in howitzer shells a trooper nine tiles off, past its tank-mode reach");
  if (W.target[gun] && PC.World.live(W, W.target[gun]) === close) fail("a dug-in howitzer aimed at a foe under its barrel"); else ok("a dug-in howitzer will not aim at a foe under its barrel");
  PC.Orders.issue(W, { t: W.hdr[0], p: 0, k: C.CMD.ABILITY, u: [id(gun)], tgt: PC.Orders.ABILITY.siege, x: 2 });
  PC.Sim.run(W, W.hdr[0] + dep + 4);
  if (W.mode[gun] !== 0) fail("a howitzer told to pack up did not"); else ok("a howitzer packs up again");
  invariants(PC, W, "siege mode");
}

/* ---- the computer against itself ---- */
{
  const BOTS = [{ faction: "a", team: 0, ai: "normal" }, { faction: "a", team: 1, ai: "normal" }];
  const make = (PCx, map) => { if (map.startsWith("gen:")) PCx.MapGen.ensure(map); return PCx.Sim.create(map, BOTS, 3, { bases: true }); };
  const standing = (PCx, W) => [0, 1].map(p => { let b = 0; for (let i = 0; i < PCx.C.MAX_UNITS; i++) if ((W.flags[i] & PCx.C.F.ALIVE) && W.owner[i] === p && (W.flags[i] & PCx.C.F.BUILDING)) b++; return b; });
  for (const map of ["proving", "gen:5:96:2"]) {
    const P1 = load(), W1 = make(P1, map), mins = 8, T8 = 24 * 60 * mins;
    P1.Sim.run(W1, T8 / 2);
    const saved = JSON.stringify(P1.Serial.save(W1));
    P1.Sim.run(W1, T8);
    stepsRun += T8;
    const b = standing(P1, W1), waves = [0, 1].map(p => W1.ai[p * 32 + 2]);
    if (b.some(n => n < 6) || waves.some(n => n < 1)) fail(`${map}: two bots after ${mins} minutes have ${b.join(" and ")} buildings and sent ${waves.join(" and ")} waves`);
    else ok(`${map}: two bots built ${b.join(" and ")} buildings and sent ${waves.join(" and ")} waves in ${mins} minutes`);
    /* again, fresh */
    const P2 = load(), W2 = make(P2, map);
    P2.Sim.run(W2, T8); stepsRun += T8;
    const bad2 = W1.checks.findIndex((c, i) => !W2.checks[i] || c[1] !== W2.checks[i][1]);
    if (bad2 >= 0) fail(`${map}: two bots played twice differ from tick ${W1.checks[bad2][0]}`); else ok(`${map}: two bots play the same game twice`);
    /* saved half way */
    const P3 = load(), W3 = P3.Serial.load(JSON.parse(saved));
    P3.Sim.run(W3, T8); stepsRun += T8 / 2;
    if (P3.Serial.hash(W3) !== P1.Serial.hash(W1)) fail(`${map}: a bots' game saved half way went its own way: ${P3.Serial.diff(W1, W3)}`); else ok(`${map}: a bots' game saved half way plays on to the same end`);
    /* the replay is the seed alone: the bots' commands are not in the log */
    if (W1.log.length) fail(`${map}: the bots' commands went into the replay's log (${W1.log.length})`);
  }
  /* and one to the end */
  const P4 = load(), W4 = make(P4, "proving");
  let over = -1;
  for (let m = 1; m <= 30 && over < 0; m++) { P4.Sim.run(W4, m * 24 * 60); stepsRun += 24 * 60; if (standing(P4, W4).some(n => n === 0)) over = m; }
  if (over < 0) fail(`two bots on the Proving Ground were still both standing after 30 minutes (${standing(P4, W4).join(" and ")} buildings)`);
  else ok(`two bots on the Proving Ground fought it out in ${over} minutes`);
  for (let p = 0; p < 2; p++) if (W4.supplyUsed[p] > 200 || W4.supplyUsed[p] < 0) fail(`a bot's supply went to ${W4.supplyUsed[p]}`);
}

const ms = Date.now() - t0;
/* A check that checks nothing must never read as a pass. */
if (checks === 0 && failures === 0) { console.error("sim-check: nothing was checked -- refusing to pass"); process.exit(1); }
if (failures) { console.error(`sim-check: ${failures} failure(s)`); process.exit(1); }
console.log(`sim-check: ${checks} checks over ${SEEDS} seed(s) x ${TICKS} ticks pass (${(ms / stepsRun * 1000).toFixed(0)} us a tick)`);
