/* PumaCraft art -- the painter. Pure: no DOM, no Node, no canvas, so the
 * same code bakes the sprite sheets in Node (tools/bake-art.js) and paints
 * them live in a browser (tools/sheet.html).
 *
 * A sprite is a few 3D parts -- boxes, balls, cylinders, cones -- posed in
 * the unit's own space (x forward, y to its right, z up) and seen from the
 * game's camera, an oblique view: the ground one to one with the screen,
 * height rising up it, so the tops and south faces of things show. Every pixel
 * casts one ray into the parts; the nearest hit gives the colour, and its
 * surface normal against the sun (high, from the top left) picks the step
 * of that part's colour ramp, ordered-dithered between steps. Then the
 * silhouette takes a dark outline and the parts cast a soft shadow onto the
 * ground, both in the same frame.
 *
 * Because every facing is rendered rather than mirrored, the light falls
 * from the same side in all of them. Light and position are quantised
 * before they choose a colour, so a bake is the same pixel for pixel on any
 * machine (tools/bake-art.js --check relies on it).
 *
 * A part: { s: "box"|"ball"|"cyl"|"cone", at: [x,y,z], size: [hx,hy,hz]
 * (half extents), rot: [yaw,pitch,roll] degrees (optional), ramp: name,
 * glow: true (unlit, full colour), shade: -1..1 (nudge darker/lighter) }.
 * Sizes are in screen pixels. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const P = PC.Paint = {};

  /* ---- the camera ---- */
  /* An oblique view, as the 16-bit strategy games drew theirs: the ground
     maps to the screen one to one (a tile is a square, as on the map), and
     height rises up the screen at KZ of its length, so the tops and the
     south faces of things show. screen x = x; screen y = y - z * KZ. The
     view ray, along which screen y stays put, runs (0, -KZ, -1): down, and
     back toward the north. */
  const KZ = 0.75;
  const VIEW = norm([0, -KZ, -1]);
  /* the sun: high, from the west and a little north -- the screen's left,
     so fronts (south faces) sit in a mid tone, tops and west faces in light,
     and shadows fall to the right */
  const SUN = norm([-0.6, -0.15, 0.8]);
  function norm(v) { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  P.KZ = KZ; P.SUN = SUN;

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const q = (v, s = 1024) => Math.round(v * s) / s;   /* quantise, so tiny float differences cannot flip a pixel */

  /* ---- sine and cosine, made here ----
     Math.sin and Math.cos are not promised to give the same last bit in
     every engine version, and one bit can flip a pixel at a part's edge:
     measured 2026-10-23, Node 20 and Node 24 baked different Kestrels. These
     use only + - * and Math.round, which are exact everywhere: the angle
     brought into [-pi/2, pi/2], then the Taylor series to x^17, good to the
     last bit that matters. */
  const PI = 3.141592653589793, TAU = 6.283185307179586;
  function sinR(x) {
    x -= TAU * Math.round(x / TAU);
    if (x > PI / 2) x = PI - x; else if (x < -PI / 2) x = -PI - x;
    const x2 = x * x;
    return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210 * (1 - x2 / 272))))))));
  }
  P.sin = sinR;
  P.cos = x => sinR(x + PI / 2);

  /* ---- matrices: 3x3, row-major ---- */
  const D2R = PI / 180;
  function rotM(yaw, pitch, roll) {
    const cy = P.cos(yaw * D2R), sy = P.sin(yaw * D2R), cp = P.cos(pitch * D2R), sp = P.sin(pitch * D2R), cr = P.cos(roll * D2R), sr = P.sin(roll * D2R);
    /* yaw about z, then pitch about y, then roll about x */
    return [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr,
      sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr,
      -sp, cp * sr, cp * cr];
  }
  const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const tr = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

  /** Prepares parts for heading deg (0 = facing screen-right, 90 = toward the viewer). */
  function prepare(parts, heading) {
    const H = rotM(heading, 0, 0);
    return parts.map(p => {
      const R = mul(H, p.rot ? rotM(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0) : rotM(0, 0, 0));
      const c = apply(H, p.at || [0, 0, 0]), sz = p.size;
      /* world -> local unit space: inverse of (R * diag(size)) = diag(1/size) * R^T */
      const Rt = tr(R), inv = [Rt[0] / sz[0], Rt[1] / sz[0], Rt[2] / sz[0], Rt[3] / sz[1], Rt[4] / sz[1], Rt[5] / sz[1], Rt[6] / sz[2], Rt[7] / sz[2], Rt[8] / sz[2]];
      return { p, c, inv, nrm: tr(inv) };   /* a local normal n goes to world as inv^T n */
    });
  }

  /* ---- ray against a unit primitive at the origin; returns [t, nx, ny, nz] or null ---- */
  function hitBall(o, d) {
    const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    return [t, x, y, z];
  }
  function hitBox(o, d) {
    let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 0;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-12) { if (o[k] < -1 || o[k] > 1) return null; continue; }
      let a = (-1 - o[k]) / d[k], b = (1 - o[k]) / d[k], s = -1;
      if (a > b) { const tmp = a; a = b; b = tmp; s = 1; }
      if (a > t0) { t0 = a; ax = k; sg = s; }
      if (b < t1) t1 = b;
      if (t0 > t1) return null;
    }
    if (ax < 0) return null;
    const n = [0, 0, 0]; n[ax] = sg;
    return [t0, n[0], n[1], n[2]];
  }
  function hitCyl(o, d, cone) {
    /* axis z, radius 1 (a cone narrows to a point at z = +1), caps at z = +-1 */
    let best = null;
    const k = cone ? 0.5 : 0;   /* cone: radius (1 - z) / 2 + ... as r(z) = (1 - z) / 2 */
    if (!cone) {
      const a = d[0] * d[0] + d[1] * d[1], b = o[0] * d[0] + o[1] * d[1], c = o[0] * o[0] + o[1] * o[1] - 1;
      if (a > 1e-12) {
        const disc = b * b - a * c;
        if (disc >= 0) {
          const t = (-b - Math.sqrt(disc)) / a, z = o[2] + d[2] * t;
          if (z >= -1 && z <= 1) best = [t, o[0] + d[0] * t, o[1] + d[1] * t, 0];
        }
      }
    } else {
      /* x^2 + y^2 = ((1 - z) / 2)^2 */
      const oz = (1 - o[2]) * k, dz = -d[2] * k;
      const a = d[0] * d[0] + d[1] * d[1] - dz * dz, b = o[0] * d[0] + o[1] * d[1] - oz * dz, c = o[0] * o[0] + o[1] * o[1] - oz * oz;
      if (Math.abs(a) > 1e-12) {
        const disc = b * b - a * c;
        if (disc >= 0) for (const t of [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a]) {
          const z = o[2] + d[2] * t;
          if (z >= -1 && z <= 1 && (!best || t < best[0])) { const x = o[0] + d[0] * t, y = o[1] + d[1] * t, r = Math.sqrt(x * x + y * y) || 1; best = [t, x / r, y / r, k]; }
        }
      }
    }
    for (const cz of cone ? [-1] : [-1, 1]) {
      if (Math.abs(d[2]) < 1e-12) continue;
      const t = (cz - o[2]) / d[2], x = o[0] + d[0] * t, y = o[1] + d[1] * t;
      if (x * x + y * y <= 1 && (!best || t < best[0])) best = [t, 0, 0, cz];
    }
    return best;
  }

  /** The nearest hit along a world ray: { t, n: [world normal], part } or null. */
  function cast(prep, o, d) {
    let best = null;
    for (const P of prep) {
      const lo = apply(P.inv, [o[0] - P.c[0], o[1] - P.c[1], o[2] - P.c[2]]), ld = apply(P.inv, d);
      const s = P.p.s, h = s === "ball" ? hitBall(lo, ld) : s === "box" ? hitBox(lo, ld) : s === "cyl" ? hitCyl(lo, ld, false) : s === "cone" ? hitCyl(lo, ld, true) : null;
      if (!h || h[0] < 0 || (best && h[0] >= best.t)) continue;
      best = { t: h[0], n: norm(apply(P.nrm, [h[1], h[2], h[3]])), part: P.p };
    }
    return best;
  }

  /**
   * Paints one frame of parts at heading deg into a w x h RGBA buffer whose
   * ground origin (the unit's centre on the ground) sits at pixel (ox, oy).
   * ramps: { name: ["#rrggbb", ...] light to dark }. Returns the Uint8Array.
   */
  P.frame = (parts, heading, w, h, ox, oy, ramps, opts = {}) => {
    const prep = prepare(parts, heading), rgba = new Uint8Array(w * h * 4), body = new Uint8Array(w * h);
    const dep = new Float32Array(w * h).fill(Infinity), shadow = new Uint8Array(w * h);
    const far = 400;
    const cache = {};
    const col = (name, i) => { const r = ramps[name] || ramps.error; const k = name + i; return cache[k] || (cache[k] = hex(r[Math.max(0, Math.min(r.length - 1, i))])); };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      /* the ray for this pixel: screen (sx, sy) is the ground point (sx, sy), seen along VIEW */
      const sx = px - ox + 0.5, sy = py - oy + 0.5;
      const gx = sx, gy = sy;
      const o = [gx - VIEW[0] * far, gy - VIEW[1] * far, 0 - VIEW[2] * far];
      const hit = cast(prep, o, VIEW);
      if (!hit) continue;
      const i = py * w + px, P = hit.part, r = ramps[P.ramp] || ramps.error;
      let c;
      if (P.glow) c = col(P.ramp, P.step || 0);
      else {
        const lit = q(hit.n[0] * SUN[0] + hit.n[1] * SUN[1] + hit.n[2] * SUN[2], 256);
        /* light 0..1: a sunlit face is bright, a face turned away keeps the ambient */
        let t = q(0.5 + 0.5 * lit + (P.shade || 0) * 0.25, 256);
        t = Math.max(0, Math.min(1, t));
        const f = (1 - t) * (r.length - 1), k = Math.floor(f);
        c = col(P.ramp, bay(px, py) < f - k ? k + 1 : k);
      }
      rgba.set([c[0], c[1], c[2], 255], i * 4);
      body[i] = 1; dep[i] = hit.t;
      /* its shadow: follow the sun down to the ground */
      if (opts.shadow !== false) {
        const wp = [o[0] + VIEW[0] * hit.t, o[1] + VIEW[1] * hit.t, o[2] + VIEW[2] * hit.t];
        if (wp[2] > 0.3) {
          const k = wp[2] / SUN[2], gx2 = wp[0] - SUN[0] * k, gy2 = wp[1] - SUN[1] * k;
          const qx = Math.floor(gx2 + ox), qy = Math.floor(gy2 + oy);
          for (let j = 0; j <= 1; j++) for (let m = 0; m <= 1; m++) {
            const xx = qx + m, yy = qy + j;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) shadow[yy * w + xx] = 1;
          }
        }
      }
    }
    /* the outline: an empty pixel beside the body takes a dark rim */
    const OUT = hex(opts.outline || "#0c0a12");
    const edge = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (body[i]) continue;
      if ((x > 0 && body[i - 1]) || (x < w - 1 && body[i + 1]) || (y > 0 && body[i - w]) || (y < h - 1 && body[i + w])) edge[i] = 1;
    }
    for (let i = 0; i < w * h; i++) {
      if (edge[i]) rgba.set([OUT[0], OUT[1], OUT[2], 255], i * 4);
      else if (!body[i] && shadow[i]) rgba.set([0, 0, 0, 92], i * 4);
    }
    return rgba;
  };

  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  P.hex = hex;

  /** The tight box of non-empty pixels in a w x h RGBA buffer: [x, y, w, h], or null. */
  P.trim = (rgba, w, h) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  };

  /* ---- 2D: flat textures for the ground ---- */
  const hash = (x, y, s) => { let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 974634721)) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  P.hash = hash;
  /** Smooth value noise in 0..1 that tiles every `period` pixels. */
  P.noise = (x, y, seed, scale, period) => {
    const gx = x / scale, gy = y / scale, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0, cells = Math.max(1, Math.round(period / scale));
    const g = (i, j) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  /** A ramp colour for 0..1 (0 the lightest), dithered at (x, y). */
  P.pick = (ramp, t, x, y) => { const f = Math.max(0, Math.min(0.9999, t)) * (ramp.length - 1), k = Math.floor(q(f, 256)); return hex(ramp[bay(x, y) < q(f, 256) - k ? k + 1 : k]); };
  P.bay = bay;
})();
