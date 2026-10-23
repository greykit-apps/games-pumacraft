#!/usr/bin/env node
/*
 * Stamps every local script and stylesheet index.html loads with a hash of
 * its contents: src="js/main.js?v=1a2b3c4d".
 *
 *   node tools/stamp-assets.js           rewrite index.html
 *   node tools/stamp-assets.js --check   fail if any stamp is stale (CI)
 *
 * greykit.com sits behind Cloudflare, which keeps .js and .css for 30 days.
 * The page itself is not edge-cached, so a new stamp in it is a new URL, and
 * a deploy reaches players at once. (Commander Poom's tool, widened to the
 * stylesheets.)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const page = path.join(root, "index.html");
const html = fs.readFileSync(page, "utf8");
const check = process.argv.includes("--check");

let count = 0;
const stale = [];
const stamp = (m, a, file, old, z) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.error(`  error: index.html loads ${file}, which is not in the repo`); process.exit(1); }
  const v = "?v=" + crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex").slice(0, 8);
  count++;
  if (old !== v) stale.push(file);
  return a + file + v + z;
};
const out = html
  .replace(/(<script\s+src=")([^"?#:]+\.js)(\?v=[0-9a-f]+)?(")/g, stamp)
  .replace(/(<link\s+rel="stylesheet"\s+href=")([^"?#:]+\.css)(\?v=[0-9a-f]+)?(")/g, stamp);

/* A check that checks nothing must never read as a pass. */
if (count === 0) { console.error("stamp: index.html loads no local scripts -- refusing to pass vacuously"); process.exit(1); }
if (check) {
  if (stale.length) { console.error(`stale stamps: ${stale.join(", ")}\nrun node tools/stamp-assets.js and commit index.html`); process.exit(1); }
  console.log(`stamps current on ${count} file(s)`);
} else {
  fs.writeFileSync(page, out);
  console.log(`stamped ${count} file(s)${stale.length ? `; updated ${stale.length}` : "; none changed"}`);
}
