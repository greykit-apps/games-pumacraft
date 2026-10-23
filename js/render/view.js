/* PumaCraft render -- the screen, the camera and the frame loop.
 *
 * One 640 x 360 canvas, scaled up by CSS: by a whole number where that
 * fills the window nearly as well as a fraction would (Airborne Puma's
 * rule: whole when at least 2x and within 86% of the fractional fit), else
 * by the fraction, so a pixel is always a crisp square where it can be.
 *
 * The loop runs the simulation at its own rate -- 24 ticks of game time a
 * second, times the speed setting -- however fast the screen refreshes,
 * and draws each frame between the last tick and the next. */
"use strict";
(() => {
  const C = PC.C;
  const V = PC.View = { W: 640, H: 360, camX: 0, camY: 0, speed: 1, running: false };
  /* the play area; the console's HUD claims the rest from Milestone 3 */
  V.view = { x: 0, y: 0, w: 640, h: 360 };

  V.mount = host => {
    const c = V.canvas = document.createElement("canvas");
    c.width = V.W; c.height = V.H; c.className = "pc-screen";
    c.setAttribute("aria-label", "PumaCraft: the battlefield");
    host.appendChild(c);
    V.g = c.getContext("2d");
    V.g.imageSmoothingEnabled = false;
    addEventListener("resize", V.fit);
    V.fit();
  };
  V.fit = () => {
    const s0 = Math.min(innerWidth / V.W, innerHeight / V.H), si = Math.floor(s0), s = si >= 2 && si / s0 > 0.86 ? si : s0;
    V.scale = s;
    V.canvas.style.width = Math.floor(V.W * s) + "px"; V.canvas.style.height = Math.floor(V.H * s) + "px";
  };

  /** Keeps the camera on the map. */
  V.clamp = () => {
    const m = V.W_ ? V.W_.map : null;
    if (!m) return;
    V.camX = Math.max(0, Math.min(m.w * C.TILE - V.view.w, V.camX));
    V.camY = Math.max(0, Math.min(m.h * C.TILE - V.view.h, V.camY));
  };
  V.centreOn = (wx, wy) => { V.camX = Math.round(wx - V.view.w / 2); V.camY = Math.round(wy - V.view.h / 2); V.clamp(); };

  /** Runs world W: steps it, draws it, every frame, until stop(). onFrame(dt) runs first each frame. */
  V.run = (W, onFrame) => {
    V.W_ = W; PC.RenderTerrain.reset(W.map); V.running = true;
    let last = 0, acc = 0;
    const frame = ms => {
      if (!V.running) return;
      const dt = last ? Math.min(250, ms - last) : 0;
      last = ms;
      if (onFrame) onFrame(dt);
      acc += dt * C.TICK * V.speed;
      let steps = 0;
      while (acc >= 1000 && steps < 6) { PC.Sim.step(W); acc -= 1000; steps++; }
      if (steps === 6) acc = 0;   /* too far behind: drop the backlog rather than spiral */
      V.draw(W, acc / 1000, ms);
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
    if (V.over) V.over(g, alpha, ms);
    g.restore();
  };
})();
