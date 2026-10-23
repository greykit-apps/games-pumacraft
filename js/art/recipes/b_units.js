/* PumaCraft art -- the Horde's units: wolves, grey-furred, red-eyed, with
 * bone and team colour along their spines. */
"use strict";
(() => {
  const { add, box, ball, cyl, cone, swing } = PC.Recipes;
  const S = PC.Paint.sin;

  /** A wolf's head at (x, z), nose toward +x, scale s. */
  const wolfHead = (x, z, s = 1, open = 0) => [
    ball([x, 0, z], [1.9 * s, 1.6 * s, 1.5 * s], "wolf"),
    box([x + 2 * s, 0, z - 0.3 * s - open * 0.3], [1.4 * s, 0.75 * s, 0.55 * s], "wolf", { rot: [0, -8 + open * 10, 0] }),
    ball([x + 3.2 * s, 0, z - 0.1 * s], [0.45 * s, 0.45 * s, 0.4 * s], "rubber"),
    cone([x - 0.4 * s, -1 * s, z + 1.5 * s], [0.6 * s, 0.5 * s, 1 * s], "wolf"), cone([x - 0.4 * s, 1 * s, z + 1.5 * s], [0.6 * s, 0.5 * s, 1 * s], "wolf"),
    ball([x + 1.2 * s, -0.75 * s, z + 0.45 * s], [0.35 * s, 0.35 * s, 0.3 * s], "eye", { glow: true, step: 1 }),
    ball([x + 1.2 * s, 0.75 * s, z + 0.45 * s], [0.35 * s, 0.35 * s, 0.3 * s], "eye", { glow: true, step: 1 }),
  ];
  /** Four legs, trotting: phase f of n, stride a, at height h, body half-length L. */
  const legs = (f, n, a, h, L, w = 1.4) => {
    const out = [], k = n ? swing(f, n, a) : 0;
    for (const [x, y, sgn] of [[L, -w, 1], [L, w, -1], [-L, -w, -1], [-L, w, 1]]) out.push(box([x + k * sgn, y, h / 2], [0.6, 0.6, h / 2], "wolf", { shade: -0.3 }));
    return out;
  };
  const deathOf = (Z, size) => (anim, f, n) => { const k = f / (n - 1); return [ball([0, 0, Math.max(1, Z - k * Z)], [size + k * 2, size * 0.8 + k * 2, Math.max(0.6, size * 0.6 - k * size * 0.4)], k < 0.4 ? "wolf" : "blood", { shade: -k })]; };

  add("b_scav", {
    sheet: "units_b", facings: 16, box: [40, 34, 20, 24],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 4, fps: 10 }, work: { n: 2, fps: 6 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      if (anim === "death") return deathOf(4, 4)(anim, f, n);
      const bob = anim === "walk" ? Math.abs(swing(f, n, 0.4)) : 0, nod = anim === "work" ? f * 0.8 : 0;
      return [
        ...legs(anim === "walk" ? f : 0, anim === "walk" ? n : 0, 1.4, 3, 2.4),
        ball([0, 0, 4.4 + bob], [4, 2.4, 2], "wolf"),
        box([-0.5, 0, 6.1 + bob], [2.6, 0.8, 0.5], "team"),
        cone([1.8, 0, 6.4 + bob], [0.6, 0.6, 1], "bone"), cone([-0.2, 0, 6.6 + bob], [0.6, 0.6, 1.1], "bone"), cone([-2.2, 0, 6.2 + bob], [0.5, 0.5, 0.9], "bone"),
        ...wolfHead(4.6, 4.4 + bob - nod, 0.9, anim === "work" ? f : 0),
      ];
    },
  });

  add("b_runner", {
    sheet: "units_b", facings: 16, box: [36, 30, 18, 22],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 4, fps: 14 }, attack: { n: 2, fps: 12 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      if (anim === "death") return deathOf(3, 3)(anim, f, n);
      const run = anim === "walk", lunge = anim === "attack" ? f * 1.2 : 0;
      return [
        ...legs(run ? f : 0, run ? n : 0, 1.8, 3, 2.2, 1.1),
        ball([lunge, 0, 3.8], [3.4, 1.7, 1.5], "wolf"),
        box([lunge - 0.6, 0, 5.2], [2.8, 0.7, 0.4], "team"),
        box([-3.6 + lunge, 0, 4.4], [1.4, 0.4, 0.4], "wolf", { rot: [0, run ? -20 : 10, 0] }),
        ...wolfHead(3.6 + lunge, 4.2, 0.8, anim === "attack" ? 1 - f : 0),
      ];
    },
  });

  add("b_spitter", {
    sheet: "units_b", facings: 16, box: [40, 40, 20, 28],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 4, fps: 8 }, attack: { n: 2, fps: 10 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      if (anim === "death") return deathOf(6, 4)(anim, f, n);
      const stride = anim === "walk" ? swing(f, n, 1.4) : 0, bob = anim === "walk" ? Math.abs(swing(f, n, 0.4)) : 0;
      const parts = [
        box([stride, -1.4, 2.4], [1.1, 0.9, 2.4], "wolf", { shade: -0.3 }), box([-stride, 1.4, 2.4], [1.1, 0.9, 2.4], "wolf", { shade: -0.3 }),
        ball([0, 0, 7 + bob], [2.6, 2.6, 3], "wolf"),
        box([0.8, 0, 7.4 + bob], [2, 2.2, 1.6], "team"),
        ...[-1.6, 0, 1.6].map((y, k) => cone([-1.8, y, 10 + bob - k * 0.4], [0.6, 0.6, 2.4], "bone", { rot: [0, -35, y * 10] })),
        ...wolfHead(1.4, 11 + bob, 1.05, anim === "attack" ? 1 : 0),
      ];
      if (anim === "attack" && f === 0) parts.push(ball([5.4, 0, 10.6], [1.2, 1, 1], "grass", { glow: true, step: 0 }));
      return parts;
    },
  });

  add("b_alpha", {
    sheet: "units_b", facings: 16, box: [80, 96, 40, 66],
    anims: { idle: { n: 4, fps: 4 }, walk: { n: 4, fps: 4 }, death: { n: 6, fps: 8, facings: 1 } },
    parts(anim, f, n) {
      const Z = 30 + S(f / 4 * 6.283) * 1.2;
      if (anim === "death") return deathOf(30, 10)(anim, f, n);
      const parts = [
        ball([0, 0, Z], [11, 9, 7.5], "flesh"),
        ball([-1, 0, Z + 5.2], [7, 6, 2.6], "team"),
        ...wolfHead(10.4, Z - 1, 1.6),
      ];
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.7, sw = S(f / 4 * 6.283 + k) * 0.6;
        parts.push(box([PC.Paint.cos(a) * 6 + sw, PC.Paint.sin(a) * 5, Z - 9], [0.6, 0.6, 3.2], "flesh", { shade: -0.4 })); }
      return parts;
    },
  });

  add("b_harrier", {
    sheet: "units_b", facings: 16, box: [60, 70, 30, 48],
    anims: { idle: { n: 4, fps: 10 }, walk: { n: 4, fps: 10 }, attack: { n: 2, fps: 10 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      const Z = 22;
      if (anim === "death") return deathOf(22, 5)(anim, f, n);
      const flap = (anim === "attack" ? 1 : f % 4 < 2 ? 1 : -1) * 28;
      const parts = [
        ball([0, 0, Z], [5, 2.2, 2], "wolf"),
        box([-0.5, 0, Z + 1.8], [3.6, 0.6, 0.4], "team"),
        box([0, -6, Z + 1], [3, 5.2, 0.3], "flesh", { rot: [-flap, 0, 0] }), box([0, 6, Z + 1], [3, 5.2, 0.3], "flesh", { rot: [flap, 0, 0] }),
        box([-6, 0, Z], [2.4, 0.5, 0.4], "wolf"),
        ...wolfHead(5.4, Z + 0.4, 0.85, anim === "attack" ? 1 : 0),
      ];
      if (anim === "attack" && f === 0) parts.push(cone([9, 0, Z], [0.8, 0.8, 1.6], "bone", { rot: [0, 90, 0] }));
      return parts;
    },
  });

  add("b_egg", {
    sheet: "units_b", facings: 1, heading: 0, box: [32, 32, 16, 22],
    anims: { idle: { n: 4, fps: 4 }, walk: { n: 1, fps: 1 }, death: { n: 4, fps: 10 } },
    parts(anim, f, n) {
      if (anim === "death") { const k = f / (n - 1); return [ball([0, 0, 1], [5 + k * 3, 4 + k * 3, 1.4 - k * 0.8], "blood"), ball([2 - k * 3, 1, 2], [2, 2, 1.4 - k], "flesh")]; }
      const p = 1 + (anim === "idle" ? S(f / 4 * 6.283) * 0.06 : 0);
      return [
        ball([0, 0, 4.6], [4.4 * p, 3.8 * p, 4.6 * p], "flesh"),
        box([0, 0, 5], [4.5 * p, 0.3, 3.6], "blood", { shade: -0.4 }),
        box([0, 0, 5], [0.3, 3.9 * p, 3.6], "blood", { shade: -0.4 }),
        ball([0, 0, 8.6 * p], [1.2, 1.2, 0.6], "team"),
      ];
    },
  });
})();
