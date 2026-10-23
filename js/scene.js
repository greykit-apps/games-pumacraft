/* PumaCraft -- the title's scene: dusk over a world in the Grey Reach.
 * Three layers of stars drifting, a moon, the planet's limb turning slowly
 * under a lit rim of air, a survey beacon blinking on the surface, and now
 * and then a PDF dropship crossing high with its nav lights on.
 *
 * Painted a pixel at a time into a 320x180 buffer, ordered-dithered between
 * the steps of each colour ramp, and scaled up whole by CSS. With reduced
 * motion it paints one frame and stops. */
"use strict";
(() => {
  const W = 320, H = 180;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
  const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 974634721)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  /* colours as little-endian ABGR words, for a Uint32 view of ImageData */
  const rgb = h => (255 << 24 | parseInt(h.slice(5, 7), 16) << 16 | parseInt(h.slice(3, 5), 16) << 8 | parseInt(h.slice(1, 3), 16)) >>> 0;
  const ramp = hexes => hexes.map(rgb);
  const pick = (r, t, x, y) => { const f = Math.max(0, Math.min(0.9999, t)) * (r.length - 1), i = Math.floor(f); return bay(x, y) < f - i ? r[i + 1] : r[i]; };

  const SKY = ramp(["#05070f", "#070a16", "#0a0e1a", "#11163a", "#1d1c48", "#2a2456", "#4a2c5e"]);
  const NEB = ramp(["#11163a", "#24204e", "#3a2a5e"]);
  const LAND = ramp(["#d08a52", "#a8606a", "#7a4058", "#4a2a46", "#2e1a34", "#1a0e20", "#100816"]);
  const RIM = ramp(["#f0b070", "#c87068", "#6a3a5e"]);
  const MOON = ramp(["#dbe4fb", "#94a0c4", "#5c6a92", "#33405e", "#1b2540"]);
  const STAR = [rgb("#dbe4fb"), rgb("#8b96b8"), rgb("#54f2ff"), rgb("#ffd89a")];
  const CYAN = rgb("#54f2ff"), CYAN_HI = rgb("#dffcff"), RED = rgb("#ff5266"), GREEN = rgb("#4ade6a");

  /* the planet: a great circle whose top edge is the limb */
  const PX = 210, PY = 640, PR = 512;
  const limb = new Int16Array(W);
  for (let x = 0; x < W; x++) { const dx = x - PX; limb[x] = Math.round(PY - Math.sqrt(PR * PR - dx * dx)); }

  /* value noise for the land and the nebula, tiled 256 wide */
  const NW = 256, NH = 64, noise = new Float32Array(NW * NH);
  {
    const g = (x, y, s) => hash(x & 31, y, s);
    for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
      let v = 0, amp = 0.55, f = 8;
      for (let o = 0; o < 3; o++, amp *= 0.5, f /= 2) {
        const gx = x / f, gy = y / f, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), wrap = NW / f;
        const a = g(x0 % wrap, y0, o), b = g((x0 + 1) % wrap, y0, o), c = g(x0 % wrap, y0 + 1, o), d = g((x0 + 1) % wrap, y0 + 1, o);
        v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
      noise[y * NW + x] = v;
    }
  }
  const nz = (x, y) => noise[((y % NH + NH) % NH) * NW + ((Math.floor(x) % NW) + NW) % NW];

  /* the sky, painted once: the ramp down to the limb and a faint band of nebula */
  const sky = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = pick(SKY, Math.pow(y / 150, 1.6), x, y);
    const n = nz(x * 0.7 + 40, (y >> 1) + 9), band = 1 - Math.abs((y - 58 - x * 0.12) / 34);
    if (band > 0 && n * band > 0.42) c = pick(NEB, (n * band - 0.42) * 4, x, y);
    sky[y * W + x] = c;
  }
  /* three layers of stars: [x, y, layer, colour, phase] */
  const stars = [];
  for (let i = 0; i < 170; i++) {
    const layer = i < 110 ? 0 : i < 150 ? 1 : 2;
    stars.push([hash(i, 1, 5) * W, hash(i, 2, 5) * 140, layer, hash(i, 3, 5) < 0.86 ? (layer ? 0 : 1) : 2 + (hash(i, 4, 5) < 0.5 ? 1 : 0), hash(i, 5, 5) * 6.28]);
  }
  const SPEED = [0.6, 1.4, 3.2];   /* pixels a second, far to near */

  /* the dropship, nose right, 15 x 7: . clear, 1-5 the steel ramp light to dark, c cyan glass, e engine */
  const SHIP = [
    "....1122.......",
    "..11222333.....",
    "e1222cc33344...",
    "e2333333344445.",
    "e3344444455555.",
    "..4455555......",
    "....55.........",
  ];
  const STEEL = ramp(["#e6ecf8", "#b8c2dc", "#94a0c4", "#5c6a92", "#33405e"]);

  function paint(buf, t) {
    buf.set(sky);
    /* stars */
    for (const [sx, sy, layer, c, ph] of stars) {
      const x = Math.floor(((sx - t * SPEED[layer]) % W + W) % W), y = Math.floor(sy);
      if (y >= limb[x] - 1) continue;
      const tw = Math.sin(t * (1.1 + layer * 0.4) + ph);
      if (layer === 0 && tw < -0.6) continue;
      buf[y * W + x] = STAR[c];
      if (layer === 2 && tw > 0.7) { if (x > 0) buf[y * W + x - 1] = STAR[1]; if (x < W - 1) buf[y * W + x + 1] = STAR[1]; }
    }
    /* the moon, lit from the lower right by the sun behind the limb */
    const MX = 236, MY = 30, MR = 11;
    for (let y = -MR; y <= MR; y++) for (let x = -MR; x <= MR; x++) {
      const d = x * x + y * y;
      if (d > MR * MR) continue;
      const z = Math.sqrt(MR * MR - d), lit = (x * 0.45 + y * 0.55 + z * 0.7) / MR;
      let c = pick(MOON, 0.85 - lit * 0.75, x + MX, y + MY);
      if (hash((x + 40) >> 1, (y + 40) >> 1, 11) > 0.84 && lit > 0.1) c = MOON[Math.min(4, MOON.indexOf(c) + 1)];
      buf[(MY + y) * W + MX + x] = c;
    }
    /* the limb's air, a glow above the land */
    for (let x = 0; x < W; x++) for (let k = 1; k <= 4; k++) {
      const y = limb[x] - k;
      if (y >= 0 && y < H && bay(x, y) < (5 - k) / 5) buf[y * W + x] = RIM[Math.min(2, k - 1)];
    }
    /* the land, seen from high above it: a ground plane receding to the
       limb, its features drifting past as the world turns under the view */
    const spin = t * 2.2;
    for (let x = 0; x < W; x++) {
      const top = Math.max(0, limb[x]);
      for (let y = top; y < H; y++) {
        const depth = y - limb[x], z = 1 / (depth + 2.5);
        const n = nz((x - PX) * z * 26 + spin, Math.floor(z * 260) + 3);
        let tone = 0.1 + depth / 62 + (n - 0.5) * 0.7;
        if (depth === 0) tone = 0;
        buf[y * W + x] = pick(LAND, tone, x, y);
      }
    }
    /* the survey beacon on the surface */
    const BX = 132, BY = limb[BX] + 9;
    buf[BY * W + BX] = CYAN; buf[(BY - 1) * W + BX] = rgb("#33405e");
    if ((t % 2.4) < 0.25) { buf[BY * W + BX] = CYAN_HI; buf[(BY - 1) * W + BX] = CYAN; buf[BY * W + BX - 1] = CYAN; buf[BY * W + BX + 1] = CYAN; }
    /* the dropship: one crossing every 28 seconds, high and left to right */
    const run = t % 28;
    if (run < 22) {
      const sx = Math.floor(-20 + run * 16.5), sy = Math.floor(70 - run * 1.1 + Math.sin(t * 1.7) * 1.2);
      for (let j = 0; j < SHIP.length; j++) for (let i = 0; i < SHIP[j].length; i++) {
        const ch = SHIP[j][i], x = sx + i, y = sy + j;
        if (ch === "." || x < 0 || x >= W || y < 0 || y >= H) continue;
        let c = ch === "c" ? CYAN : ch === "e" ? ((t * 12 | 0) % 2 ? CYAN : CYAN_HI) : STEEL[+ch - 1];
        buf[y * W + x] = c;
      }
      /* the engine trail and the nav lights */
      for (let k = 1; k < 7; k++) { const x = sx - k, y = sy + 3; if (x >= 0 && x < W && bay(x, y) < 1 - k / 7) buf[y * W + x] = k < 3 ? CYAN : rgb("#2a8ea8"); }
      const blink = (t * 1.5) % 1 < 0.18;
      if (blink) { const a = (sy + 1) * W + sx + 4, b = (sy + 5) * W + sx + 6; if (sx + 6 < W && sx + 4 >= 0) { buf[a] = RED; buf[b] = GREEN; } }
    }
  }

  /** Draws the scene into host, a .scene element; returns stop(). */
  PC.titleScene = host => {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H; cv.className = "pc-scene";
    host.appendChild(cv);
    const g = cv.getContext("2d"), img = g.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const still = typeof reduced === "function" && reduced();
    let raf = 0, t0 = 0, alive = true;
    const frame = ms => {
      if (!alive) return;
      if (!t0) t0 = ms;
      paint(buf, still ? 6 : (ms - t0) / 1000 + 6);
      g.putImageData(img, 0, 0);
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  };
})();
