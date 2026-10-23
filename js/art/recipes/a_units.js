/* PumaCraft art -- faction A's units (the PDF). Pumas in steel and team
 * colour. Sizes are screen pixels; a trooper stands about 14 px. */
"use strict";
(() => {
  const { add, box, ball, cyl, cone, swing } = PC.Recipes;

  /** A puma's head: skull, muzzle, two ears, at height z, nose toward +x. */
  const head = (z, s = 1) => [
    ball([0, 0, z], [1.9 * s, 1.75 * s, 1.7 * s], "tawny"),
    ball([1.5 * s, 0, z - 0.4 * s], [1.05 * s, 0.95 * s, 0.75 * s], "tawny", { shade: 0.3 }),
    cone([-0.2 * s, -1.15 * s, z + 1.5 * s], [0.62 * s, 0.62 * s, 0.85 * s], "tawny"),
    cone([-0.2 * s, 1.15 * s, z + 1.5 * s], [0.62 * s, 0.62 * s, 0.85 * s], "tawny"),
    box([1.25 * s, 0, z + 0.35 * s], [0.35 * s, 1.15 * s, 0.25 * s], "glass", { glow: true, step: 1 }),
  ];

  add("a_trooper", {
    sheet: "units_a", facings: 16, box: [40, 36, 20, 24],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 6, fps: 10 }, attack: { n: 2, fps: 8 }, death: { n: 6, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      if (anim === "death") {
        /* he drops, and lies */
        const k = f / (n - 1), tip = Math.min(1, k * 1.4) * 80, z = Math.max(0.9, 6 - k * 6);
        return [
          box([0, 0, z], [2.2, 2.4, 2.4], "steel", { rot: [0, tip, 0] }),
          ball([0, -2.6, z + 0.6], [1.2, 1.2, 1], "team", { rot: [0, tip, 0] }),
          ball([0, 2.6, z + 0.6], [1.2, 1.2, 1], "team", { rot: [0, tip, 0] }),
          ...head(Math.max(1.6, 10 - k * 9)).map(p => Object.assign(p, { at: [p.at[0] - k * 4, p.at[1], p.at[2]] })),
          box([2 + k, 2.4, 1], [2.6, 0.45, 0.45], "gunmetal", { rot: [10, 0, 0] }),
        ];
      }
      const walking = anim === "walk", stride = walking ? swing(f, n, 1.4) : 0, bob = walking ? Math.abs(swing(f, n, 0.5)) : 0;
      const parts = [
        /* legs, swinging */
        box([stride, -1.25, 2], [1.1, 0.9, 2], "gunmetal"),
        box([-stride, 1.25, 2], [1.1, 0.9, 2], "gunmetal"),
        /* the armoured body and its team-colour shoulder plates */
        box([0, 0, 6.2 + bob], [2.1, 2.4, 2.2], "steel"),
        box([0.6, 0, 5.4 + bob], [1.6, 1.7, 0.6], "gunmetal"),
        ball([0, -2.6, 7.6 + bob], [1.25, 1.25, 1], "team"),
        ball([0, 2.6, 7.6 + bob], [1.25, 1.25, 1], "team"),
        ...head(10.2 + bob),
        /* the rifle, held across */
        box([2.6, 1.7, 6.4 + bob], [2.8, 0.45, 0.45], "gunmetal"),
        box([1.2, 1.7, 5.8 + bob], [0.5, 0.4, 0.8], "gunmetal"),
      ];
      if (anim === "attack" && f === 0) parts.push(ball([5.8, 1.7, 6.4], [1.1, 1, 1], "amber", { glow: true, step: 1 }));
      return parts;
    },
  });
  add("a_engineer", {
    sheet: "units_a", facings: 16, box: [40, 36, 20, 24],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 6, fps: 10 }, work: { n: 4, fps: 12 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      const k = anim === "death" ? f / (n - 1) : 0, z0 = anim === "death" ? -k * 4 : 0;
      const stride = anim === "walk" ? swing(f, n, 1.3) : 0, bob = anim === "walk" ? Math.abs(swing(f, n, 0.4)) : 0;
      const spark = anim === "work" && f % 2 === 0;
      const parts = [
        box([stride, -1.3, 2 + z0], [1.15, 1, 2], "rubber"),
        box([-stride, 1.3, 2 + z0], [1.15, 1, 2], "rubber"),
        /* the work suit, a team stripe across it, the welding pack on its back */
        box([0, 0, 6 + bob + z0], [2.3, 2.6, 2.2], "olive"),
        box([0.2, 0, 6.6 + bob + z0], [2.35, 2.65, 0.55], "team"),
        box([-2.6, 0, 6.8 + bob + z0], [1.1, 2, 2], "gunmetal"),
        cyl([-2.6, -1.1, 9.2 + bob + z0], [0.55, 0.55, 0.9], "amber"),
        ...head(10 + bob + z0, 1),
        /* the torch arm, forward */
        box([2.4, 1.9, 6 + bob + z0], [1.6, 0.5, 0.5], "gunmetal", { rot: [0, anim === "work" ? 20 : 0, 0] }),
      ];
      if (spark) parts.push(ball([4.6, 1.9, 4.6], [0.9, 0.9, 0.9], "glass", { glow: true, step: 0 }));
      if (anim === "death") return parts.map(p => Object.assign(p, { rot: [0, k * 80, 0] }));
      return parts;
    },
  });

  add("a_hornet", {
    sheet: "units_a", facings: 16, box: [56, 44, 28, 28],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 4, fps: 14 }, death: { n: 5, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      if (anim === "death") {
        const k = f / (n - 1);
        return [ball([0, 0, 2], [6 + k * 4, 5 + k * 4, 3 + k * 3], k < 0.5 ? "amber" : "gunmetal", { glow: k < 0.5, step: 1 }), box([-k * 4, k * 3, 1], [4, 1.5, 1], "gunmetal", { rot: [k * 90, 0, 0] })];
      }
      const hum = anim === "walk" ? (f % 2) * 0.3 : 0;
      return [
        /* two fat wheels */
        cyl([5.2, 0, 2.4], [2.4, 2.4, 0.9], "rubber", { rot: [0, 0, 90] }),
        cyl([-5, 0, 2.4], [2.4, 2.4, 1.1], "rubber", { rot: [0, 0, 90] }),
        /* the frame, a team-colour fairing, the engine */
        box([0, 0, 4.4 + hum], [5.6, 1.6, 1.3], "steel"),
        box([3.4, 0, 5.6 + hum], [2.4, 1.9, 1], "team", { rot: [0, -18, 0] }),
        cyl([-1.2, 0, 3.2], [1.6, 1.6, 1.2], "gunmetal", { rot: [0, 0, 90] }),
        box([-5.6, 0, 5.2 + hum], [1.4, 1.2, 0.5], "gunmetal"),
        /* the rider, low */
        box([-0.8, 0, 7 + hum], [1.8, 1.7, 1.6], "steel"),
        ...head(9.4 + hum, 0.9).map(p => Object.assign(p, { at: [p.at[0] + 0.6, p.at[1], p.at[2]] })),
        /* the grenade launcher on the bars */
        box([4.6, 1.6, 6.2 + hum], [2, 0.4, 0.4], "gunmetal"),
        box([6.2, 0, 4.6 + hum], [0.4, 0.7, 0.4], "glass", { glow: true, step: 1 }),
      ];
    },
  });

  add("a_dropship", {
    sheet: "units_a", facings: 16, box: [88, 96, 44, 64],
    anims: { idle: { n: 4, fps: 8 }, walk: { n: 4, fps: 8 }, death: { n: 6, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      const Z = 26 + Math.sin(f / n * 2 * Math.PI) * 1;
      if (anim === "death") {
        const k = f / (n - 1);
        return [ball([0, 0, Z - k * 22], [8 + k * 6, 7 + k * 6, 5 + k * 4], k < 0.6 ? "amber" : "gunmetal", { glow: k < 0.6, step: k < 0.3 ? 0 : 2 })];
      }
      const glow = f % 2 ? 1 : 0;
      return [
        /* the hull, its cockpit glass, a team band */
        ball([0, 0, Z], [11, 5.2, 4.2], "steel"),
        ball([7.2, 0, Z + 1.6], [3.6, 2.8, 2], "glass", { shade: 0.2 }),
        box([-1, 0, Z + 0.4], [5, 5.25, 2.2], "team"),
        box([-9.5, 0, Z + 3], [2.2, 0.6, 3], "steel", { rot: [0, -20, 0] }),
        /* the stub wings and their two turning engines */
        box([-1, 0, Z - 0.6], [3.4, 11, 0.7], "gunmetal"),
        cyl([-1, -11.5, Z - 0.2], [2.2, 2.2, 2.6], "steel"),
        cyl([-1, 11.5, Z - 0.2], [2.2, 2.2, 2.6], "steel"),
        cyl([-1, -11.5, Z - 3], [1.6, 1.6, 0.4], "glass", { glow: true, step: glow }),
        cyl([-1, 11.5, Z - 3], [1.6, 1.6, 0.4], "glass", { glow: true, step: glow }),
      ];
    },
  });
  /** A PDF infantryman: legs, body in `suit`, team plates, the head, and a weapon from weapon(bob). */
  const soldier = (anim, f, n, suit, weapon, extra = []) => {
    if (anim === "death") {
      const k = f / (n - 1), tip = Math.min(1, k * 1.4) * 80, z = Math.max(0.9, 6 - k * 6);
      return [
        box([0, 0, z], [2.2, 2.4, 2.4], suit, { rot: [0, tip, 0] }),
        ball([0, -2.6, z + 0.6], [1.2, 1.2, 1], "team", { rot: [0, tip, 0] }),
        ...head(Math.max(1.6, 10 - k * 9)).map(p => Object.assign(p, { at: [p.at[0] - k * 4, p.at[1], p.at[2]] })),
      ];
    }
    const walking = anim === "walk", stride = walking ? swing(f, n, 1.4) : 0, bob = walking ? Math.abs(swing(f, n, 0.5)) : 0;
    return [
      box([stride, -1.25, 2], [1.1, 0.9, 2], "gunmetal"),
      box([-stride, 1.25, 2], [1.1, 0.9, 2], "gunmetal"),
      box([0, 0, 6.2 + bob], [2.1, 2.4, 2.2], suit),
      ball([0, -2.6, 7.6 + bob], [1.25, 1.25, 1], "team"),
      ball([0, 2.6, 7.6 + bob], [1.25, 1.25, 1], "team"),
      ...head(10.2 + bob),
      ...weapon(bob, anim, f),
      ...extra.map(e => typeof e === "function" ? e(bob, anim, f) : e).flat(),
    ];
  };

  add("a_torcher", {
    sheet: "units_a", facings: 16, box: [44, 38, 22, 25],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 6, fps: 10 }, attack: { n: 3, fps: 12 }, death: { n: 6, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      return soldier(anim, f, n, "gunmetal", (bob, a, fr) => {
        const parts = [
          /* two fuel tanks on the back, the lance under the arm */
          cyl([-2.6, -1, 7.4 + bob], [1, 1, 2.2], "amber"), cyl([-2.6, 1, 7.4 + bob], [1, 1, 2.2], "amber"),
          box([2.4, 1.6, 6 + bob], [2.4, 0.6, 0.6], "steel"),
        ];
        if (a === "attack") for (let k = 0; k < 3; k++) parts.push(ball([5.5 + k * 2.2 + fr, 1.6 + (k - 1) * 0.6 * (fr % 2 ? 1 : -1), 6 + bob], [1.4 + k * 0.6, 1.2 + k * 0.5, 1.1 + k * 0.4], "fire", { glow: true, step: Math.min(4, k + fr % 2) }));
        return parts;
      });
    },
  });

  add("a_corpsman", {
    sheet: "units_a", facings: 16, box: [40, 36, 20, 24],
    anims: { idle: { n: 1, fps: 1 }, walk: { n: 6, fps: 10 }, work: { n: 2, fps: 6 }, death: { n: 6, fps: 10, facings: 1 } },
    parts(anim, f, n) {
      /* pale armour with a teal band, the med pack on the back and a mending wand; no red cross (a protected emblem) */
      return soldier(anim, f, n, "bone", bob => [
        box([0.1, 0, 7.2 + bob], [2.15, 2.45, 0.5], "glass", { glow: true, step: 2 }),
        box([-2.5, 0, 7 + bob], [1, 1.8, 1.8], "steel"),
        box([-2.5, 0, 9.1 + bob], [0.9, 0.5, 0.3], "glass", { glow: true, step: 1 }),
        box([2.2, 1.8, 6.4 + bob], [1.3, 0.4, 0.4], "steel"),
        ...(anim === "work" ? [ball([4.2, 1.8, 6.4 + bob], [1 + f * 0.4, 1 + f * 0.4, 1 + f * 0.4], "glass", { glow: true, step: f })] : []),
      ]);
    },
  });
})();
