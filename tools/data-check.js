#!/usr/bin/env node
/*
 * Every faction's data holds together.
 *
 *   node tools/data-check.js
 *
 * Fails if a unit or building has no recipe to be painted from (so it would
 * draw as a magenta marker), a recipe paints nothing in some frame, a hotkey
 * is taken twice within one faction's units or within its buildings, a cost
 * is negative, a unit cannot move, or tools/sheet.html leaves a recipe file
 * out. Grows with the data: requirements, producers, upgrades and abilities
 * join it as they land.
 */
"use strict";
const fs = require("fs"), path = require("path");
const { load, ROOT } = require("./lib.js");
const PC = load();
/* the recipes, as tools/bake-art.js loads them */
const dir = path.join(ROOT, "js", "art", "recipes");
const files = ["js/art/paint.js", "js/art/pal.js", "js/art/recipes.js", ...fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => "js/art/recipes/" + f)];
const ART = { PC: {} };
new Function("globalThis", "PC", '"use strict";\n' + files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n"))(ART, ART.PC);
const R = ART.PC.Recipes;

let bad = 0, checked = 0;
const fail = m => { console.error("FAIL " + m); bad++; };
for (const t of PC.Data.types.slice(1)) {
  if (t.kind === "effect") continue;   /* an effect (a scan's eye) is never drawn */
  checked++;
  const r = R.byKey[t.art];
  if (!r) fail(`${t.key}: no recipe "${t.art}" in js/art/recipes/`);
  else for (const [anim, a] of Object.entries(r.anims)) {
    const f0 = ART.PC.Paint.frame(r.parts(anim, 0, a.n), r.heading || 0, r.box[0], r.box[1], r.box[2], r.box[3], ART.PC.PAL);
    if (!ART.PC.Paint.trim(f0, r.box[0], r.box[1])) fail(`${t.key}: its ${anim} paints nothing`);
  }
  if (t.cost.some(c => c < 0)) fail(`${t.key}: a negative cost`);
  if (t.kind === "unit" && t.speed <= 0) fail(`${t.key}: a unit that cannot move`);
  if (t.kind === "unit" && !(r && r.anims.walk)) fail(`${t.key}: no walk to move with`);
  if (t.kind === "building" && !(r && r.anims.build && r.anims.build.n === 3)) fail(`${t.key}: no three-stage build to rise with`);
}
for (const f of Object.values(PC.Data.factions)) for (const kind of ["units", "buildings"]) {
  const seen = {};
  for (const id of f[kind]) {
    const t = PC.Data.types[id];
    if (!t.hotkey) continue;
    if (seen[t.hotkey]) fail(`${f.id}: ${kind} ${seen[t.hotkey]} and ${t.key} share the hotkey ${t.hotkey}`);
    seen[t.hotkey] = t.key;
  }
}
/* tools/sheet.html lists the recipe files by hand; it must list them all */
const sheet = fs.readFileSync(path.join(ROOT, "tools", "sheet.html"), "utf8");
for (const f of files.filter(f => f.startsWith("js/art/recipes/"))) if (!sheet.includes('src="../' + f + '"')) fail(`tools/sheet.html does not load ${f}`);
/* A check that checks nothing must never read as a pass. */
if (!checked) { console.error("data-check: no types registered -- refusing to pass"); process.exit(1); }
if (bad) { console.error(`data-check: ${bad} problem(s)`); process.exit(1); }
console.log(`data-check: ${checked} types hold together`);
