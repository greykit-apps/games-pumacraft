/* PumaCraft -- the sandbox: ?sandbox on the page's address. Not a game mode
 * and not on the menu: the Proving Ground with an army each side, for
 * seeing the engine, the art and the renderer work together while the real
 * skirmish is built. Right-click sends your army; arrows, WASD or the
 * screen's edge scroll; the other side wanders. */
"use strict";
(() => {
  const C = PC.C;
  PC.Sandbox = {
    start() {
      const host = document.getElementById("game-host");
      host.hidden = false;
      PC.View.mount(host);
      const W = PC.Sim.create("proving", [{ faction: "a", team: 0 }, { faction: "a", team: 1 }], 1);
      const def = PC.Map.registry.proving, mine = [[], []];
      const army = [["a_trooper", 14], ["a_engineer", 4], ["a_hornet", 4], ["a_dropship", 2]];
      for (let p = 0; p < 2; p++) {
        let k = 0;
        for (const [key, n] of army) for (let j = 0; j < n; j++, k++) {
          const s = def.starts[p], i = PC.World.spawn(W, PC.Data.type(key).id, p, PC.Map.centre(s.x - 3 + (k % 6)), PC.Map.centre(s.y - 2 + Math.floor(k / 6)));
          if (i >= 0) mine[p].push(PC.World.id(W, i));
        }
      }
      const V = PC.View;
      V.centreOn(def.starts[0].x * C.TILE, def.starts[0].y * C.TILE);
      const keys = Object.create(null);
      addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
      addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
      let mx = -1, my = -1;
      V.canvas.addEventListener("mousemove", e => { const r = V.canvas.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width * V.W; my = (e.clientY - r.top) / r.height * V.H; });
      V.canvas.addEventListener("mouseleave", () => { mx = my = -1; });
      V.canvas.addEventListener("contextmenu", e => {
        e.preventDefault();
        const r = V.canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * V.W + V.camX, y = (e.clientY - r.top) / r.height * V.H + V.camY;
        PC.Orders.issue(W, { t: W.hdr[0] + 1, p: 0, k: C.CMD.MOVE, u: mine[0], x: Math.floor(x * C.ONE), y: Math.floor(y * C.ONE), q: e.shiftKey });
      });
      let wander = 0;
      V.run(W, dt => {
        const sp = dt * 0.5;
        if (keys.arrowleft || keys.a || (mx >= 0 && mx < 6)) V.camX -= sp;
        if (keys.arrowright || keys.d || mx > V.W - 6) V.camX += sp;
        if (keys.arrowup || keys.w || (my >= 0 && my < 6)) V.camY -= sp;
        if (keys.arrowdown || keys.s || my > V.H - 6) V.camY += sp;
        V.camX = Math.round(V.camX); V.camY = Math.round(V.camY); V.clamp();
        if ((wander += dt) > 4000) {
          wander = 0;
          const tx = 8 + (W.hdr[0] * 7) % 48, ty = 8 + (W.hdr[0] * 13) % 48;
          PC.Orders.issue(W, { t: W.hdr[0] + 1, p: 1, k: C.CMD.MOVE, u: mine[1], x: PC.Map.centre(tx), y: PC.Map.centre(ty) });
        }
      });
      PC.Sandbox.W = W;
    },
  };
})();
