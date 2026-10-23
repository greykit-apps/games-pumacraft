/* PumaCraft render -- units, buildings and resources, from the baked sheets.
 *
 * A unit is drawn from its type's art id: its walk while it moves, its
 * idle otherwise; the facing nearest its heading; and where it stood
 * between the last tick and this one (alpha), so motion is smooth at any
 * frame rate while the simulation ticks 24 times a second. A building
 * shows the stage of its construction, its work while it trains, and its
 * idle otherwise.
 *
 * The viewer's fog decides what is drawn: their own and their allies'
 * everything; an enemy only where the viewer sees it now; resources once
 * explored. Ground things go first, nearest the top of the screen first,
 * then flyers above them. Selection rings go under, health bars over. */
"use strict";
(() => {
  const C = PC.C, F = C.F;
  const Sp = PC.RenderSprites = { me: 0, selected: null };
  const list = [];

  /** The frame of sprite key, animation anim, at time ms (or frame index fi), facing heading 0..255. */
  Sp.frame = (key, anim, ms, heading, fi) => {
    const s = PC.ATLAS.sprites[key];
    if (!s) return null;
    const a = s.anims[anim] || s.anims.idle;
    const f = fi !== undefined ? Math.min(a.n - 1, fi) : Math.floor(ms / 1000 * a.fps) % a.n, k = a.facings === 1 ? 0 : Math.round(heading * a.facings / 256) % a.facings;
    return { sheet: s.sheet, r: a.f[f * a.facings + k] };
  };

  /** Whether the viewer should see slot i now. */
  Sp.shown = (W, i) => {
    const p = W.owner[i], me = Sp.me;
    if (me < 0 || p === me) return true;
    if (p >= C.MAX_PLAYERS) { const t = PC.Map.tileAt(W.map, W.x[i], W.y[i]); return t >= 0 && (W.explored[t] & (1 << me)) !== 0; }
    const a = W.players[p], b = W.players[me];
    if (a && b && a.team === b.team) return true;
    return PC.Vision.seesUnit(W, me, i);
  };

  const pos = (W, i, alpha) => [(W.px[i] + (W.x[i] - W.px[i]) * alpha) / C.ONE, (W.py[i] + (W.y[i] - W.py[i]) * alpha) / C.ONE];
  Sp.pos = pos;

  /** Draws everything of W inside the view. */
  Sp.draw = (g, W, camX, camY, vw, vh, ox, oy, alpha, ms) => {
    const T = PC.Data.types;
    list.length = 0;
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE) || !Sp.shown(W, i)) continue;
      const [x, y] = pos(W, i, alpha);
      if (x < camX - 96 || y < camY - 64 || x > camX + vw + 96 || y > camY + vh + 128) continue;
      list.push([W.flags[i] & F.AIR ? 1 : 0, y, x, i]);
    }
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);
    const sel = Sp.selected;
    /* rings under the selected */
    if (sel) for (const [, y, x, i] of list) if (sel.has(i)) ring(g, W, i, ox + x - camX, oy + y - camY);
    for (const [, y, x, i] of list) {
      const t = T[W.type[i]], fl = W.flags[i];
      let fr;
      if (fl & F.BUILDING) {
        if (fl & F.UNDER_CONSTRUCTION) fr = Sp.frame(t.art, "build", 0, 0, Math.min(2, Math.floor(W.prog[i] * 3 / Math.max(1, t.buildTicks))));
        else fr = Sp.frame(t.art, W.qLen[i] ? "work" : "idle", ms + i * 53, 0);
      } else if (fl & F.RESOURCE) fr = Sp.frame(t.art, "idle", ms + i * 211, 0);
      else if (W.mode[i]) {
        /* a gun digging in, dug in, or packing up */
        const dep = t.siege ? t.siege.deploy : 1;
        if (W.mode[i] === 1) fr = Sp.frame(t.art, "siege", 0, W.facing[i], W.cd[i] > PC.Combat.weapons(W, i)[0].cd - 4 ? 1 : 0);
        else { const k = 1 - W.modeT[i] / dep, f3 = Math.min(2, Math.floor((W.mode[i] === 2 ? k : 1 - k) * 3)); fr = Sp.frame(t.art, "deploy", 0, W.facing[i], f3); }
      } else {
        const kind = PC.Orders.headKind(W, i);
        const anim = (fl & F.MOVING) ? "walk" : (W.cd[i] > PC.Data.types[W.type[i]].weapons.reduce((m, w) => Math.max(m, w.cd), 0) - 3 && W.target[i]) ? "attack" : kind === C.ORD.CONSTRUCT || (kind === C.ORD.GATHER && W.prog[i] > 0) ? "work" : "idle";
        fr = Sp.frame(t.art, anim, ms + i * 37, W.facing[i]);
      }
      const sx = Math.round(ox + x - camX), sy = Math.round(oy + y - camY);
      if (!fr || !fr.r || !fr.r[2]) { g.fillStyle = "#ff00ff"; g.fillRect(sx - 2, sy - 2, 4, 4); continue; }
      const [fx, fy, w, h, ax, ay] = fr.r, sheet = PC.Sheets.sheet(fr.sheet, W.owner[i]);
      /* cloaked: a ghost of itself, to its owner and to whoever detects it */
      if (fl & F.CLOAKED) g.globalAlpha = 0.4;
      g.drawImage(sheet, fx, fy, w, h, sx - ax, sy - ay, w, h);
      if (W.matrix[i]) { g.strokeStyle = "rgba(84,242,255,.7)"; g.beginPath(); g.ellipse(sx + 0.5, sy - h / 3 + 0.5, w / 2 + 1, h / 2 + 1, 0, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
    }
    /* health bars over the selected and the hurt */
    for (const [, y, x, i] of list) {
      const t = T[W.type[i]];
      if (W.flags[i] & F.RESOURCE) continue;
      if ((sel && sel.has(i)) || W.hp[i] < t.hp) bar(g, W, i, t, ox + x - camX, oy + y - camY, sel && sel.has(i));
    }
  };

  const ringColour = (W, i) => {
    const p = W.owner[i], me = Sp.me;
    if (p === me) return "#4ade6a";
    if (p >= C.MAX_PLAYERS) return "#ffb000";
    const a = W.players[p], b = W.players[me];
    return a && b && a.team === b.team ? "#ffe040" : "#ff5266";
  };
  function ring(g, W, i, x, y) {
    const t = PC.Data.types[W.type[i]], air = W.flags[i] & F.AIR;
    let rx, ry;
    if (t.foot) { rx = t.foot[0] * 12 + 2; ry = t.foot[1] * 12 + 2; }
    else { rx = Math.max(5, t.r / C.ONE + 2); ry = Math.max(3, rx * 0.6); }
    g.strokeStyle = ringColour(W, i); g.lineWidth = 1;
    g.beginPath(); g.ellipse(Math.round(x) + 0.5, Math.round(y + (air ? 8 : 0)) + 0.5, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  }
  function bar(g, W, i, t, x, y, selected) {
    const w = t.foot ? t.foot[0] * 12 : Math.max(12, Math.round(t.r / C.ONE * 2.4)), h = 2;
    const top = t.foot ? y - t.foot[1] * 12 - 18 : y - (W.flags[i] & F.AIR ? 36 : 18) - Math.round(t.r / C.ONE);
    const bx = Math.round(x - w / 2), by = Math.round(top), k = Math.max(0, W.hp[i]) / t.hp;
    g.fillStyle = "#0c0a12"; g.fillRect(bx - 1, by - 1, w + 2, h + 2);
    g.fillStyle = k > 0.66 ? "#4ade6a" : k > 0.33 ? "#ffb000" : "#ff5266";
    g.fillRect(bx, by, Math.max(1, Math.round(w * k)), h);
    if ((W.flags[i] & F.UNDER_CONSTRUCTION) && selected) {
      g.fillStyle = "#54f2ff"; g.fillRect(bx, by + h + 1, Math.round(w * W.prog[i] / Math.max(1, t.buildTicks)), 1);
    }
  }
})();
