/* PumaCraft art -- what belongs to no one: ore veins and vapour vents. Ore
 * is a crust of amber crystal; a vent is a mound of rock with steam
 * rising. World axes, heading 0. */
"use strict";
(() => {
  const { add, box, ball, cyl, cone } = PC.Recipes;

  add("ore", {
    sheet: "neutral", facings: 1, heading: 0, box: [60, 56, 30, 34],
    anims: { idle: { n: 1, fps: 1 } },
    parts() {
      const parts = [ball([0, 0, 1], [22, 10, 2.5], "rock")];
      const spikes = [[-15, -2, 7, 20], [-8, 3, 10, -10], [-2, -3, 12, 8], [5, 2, 9, -18], [12, -1, 8, 14], [17, 3, 6, -8], [-11, -5, 6, 30], [8, -5, 7, -26]];
      for (const [x, y, h, lean] of spikes) parts.push(cone([x, y, h / 2 + 1], [3.2, 2.6, h / 2 + 0.5], "ore", { rot: [0, lean * 0.6, lean] }));
      return parts;
    },
  });

  add("vapour", {
    sheet: "neutral", facings: 1, heading: 0, box: [112, 104, 56, 64],
    anims: { idle: { n: 4, fps: 4 } },
    parts(anim, f) {
      const parts = [
        cyl([0, 0, 3], [40, 20, 3], "rock"),
        cyl([0, 0, 6.5], [28, 13, 1.5], "rock", { shade: -0.4 }),
        cyl([0, 0, 7.5], [14, 6, 1], "gunmetal", { shade: -0.8 }),
        ball([-30, 6, 4], [8, 5, 5], "rock"), ball([26, -6, 5], [9, 6, 6], "rock"),
      ];
      /* steam: small puffs that swell and pale as they rise */
      for (let k = 0; k < 4; k++) {
        const u = ((f + k) % 4) / 4, z = 10 + u * 30, s = 2.2 + u * 3.5;
        parts.push(ball([Math.sin(k * 2.1 + f) * 2 + u * 4, 0, z], [s, s * 0.8, s * 0.7], "steam", { glow: true, step: u < 0.3 ? 2 : u < 0.6 ? 1 : 0 }));
      }
      return parts;
    },
  });
})();
