#!/usr/bin/env node
/*
 * The map generator, run over many seeds.
 *
 *   node tools/mapgen-check.js [--seeds N]     (default 100 of each kind)
 *
 * For every seed and kind (96 x 96 for two, 128 x 128 for two, 128 x 128
 * for four) it fails if no map comes out, if the map is not exactly the
 * same turned round for every player, if any start, vein or vent cannot be
 * walked to from the first start, if a base would not start (its command
 * post, its engineers), if a main has fewer than six veins or no vent near
 * it, or if the same seed gives two different maps. For a few seeds it also
 * plays a minute: the starting engineers must bring ore home.
 */
"use strict";
const { load } = require("./lib.js");
const args = process.argv.slice(2);
const SEEDS = +(args[args.indexOf("--seeds") + 1] || 100) || 100;
const PC = load(), C = PC.C, F = C.F;
const KINDS = [[96, 2], [128, 2], [128, 4]];
let bad = 0, checked = 0, triesSum = 0, triesMax = 0;
const fail = m => { console.error("FAIL " + m); bad++; };
const t0 = Date.now();

for (const [size, players] of KINDS) for (let seed = 1; seed <= SEEDS; seed++) {
  const label = `seed ${seed} ${size}x${size} for ${players}`;
  let def;
  try { def = PC.MapGen.make({ seed, size, players }); } catch (e) { fail(`${label}: ${e.message}`); continue; }
  checked++; triesSum += def.gen.tries; triesMax = Math.max(triesMax, def.gen.tries);
  const n = size, rows = def.rows;
  /* the same turned round */
  let sym = true;
  for (let y = 0; y < n && sym; y++) for (let x = 0; x < n && sym; x++) {
    const c = rows[y][x];
    if (rows[n - 1 - y][n - 1 - x] !== c) sym = false;
    if (players === 4 && rows[x][n - 1 - y] !== c) sym = false;
  }
  if (!sym) fail(`${label}: not the same turned round`);
  /* nor the resources: for two, every vein and vent has its exact turned copy */
  if (players === 2) {
    const key = r => r.t + ":" + r.x + ":" + r.y, have = new Set(def.resources.map(key));
    for (const r of def.resources) { const w = r.t === "ore" ? 2 : 4, h = r.t === "ore" ? 1 : 2; if (!have.has(r.t + ":" + (n - r.x - w) + ":" + (n - r.y - h))) { fail(`${label}: ${r.t} at ${r.x},${r.y} has no turned copy`); break; } }
  }
  /* everything walkable from the first start */
  const map = PC.Map.build({ id: "x", rows });
  const s0 = def.starts[0], d = PC.MapGen.walkDistances(map, Math.floor(s0.x), Math.floor(s0.y) + 2);
  const reach = (x, y, w, h) => { for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < n && yy < n && d[yy * n + xx] >= 0) return true; } return false; };
  for (const s of def.starts) if (!reach(Math.floor(s.x) - 2, Math.floor(s.y) - 1, 4, 3)) fail(`${label}: a start at ${s.x},${s.y} cannot be walked to`);
  for (const r of def.resources) if (!reach(r.x, r.y, r.t === "ore" ? 2 : 4, r.t === "ore" ? 1 : 2)) fail(`${label}: ${r.t} at ${r.x},${r.y} cannot be walked to`);
  /* each main has its ore and vapour near it */
  for (const s of def.starts) {
    const near = r => Math.abs(r.x - s.x) < 13 && Math.abs(r.y - s.y) < 13;
    const veins = def.resources.filter(r => r.t === "ore" && near(r)).length, vents = def.resources.filter(r => r.t === "vapour" && near(r)).length;
    if (veins < 6 || vents < 1) fail(`${label}: the main at ${s.x},${s.y} has ${veins} veins and ${vents} vents`);
  }
  /* the same seed, the same map */
  if (seed <= 5) { const again = PC.MapGen.make({ seed, size, players }); if (again.rows.join("") !== rows.join("") || JSON.stringify(again.resources) !== JSON.stringify(def.resources)) fail(`${label}: two different maps from one seed`); }
  /* bases start; and for a few, a minute of mining */
  const id = PC.MapGen.idOf({ seed, size, players });
  PC.MapGen.ensure(id);
  const W = PC.Sim.create(id, Array.from({ length: players }, (_, p) => ({ faction: "a", team: p })), seed, { bases: true });
  for (let p = 0; p < players; p++) {
    let halls = 0, workers = 0;
    for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && W.owner[i] === p) { if (W.flags[i] & F.BUILDING) halls++; else if (W.flags[i] & F.WORKER) workers++; }
    if (halls !== 1 || workers !== 4) fail(`${label}: player ${p} started with ${halls} command post(s) and ${workers} engineers`);
  }
  if (seed % 25 === 1) {
    for (let p = 0; p < players; p++) {
      const ws = [];
      for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && W.owner[i] === p && (W.flags[i] & F.WORKER)) ws.push(PC.World.id(W, i));
      let best = -1, bd = Infinity;
      const s = def.starts[p];
      for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && PC.Data.types[W.type[i]].gather === 1) { const dd = Math.abs(W.x[i] / C.TILE_FP - s.x) + Math.abs(W.y[i] / C.TILE_FP - s.y); if (dd < bd) { bd = dd; best = i; } }
      PC.Orders.issue(W, { t: 0, p, k: C.CMD.GATHER, u: ws, tgt: PC.World.id(W, best) });
    }
    PC.Sim.run(W, 24 * 30);
    /* saved half way and loaded into a fresh engine (which must make the map again from its id), it plays on to the same end */
    const saved = JSON.stringify(PC.Serial.save(W)), PC2 = load(), W2 = PC2.Serial.load(JSON.parse(saved));
    PC.Sim.run(W, 24 * 60); PC2.Sim.run(W2, 24 * 60);
    if (PC.Serial.hash(W) !== PC2.Serial.hash(W2)) fail(`${label}: a save loaded into a fresh engine went its own way: ${PC.Serial.diff(W, W2)}`);
    for (let p = 0; p < players; p++) if (W.ore[p] < 150) fail(`${label}: player ${p}'s engineers mined only ${W.ore[p] - 50} ore in a minute`);
  }
}
/* A check that checks nothing must never read as a pass. */
if (!checked && !bad) { console.error("mapgen-check: no maps were made -- refusing to pass"); process.exit(1); }
if (bad) { console.error(`mapgen-check: ${bad} problem(s)`); process.exit(1); }
console.log(`mapgen-check: ${checked} maps hold together (tries: mean ${(triesSum / checked).toFixed(2)}, most ${triesMax}; ${((Date.now() - t0) / checked).toFixed(0)} ms a map)`);
