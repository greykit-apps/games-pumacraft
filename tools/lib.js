/* The engine, loaded headless: the DOM-free scripts index.html loads from
 * js/engine/, js/data/, js/maps/ and js/missions/, in the page's own order,
 * with no document, no canvas and no sound. The page is the one list of
 * what loads and when; this reads it rather than keeping a second copy that
 * could drift.
 *
 * Each load is a fresh function whose globalThis and PC are its own, so two
 * loads share nothing. It is deliberately not a vm context: there every
 * global lookup (Math.imul in a hot loop, say) goes through the context's
 * interceptor, and measured 2026-10-22 the state hash ran 100x slower in
 * one than in a browser -- a headless check that slow says nothing true
 * about the game's speed. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const HEADLESS = /^js\/(engine|data|maps|missions)\//;

/** The engine's scripts, in index.html's order. */
function engineFiles() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script\s+src="([^"?]+)(?:\?v=[0-9a-f]+)?"/g)].map(m => m[1]).filter(f => HEADLESS.test(f));
  if (!files.length) throw new Error("index.html loads no engine scripts -- refusing to load nothing");
  return files;
}

/** A fresh engine of its own; returns its PC. */
function load(files = engineFiles()) {
  const body = files.map(f => "/* ---- " + f + " ---- */\n" + fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const PC = {}, G = { PC };
  new Function("globalThis", "PC", '"use strict";\n' + body + "\n//# sourceURL=pumacraft-engine.js")(G, PC);
  return G.PC;
}

module.exports = { ROOT, engineFiles, load };
