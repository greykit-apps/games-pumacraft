#!/usr/bin/env node
/*
 * The engine must play the same game on every machine (js/engine/const.js
 * says why). This fails if any script under js/engine/ uses something whose
 * answer can differ between machines, runs or browsers:
 *
 *   Math.sin cos tan asin acos atan atan2 sqrt cbrt pow exp log hypot random
 *   the ** operator, Date, performance, new Map, new Set, for...in
 *
 * (Map and Set are banned outright rather than their iteration, which a
 * grep cannot tell apart from a lookup; the engine uses typed arrays.)
 * Comments and string literals are ignored. The painter and the recipes
 * under js/art/ are held to the transcendental half of it too.
 *
 *   node tools/lint-determinism.js
 */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "js", "engine");
const BANNED = [
  [/\bMath\.(sin|cos|tan|asin|acos|atan2?|sqrt|cbrt|pow|exp|expm1|log1?p?|log2|log10|hypot|random|sinh|cosh|tanh|fround)\b/, "Math.$1"],
  [/\*\*/, "the ** operator"],
  [/\bDate\b/, "Date"],
  [/\bperformance\b/, "performance"],
  [/\bnew\s+(Map|Set|WeakMap|WeakSet)\b/, "new $1"],
  [/\bfor\s*\([^)]*\bin\b/, "for...in"],
];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
/* blank out comments and strings, keeping line numbers */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
  .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, m => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
  .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));
/* the art: the sheets are checked pixel for pixel on whatever Node CI runs,
 * so the painter and its recipes use only exact arithmetic too (Math.sqrt
 * is exact; PC.Paint.sin and .cos are made from + - * for it) */
const ART = path.join(ROOT, "js", "art");
const ART_BANNED = [[/\bMath\.(sin|cos|tan|asin|acos|atan2?|cbrt|pow|exp|expm1|log1?p?|log2|log10|hypot|random|sinh|cosh|tanh)\b/, "Math.$1"], [/\*\*/, "the ** operator"]];
const files = walk(DIR).sort();
/* A check that checks nothing must never read as a pass. */
if (!files.length) { console.error("lint-determinism: no scripts under js/engine/ -- refusing to pass vacuously"); process.exit(1); }
let bad = 0;
for (const f of files) {
  if (path.basename(f) === "tables.js") continue;   /* generated literals */
  strip(fs.readFileSync(f, "utf8")).split("\n").forEach((line, n) => {
    for (const [re, what] of BANNED) {
      const m = line.match(re);
      if (m) { console.error(`${path.relative(ROOT, f)}:${n + 1}: ${what.replace("$1", m[1] || "")}`); bad++; }
    }
  });
}
const artFiles = walk(ART).sort().filter(f => path.basename(f) !== "atlas.js" && path.basename(f) !== "sheets.js");
for (const f of artFiles) strip(fs.readFileSync(f, "utf8")).split("\n").forEach((line, n) => {
  for (const [re, what] of ART_BANNED) { const m = line.match(re); if (m) { console.error(`${path.relative(ROOT, f)}:${n + 1}: ${what.replace("$1", m[1] || "")}`); bad++; } }
});
if (bad) { console.error(`lint-determinism: ${bad} use(s) of something that can differ between machines`); process.exit(1); }
console.log(`lint-determinism: ${files.length} engine scripts use integers and their own tables only; ${artFiles.length} art scripts exact arithmetic only`);
