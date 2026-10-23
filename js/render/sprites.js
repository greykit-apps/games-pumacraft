/* PumaCraft render -- units, from the baked sheets.
 *
 * A unit is drawn from its type's art id: its walk while it moves, its
 * idle otherwise; the facing nearest its heading; and where it stood
 * between the last tick and this one (alpha), so motion is smooth at any
 * frame rate while the simulation ticks 24 times a second. Ground units are
 * drawn first, nearest the top of the screen first, then flyers above them. */
"use strict";
(() => {
  const C = PC.C, F = C.F;
  const Sp = PC.RenderSprites = {};
  const list = [];

  /** The frame of sprite key, animation anim, at time ms, facing heading 0..255. */
  Sp.frame = (key, anim, ms, heading) => {
    const s = PC.ATLAS.sprites[key];
    if (!s) return null;
    const a = s.anims[anim] || s.anims.idle;
    const f = Math.floor(ms / 1000 * a.fps) % a.n, k = a.facings === 1 ? 0 : Math.round(heading * a.facings / 256) % a.facings;
    return { sheet: s.sheet, r: a.f[f * a.facings + k] };
  };

  /** Draws every unit of W inside the view. */
  Sp.draw = (g, W, camX, camY, vw, vh, ox, oy, alpha, ms) => {
    const T = PC.Data.types, fp = C.ONE;
    list.length = 0;
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE)) continue;
      const x = (W.px[i] + (W.x[i] - W.px[i]) * alpha) / fp, y = (W.py[i] + (W.y[i] - W.py[i]) * alpha) / fp;
      if (x < camX - 64 || y < camY - 64 || x > camX + vw + 64 || y > camY + vh + 96) continue;
      list.push([W.flags[i] & F.AIR ? 1 : 0, y, x, i]);
    }
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);
    for (const [, y, x, i] of list) {
      const t = T[W.type[i]], fr = Sp.frame(t.art, W.flags[i] & F.MOVING ? "walk" : "idle", ms + i * 37, W.facing[i]);
      if (!fr || !fr.r || !fr.r[2]) { /* no art yet: a marker */ g.fillStyle = "#ff00ff"; g.fillRect(Math.round(ox + x - camX) - 2, Math.round(oy + y - camY) - 2, 4, 4); continue; }
      const [sx, sy, w, h, ax, ay] = fr.r, sheet = PC.Sheets.sheet(fr.sheet, W.owner[i]);
      g.drawImage(sheet, sx, sy, w, h, Math.round(ox + x - camX - ax), Math.round(oy + y - camY - ay), w, h);
    }
  };
})();
