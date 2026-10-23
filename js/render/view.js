/* PumaCraft render -- the screen, the camera and the frame loop.
 *
 * One 640 x 360 box holds the canvas and the HUD drawn over it in the DOM;
 * the whole box is scaled up by CSS: by a whole number where that fills
 * the window nearly as well as a fraction would (Airborne Puma's rule:
 * whole when at least 2x and within 86% of the fractional fit), else by
 * the fraction, so a pixel is always a crisp square where it can be.
 *
 * The loop runs the simulation at its own rate -- 24 ticks of game time a
 * second, times the speed setting -- however fast the screen refreshes,
 * and draws each frame between the last tick and the next. onStep runs
 * after every tick (the events of that tick are still there to hear). */
"use strict";
(() => {
  const C = PC.C;
  const V = PC.View = { W: 640, H: 360, camX: 0, camY: 0, speed: 1, running: false, paused: false, scale: 1 };
  /* the play area: below the top strip, above the console */
  V.view = { x: 0, y: 12, w: 640, h: 260 };

  /** Puts the canvas into box (an element sized 640 x 360), which is scaled to the window. */
  V.mount = box => {
    V.box = box;
    const c = V.canvas = document.createElement("canvas");
    c.width = V.W; c.height = V.H; c.className = "pc-screen";
    c.setAttribute("aria-label", "PumaCraft: the battlefield");
    box.prepend(c);
    V.g = c.getContext("2d");
    V.g.imageSmoothingEnabled = false;
    addEventListener("resize", V.fit);
    V.fit();
  };
  V.fit = () => {
    if (!V.box) return;
    const s0 = Math.min(innerWidth / V.W, innerHeight / V.H), si = Math.floor(s0), s = si >= 2 && si / s0 > 0.86 ? si : s0;
    V.scale = s;
    V.box.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  /** Screen pixels of a mouse event, in the box's own 640 x 360. */
  V.local = e => { const r = V.box.getBoundingClientRect(); return [(e.clientX - r.left) / V.scale, (e.clientY - r.top) / V.scale]; };

  /** Keeps the camera on the map. */
  V.clamp = () => {
    const m = V.W_ ? V.W_.map : null;
    if (!m) return;
    V.camX = Math.round(Math.max(0, Math.min(m.w * C.TILE - V.view.w, V.camX)));
    V.camY = Math.round(Math.max(0, Math.min(m.h * C.TILE - V.view.h, V.camY)));
  };
  V.centreOn = (wx, wy) => { V.camX = Math.round(wx - V.view.w / 2); V.camY = Math.round(wy - V.view.h / 2); V.clamp(); };

  /** Runs world W: steps it, draws it, every frame, until stop(). */
  V.run = (W, { onFrame, onStep, onDraw } = {}) => {
    V.W_ = W; PC.RenderTerrain.reset(W.map); V.running = true;
    let last = 0, acc = 0;
    const frame = ms => {
      if (!V.running) return;
      const dt = last ? Math.min(250, ms - last) : 0;
      last = ms;
      if (onFrame) onFrame(dt, ms);
      if (!V.paused) {
        acc += dt * C.TICK * V.speed;
        let steps = 0;
        while (acc >= 1000 && steps < 6) { PC.Sim.step(W); if (onStep) onStep(W); acc -= 1000; steps++; }
        if (steps === 6) acc = 0;   /* too far behind: drop the backlog rather than spiral */
      }
      V.draw(W, V.paused ? 1 : acc / 1000, ms);
      if (onDraw) onDraw(V.g, ms);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  V.stop = () => { V.running = false; };

  V.draw = (W, alpha, ms) => {
    const g = V.g, v = V.view;
    g.fillStyle = "#05070f"; g.fillRect(0, 0, V.W, V.H);
    g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip();
    PC.RenderTerrain.draw(g, V.camX, V.camY, v.w, v.h, v.x, v.y);
    if (V.under) V.under(g, alpha, ms);
    PC.RenderSprites.draw(g, W, V.camX, V.camY, v.w, v.h, v.x, v.y, alpha, ms);
    if (PC.RenderFog) PC.RenderFog.draw(g, W, PC.RenderSprites.me, V.camX, V.camY, v.w, v.h, v.x, v.y);
    if (V.over) V.over(g, alpha, ms);
    g.restore();
  };
})();
