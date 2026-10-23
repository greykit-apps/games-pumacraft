#!/usr/bin/env node
/*
 * Bakes PumaCraft's sprite sheets from the recipes in js/art/recipes/.
 *
 *   node tools/bake-art.js                    paint every recipe and write the sheets
 *   node tools/bake-art.js --check            repaint in memory; fail if any sheet or
 *                                             the atlas differs from what is committed (CI)
 *   node tools/bake-art.js --preview KEY OUT [SCALE] [ANIM]
 *                                             a contact sheet of one recipe (or one of
 *                                             its animations), every facing, scaled up
 *
 * Writes art/<sheet>.png, js/art/atlas.js (where every frame is) and
 * art/manifest.json (a hash of each sheet's pixels), and stamps the sheets'
 * <link rel="preload"> lines in index.html with those hashes, so a new
 * sheet is a new URL to Cloudflare and canon's check-assets.js sees them.
 *
 * --check compares pixels, not PNG bytes: zlib's output may change between
 * Node versions while the picture does not.
 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { png } = require("./png.js");
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);

/* ---- the painter and the recipes, loaded as the browser loads them ---- */
function loadArt() {
  const dir = path.join(ROOT, "js", "art", "recipes");
  const files = ["js/art/paint.js", "js/art/pal.js", "js/art/recipes.js", ...fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => "js/art/recipes/" + f)];
  const body = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const PC = {}, G = { PC };
  new Function("globalThis", "PC", '"use strict";\n' + body)(G, PC);
  return { PC, files };
}

/** Every frame of a recipe: [{ anim, f, facing, rgba, w, h, rect, ax, ay }]. */
function paintRecipe(PC, r) {
  const [bw, bh, ox, oy] = r.box, out = [];
  for (const [anim, a] of Object.entries(r.anims)) {
    const facings = a.facings || r.facings;
    for (let f = 0; f < a.n; f++) for (let k = 0; k < facings; k++) {
      const heading = facings === 1 ? 90 : k * 360 / facings;
      const rgba = PC.Paint.frame(r.parts(anim, f, a.n), heading, bw, bh, ox, oy, PC.PAL);
      const rect = PC.Paint.trim(rgba, bw, bh);
      out.push({ anim, f, facing: k, rgba, w: bw, h: bh, rect, ax: ox, ay: oy });
    }
  }
  return out;
}

/* ---- preview: one recipe, every frame, on a mid ground, scaled ---- */
if (args[0] === "--preview") {
  const { PC } = loadArt(), r = PC.Recipes.byKey[args[1]];
  if (!r) { console.error("no recipe " + args[1]); process.exit(1); }
  const frames = paintRecipe(PC, r), S = +(args[3] || 4), [bw, bh] = r.box;
  const anims = Object.entries(r.anims).filter(([k]) => !args[4] || k === args[4]), cols = Math.max(...anims.map(([, a]) => (a.facings || r.facings))), rows = anims.reduce((s, [, a]) => s + a.n, 0);
  const W = cols * bw * S, H = rows * bh * S, img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { const y = Math.floor(i / W); img.set([90 + (y / H) * 20, 96, 70, 255], i * 4); }
  let row = 0;
  for (const [anim, a] of anims) for (let f = 0; f < a.n; f++, row++) {
    for (const fr of frames.filter(x => x.anim === anim && x.f === f)) {
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const s = (y * bw + x) * 4, al = fr.rgba[s + 3] / 255;
        if (!al) continue;
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
          const d = (((row * bh + y) * S + j) * W + (fr.facing * bw + x) * S + i) * 4;
          for (let c = 0; c < 3; c++) img[d + c] = img[d + c] * (1 - al) + fr.rgba[s + c] * al;
        }
      }
    }
  }
  fs.writeFileSync(args[2], png(W, H, img));
  console.log(`wrote ${args[2]}: ${frames.length} frames`);
  process.exit(0);
}

/* ---- the bake ---- */
const { PC, files } = loadArt();
const sheets = new Map();   /* name -> [{ key, anim, f, facing, rgba, rect, ... }] */
const sprites = {};
for (const r of PC.Recipes.list) {
  const frames = paintRecipe(PC, r);
  if (!sheets.has(r.sheet)) sheets.set(r.sheet, []);
  for (const fr of frames) { fr.key = r.key; sheets.get(r.sheet).push(fr); }
  sprites[r.key] = { sheet: r.sheet, facings: r.facings, anims: {} };
  for (const [anim, a] of Object.entries(r.anims)) sprites[r.key].anims[anim] = { n: a.n, fps: a.fps, facings: a.facings || r.facings, f: [] };
}

/* the ground's tiles: every variant of every tile recipe, 24 x 24, into its sheet */
const tiles = {};
for (const t of PC.Recipes.tiles || []) {
  if (!sheets.has(t.sheet)) sheets.set(t.sheet, []);
  tiles[t.key] = { sheet: t.sheet, v: [] };
  for (let v = 0; v < t.variants; v++) {
    const rgba = new Uint8Array(24 * 24 * 4);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const c = t.paint(x, y, v); if (c) rgba.set([c[0], c[1], c[2], 255], (y * 24 + x) * 4); }
    sheets.get(t.sheet).push({ tile: t.key, v, rgba, w: 24, h: 24, rect: [0, 0, 24, 24], ax: 0, ay: 0 });
  }
}

/* shelf-pack each sheet: tallest frames first, 1024 wide, rows as tall as their first frame */
const SHEET_W = 1024, out = {}, manifest = {};
for (const [name, frames] of sheets) {
  const order = frames.map((fr, i) => i).filter(i => frames[i].rect).sort((a, b) => frames[b].rect[3] - frames[a].rect[3] || frames[b].rect[2] - frames[a].rect[2] || a - b);
  let x = 0, y = 0, rowH = 0;
  const place = new Array(frames.length).fill(null);
  for (const i of order) {
    const [, , w, h] = frames[i].rect;
    if (x + w > SHEET_W) { x = 0; y += rowH + 1; rowH = 0; }
    place[i] = [x, y]; x += w + 1; rowH = Math.max(rowH, h);
  }
  const H = y + rowH, img = Buffer.alloc(SHEET_W * Math.max(1, H) * 4);
  frames.forEach((fr, i) => {
    if (fr.tile) { const [px, py] = place[i]; for (let yy = 0; yy < 24; yy++) Buffer.from(fr.rgba.buffer).copy(img, ((py + yy) * SHEET_W + px) * 4, yy * 96, yy * 96 + 96); tiles[fr.tile].v[fr.v] = [px, py]; return; }
    const spr = sprites[fr.key].anims[fr.anim];
    if (!fr.rect) { spr.f[fr.f * spr.facings + fr.facing] = [0, 0, 0, 0, 0, 0]; return; }
    const [rx, ry, w, h] = fr.rect, [px, py] = place[i];
    for (let yy = 0; yy < h; yy++) Buffer.from(fr.rgba.buffer).copy(img, ((py + yy) * SHEET_W + px) * 4, ((ry + yy) * fr.w + rx) * 4, ((ry + yy) * fr.w + rx + w) * 4);
    /* x, y, w, h on the sheet; the anchor (the ground centre) within the frame */
    spr.f[fr.f * spr.facings + fr.facing] = [px, py, w, h, fr.ax - rx, fr.ay - ry];
  });
  out[name] = { w: SHEET_W, h: Math.max(1, H), img };
  manifest[name] = crypto.createHash("sha256").update(img).digest("hex");
}

const stamp = name => manifest[name].slice(0, 8);
const atlas = `/* PumaCraft art -- where every frame is. Written by tools/bake-art.js; do not edit.
 * sprites[key].anims[anim].f[frame * facings + facing] = [x, y, w, h, anchorX, anchorY]
 * tiles[key].v[variant] = [x, y] of a 24 x 24 tile */
"use strict";
globalThis.PC = globalThis.PC || {};
PC.ATLAS = ${JSON.stringify({ sheets: Object.fromEntries(Object.entries(out).map(([n, s]) => [n, { w: s.w, h: s.h, src: `art/${n}.png?v=${stamp(n)}` }])), sprites, tiles })};
`;
const srcHash = crypto.createHash("sha256").update(files.map(f => fs.readFileSync(path.join(ROOT, f))).join("\n")).digest("hex");
const manifestText = JSON.stringify({ recipes: srcHash, sheets: manifest }, null, 2) + "\n";

/* the preload lines, between markers in index.html */
const pagePath = path.join(ROOT, "index.html"), page = fs.readFileSync(pagePath, "utf8");
const links = Object.keys(out).map(n => `<link rel="preload" as="image" href="art/${n}.png?v=${stamp(n)}">`).join("\n");
const BEGIN = "<!-- @art-begin: written by tools/bake-art.js -->", END = "<!-- @art-end -->";
if (!page.includes(BEGIN)) { console.error("index.html has no " + BEGIN + " marker"); process.exit(1); }
const newPage = page.replace(new RegExp(BEGIN + "[\\s\\S]*?" + END), BEGIN + "\n" + links + "\n" + END);

if (args.includes("--check")) {
  const bad = [];
  const read = f => fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  if (read(path.join(ROOT, "js/art/atlas.js")) !== atlas) bad.push("js/art/atlas.js");
  if (read(path.join(ROOT, "art/manifest.json")) !== manifestText) bad.push("art/manifest.json");
  if (newPage !== page) bad.push("index.html's sheet preloads");
  /* and the committed PNGs hold these pixels */
  const zlib = require("zlib");
  for (const [name, s] of Object.entries(out)) {
    const f = path.join(ROOT, "art", name + ".png");
    if (!fs.existsSync(f)) { bad.push(`art/${name}.png (missing)`); continue; }
    const pix = decodePNG(fs.readFileSync(f), zlib);
    if (!pix || pix.w !== s.w || pix.h !== s.h || !pix.rgba.equals(s.img)) bad.push(`art/${name}.png`);
  }
  if (!Object.keys(out).length) bad.push("(no sheets at all)");
  if (bad.length) { console.error("stale art: " + bad.join(", ") + "\nrun node tools/bake-art.js and commit the result"); process.exit(1); }
  console.log(`art current: ${Object.keys(out).length} sheet(s), ${PC.Recipes.list.length} recipe(s)`);
} else {
  fs.mkdirSync(path.join(ROOT, "art"), { recursive: true });
  for (const [name, s] of Object.entries(out)) fs.writeFileSync(path.join(ROOT, "art", name + ".png"), png(s.w, s.h, s.img));
  fs.writeFileSync(path.join(ROOT, "js/art/atlas.js"), atlas);
  fs.writeFileSync(path.join(ROOT, "art/manifest.json"), manifestText);
  fs.writeFileSync(pagePath, newPage);
  for (const [name, s] of Object.entries(out)) console.log(`art/${name}.png  ${s.w}x${s.h}`);
  console.log(`baked ${PC.Recipes.list.length} recipe(s)`);
}

/** Decodes the PNGs png.js writes (8-bit RGBA, filter 0) back to pixels. */
function decodePNG(buf, zlib) {
  let o = 8, w = 0, h = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6) return null; }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) { if (raw[y * (w * 4 + 1)] !== 0) return null; raw.copy(rgba, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)); }
  return { w, h, rgba };
}
