#!/usr/bin/env node
/*
 * Writes js/engine/tables.js: the engine's trigonometry as integer literals,
 * so the simulation never calls Math.sin, Math.cos or Math.atan2 and no two
 * machines can round them differently.
 *
 *   node tools/gen-tables.js           rewrite js/engine/tables.js
 *   node tools/gen-tables.js --check   fail if it differs from what this writes (CI)
 *
 * Headings are 0..255, 0 east, 64 south (screen y grows downward).
 *   SIN[h], COS[h]  scaled by 1024
 *   ATAN[t]         for t = 0..64, the heading of the slope t/64, 0..32
 */
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "js", "engine", "tables.js");
const sin = [], cos = [], atan = [];
for (let h = 0; h < 256; h++) { const a = h / 256 * 2 * Math.PI; sin.push(Math.round(Math.sin(a) * 1024)); cos.push(Math.round(Math.cos(a) * 1024)); }
for (let t = 0; t <= 64; t++) atan.push(Math.round(Math.atan(t / 64) / (2 * Math.PI) * 256));
const rows = (a, n = 16) => { const out = []; for (let i = 0; i < a.length; i += n) out.push("    " + a.slice(i, i + n).join(", ") + ","); return out.join("\n"); };
const src = `/* PumaCraft engine -- trigonometry as integers. Written by tools/gen-tables.js;
 * do not edit. Headings are 0..255, 0 east, 64 south. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  PC.SIN = new Int16Array([
${rows(sin)}
  ]);
  PC.COS = new Int16Array([
${rows(cos)}
  ]);
  PC.ATAN = new Uint8Array([
${rows(atan, 13)}
  ]);
})();
`;
if (process.argv.includes("--check")) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (now !== src) { console.error("js/engine/tables.js is stale: run node tools/gen-tables.js"); process.exit(1); }
  console.log("tables current");
} else { fs.writeFileSync(OUT, src); console.log("wrote js/engine/tables.js"); }
