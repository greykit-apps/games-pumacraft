#!/usr/bin/env node
/*
 * PumaCraft's icons, from one pixel drawing: a PDF command bastion with a
 * puma's ears, standing on the limb of a dusk-lit world in the Grey Reach,
 * its beacon lit.
 *
 *   node tools/make-icons.js
 *
 * Writes icon.svg (crisp rects), favicon-16x16.png, favicon-32x32.png and
 * favicon.ico (16, 32, 48, each a PNG inside). og.png and
 * apple-touch-icon.png come from greykit-meta's make-assets.sh, which reads
 * icon.svg (see DEVELOPMENT.md).
 */
"use strict";
const fs = require("fs"), path = require("path");
const { png, ico } = require("./png.js");
const ROOT = path.join(__dirname, "..");

/* ---- the drawing, 40 x 40 ---- */
const N = 40, R = 4;   /* the plate's corner radius, in cells */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 974634721)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const band = (stops, t, x, y) => { const f = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(f); return bayer(x, y) < f - i ? stops[i + 1] : stops[i]; };

const SKY = ["#05070f", "#0a0e1a", "#141a38", "#2a2456", "#4a2c5e"];
const GROUND = ["#d08a52", "#8a4a5a", "#4a2a46", "#24162c", "#140c1a"];
const STEEL = ["#e6ecf8", "#b8c2dc", "#94a0c4", "#5c6a92", "#33405e", "#1b2540"];
const horizon = x => 27 + Math.floor((x - 30) * (x - 30) / 70);   /* the world's limb, curving away left */

const ART = [];
for (let y = 0; y < N; y++) {
  const row = [];
  for (let x = 0; x < N; x++) {
    const hz = horizon(x);
    let c;
    if (y < hz) {
      c = band(SKY, y / hz, x, y);
      if (hash(x, y, 3) > 0.975 && y < hz - 3) c = hash(x, y, 4) > 0.5 ? "#dbe4fb" : "#8b96b8";
    } else c = band(GROUND, (y - hz) / 9, x, y);
    row.push(c);
  }
  ART.push(row);
}
const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) ART[y][x] = c; };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };

/* the limb's rim, lit by a sun just below it */
for (let x = 0; x < N; x++) { put(x, horizon(x), "#f0b070"); if (x > 18) put(x, horizon(x) - 1, "#6a3a5e"); }

/* the bastion: a tapering tower, lit from the upper left */
const BASE = 31, TOP = 12;
for (let y = TOP; y <= BASE; y++) {
  const inset = Math.floor((y - TOP) < 4 ? 0 : (BASE - y) / 6);
  const x0 = 11 + inset, x1 = 28 - inset;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    put(x, y, band(STEEL, 0.15 + t * 0.75, x, y));
  }
  put(x0, y, STEEL[0]); put(x1, y, STEEL[5]);
}
/* the roof deck, and the plinth it stands on */
rect(10, TOP - 1, 20, 1, STEEL[1]); rect(10, TOP, 20, 1, STEEL[3]);
rect(7, BASE + 1, 26, 2, STEEL[4]); rect(7, BASE + 1, 26, 1, STEEL[2]);
/* the command windows, PDF cyan */
rect(14, 18, 12, 2, "#1b2540"); rect(15, 18, 10, 1, "#54f2ff"); rect(15, 19, 10, 1, "#2a8ea8");
put(18, 18, "#dffcff"); put(22, 18, "#dffcff");
/* the hangar door */
rect(17, 25, 6, 6, "#1b2540"); for (let j = 0; j < 6; j += 2) rect(17, 25 + j, 6, 1, "#33405e");
rect(17, 24, 6, 1, "#ffb000");
/* a puma's ears on the roof */
const ear = (x, dir) => {
  /* a triangle, 5 wide at the roof, its tip leaning outward, the inner face lit */
  for (let j = 0; j < 6; j++) {
    const w = 5 - Math.floor(j * 5 / 6), x0 = dir > 0 ? x : x + 5 - w;
    for (let i = 0; i < w; i++) put(x0 + i, TOP - 2 - j, i === (dir > 0 ? w - 1 : 0) ? "#8a5a2e" : "#c98b49");
  }
  put(dir > 0 ? x : x + 4, TOP - 7, "#2a1a0e");
  put(x + 2, TOP - 3, "#ebb877"); put(x + 2, TOP - 4, "#ebb877");
};
ear(10, 1); ear(25, -1);
/* the beacon mast between them */
rect(19, TOP - 7, 2, 6, STEEL[3]); put(19, TOP - 7, STEEL[1]);
rect(18, TOP - 9, 4, 2, "#54f2ff"); put(18, TOP - 9, "#dffcff");
/* side turrets */
rect(6, 22, 5, 3, STEEL[3]); rect(6, 22, 5, 1, STEEL[1]); rect(3, 23, 3, 1, STEEL[5]);
rect(29, 22, 5, 3, STEEL[4]); rect(29, 22, 5, 1, STEEL[2]); rect(34, 23, 3, 1, STEEL[5]);

/* ---- icon.svg: one rect per run of a colour along a row ---- */
const rects = [];
ART.forEach((row, y) => {
  for (let x = 0; x < N;) {
    let e = x + 1;
    while (e < N && row[e] === row[x]) e++;
    rects.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${row[x]}"/>`);
    x = e;
  }
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" role="img" aria-label="PumaCraft">
<title>PumaCraft</title>
<!-- A PDF command bastion with a puma's ears, on the limb of a world in the Grey Reach. Written by tools/make-icons.js; edit the drawing there, not this file. -->
<clipPath id="p"><rect width="${N}" height="${N}" rx="${R}"/></clipPath>
<g clip-path="url(#p)">
${rects.join("\n")}
</g>
</svg>
`;

/* ---- rasters. Small ones average 4x4 samples of the drawing per pixel;
 * big ones take the nearest cell, so the pixels stay pixels. ---- */
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const cellAt = (gx, gy) => {
  const cx = Math.min(Math.max(gx, R), N - R), cy = Math.min(Math.max(gy, R), N - R);
  if ((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy) > R * R) return null;
  return hex(ART[Math.min(N - 1, Math.floor(gy))][Math.min(N - 1, Math.floor(gx))]);
};
function raster(size) {
  const px = Buffer.alloc(size * size * 4), S = size >= 2 * N ? 1 : 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = cellAt((x + (sx + 0.5) / S) / size * N, (y + (sy + 0.5) / S) / size * N);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (y * size + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = 255 * a / (S * S); }
  }
  return png(size, size, px);
}

if (process.argv.includes("--preview")) {
  /* a 320 px look at the drawing, for review; not a shipped file */
  const out = process.argv[process.argv.indexOf("--preview") + 1];
  fs.writeFileSync(out, raster(320));
  console.log("wrote " + out);
} else {
  fs.writeFileSync(path.join(ROOT, "icon.svg"), svg);
  fs.writeFileSync(path.join(ROOT, "favicon-16x16.png"), raster(16));
  fs.writeFileSync(path.join(ROOT, "favicon-32x32.png"), raster(32));
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), ico([[16, raster(16)], [32, raster(32)], [48, raster(48)]]));
  console.log("wrote icon.svg, favicon-16x16.png, favicon-32x32.png, favicon.ico");
}
