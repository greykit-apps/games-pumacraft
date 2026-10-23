/* PumaCraft art -- faction A's buildings (the PDF): prefabricated steel,
 * team-colour bands, cyan glass, landing lights. Authored in world axes
 * (x right, y toward the viewer); heading 0 keeps them so.
 *
 * Every building has: idle (its lights), work (while it trains or
 * refines), build (three stages: the frame, the walls going up, finished
 * but dark) and death. */
"use strict";
(() => {
  const { add, box, ball, cyl, cone } = PC.Recipes;

  /** The box a footprint of fw x fh tiles paints in, and its ground centre. */
  const frameFor = (fw, fh, tall = 48) => { const w = fw * 24 + 24, h = fh * 24 + tall + 24; return [w, h, w >> 1, h - (fh * 12) - 12]; };

  /** Three-stage construction from the finished parts: girders, then the walls
   * half up, then the whole thing with its lights out. */
  function building(full, fw, fh) {
    const hx = fw * 12 - 3, hy = fh * 12 - 3;
    const girders = [];
    for (const [x, y] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy], [0, -hy], [0, hy]]) girders.push(box([x, y, 8], [0.8, 0.8, 8], "gunmetal"));
    girders.push(box([0, -hy, 16], [hx, 0.7, 0.7], "gunmetal"), box([0, hy, 16], [hx, 0.7, 0.7], "gunmetal"));
    const slab = box([0, 0, 0.8], [hx + 2, hy + 2, 0.8], "rock");
    return (anim, f, n) => {
      if (anim === "build") {
        if (f === 0) return [slab, ...girders];
        const parts = full("idle", 0, 1).map(p => Object.assign({}, p, p.glow ? { glow: false, ramp: "gunmetal" } : {}));
        if (f === 1) return [slab, ...girders, ...parts.map(p => Object.assign({}, p, { at: [p.at[0], p.at[1], p.at[2] * 0.5], size: [p.size[0], p.size[1], p.size[2] * 0.5] }))];
        return [slab, ...parts];
      }
      if (anim === "death") {
        const k = f / (n - 1), parts = [slab];
        for (let j = 0; j < 6; j++) {
          const a = j * 1.05, rr = (hx * 0.6) * (0.4 + (j % 3) * 0.3);
          parts.push(ball([PC.Paint.cos(a) * rr, PC.Paint.sin(a) * rr * 0.7, 6 + k * 10 + j], [6 + k * 6, 6 + k * 6, 5 + k * 5], k < 0.5 ? "fire" : "smoke", { glow: k < 0.5, step: Math.floor(k * 4) }));
        }
        return parts;
      }
      return full(anim, f, n);
    };
  }

  /* ---- the Command Post: the PDF's town hall ---- */
  add("a_command", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 56),
    anims: { idle: { n: 2, fps: 2 }, work: { n: 4, fps: 8 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => {
      const lit = anim === "work" ? f % 2 : f;
      return [
        /* the main hall, its landing apron and the team bands */
        box([0, 2, 7], [42, 26, 7], "steel"),
        box([0, 2, 14.4], [43, 27, 0.6], "gunmetal"),
        box([0, 29, 1.2], [44, 6, 1.2], "gunmetal"),
        box([-30, 29, 2.6], [8, 3, 0.3], "team"), box([30, 29, 2.6], [8, 3, 0.3], "team"),
        box([0, 28.6, 9], [42, 0.4, 2], "team"),
        /* the tower, its windows, the radar */
        box([-18, -10, 22], [14, 12, 8], "steel"),
        box([-18, 2.2, 24], [12, 0.5, 2.2], "glass", { glow: true, step: lit ? 0 : 1 }),
        cyl([-18, -10, 31.5], [3, 3, 1.5], "gunmetal"),
        ball([-18, -10, 34], [6, 6, 2.5], "steel", { rot: [0, 25, 0] }),
        box([10, -12, 20], [1, 1, 6], "gunmetal"), ball([10, -12, 26.5], [1.3, 1.3, 1.3], "red", { glow: true, step: lit ? 1 : 3 }),
        /* the hangar door, front right, with its light */
        box([18, 27.9, 6], [14, 0.6, 5], "gunmetal"),
        box([18, 28.4, 11.6], [14, 0.4, 0.6], "amber", { glow: true, step: anim === "work" ? 0 : 2 }),
      ];
    }, 4, 3),
  });

  /* ---- the Supply Depot: stores and power cells for a growing force ---- */
  add("a_depot", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(3, 2, 40),
    anims: { idle: { n: 2, fps: 1 }, work: { n: 1, fps: 1 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 5], [31, 18, 5], "gunmetal"),
      cyl([-16, 0, 13], [9, 9, 4], "steel"), cyl([6, 0, 12], [8, 8, 3], "steel"),
      box([-16, 0, 17.4], [9, 2, 0.5], "team"),
      box([22, 10, 11], [6, 6, 2], "steel"),
      ball([22, 10, 14], [2, 2, 1.4], "glass", { glow: true, step: f ? 0 : 2 }),
    ], 3, 2),
  });

  /* ---- the Refinery: over a vapour vent ---- */
  add("a_refinery", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 2, 64),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 4, fps: 8 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => {
      const parts = [
        box([0, 2, 4], [42, 18, 4], "gunmetal"),
        cyl([-24, 2, 13], [10, 10, 9], "steel"), cyl([-2, 2, 11], [8, 8, 7], "steel"),
        box([-24, 2, 22.4], [10.3, 3, 0.5], "team"),
        box([18, 2, 10], [12, 9, 6], "steel"),
        cyl([30, -6, 22], [3, 3, 12], "gunmetal"),
        box([8, 2, 15], [12, 1, 1], "gunmetal"),
      ];
      if (anim === "work") parts.push(ball([30 + f, -6, 37 + f * 3], [3 + f, 3 + f, 2.5 + f], "steam", { glow: true, step: Math.min(4, f + 1) }));
      return parts;
    }, 4, 2),
  });

  /* ---- the Barracks: a long hangar of a building ---- */
  add("a_barracks", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 48),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 0, 8], [42, 28, 8], "steel"),
      cyl([0, 0, 16], [26, 26, 41], "steel", { rot: [0, 90, 0] }),
      box([0, 0, 16.5], [42.5, 9, 1], "team"),
      box([0, 27.9, 7], [12, 0.6, 7], "gunmetal"),
      box([0, 28.4, 14.6], [12, 0.4, 0.6], "amber", { glow: true, step: anim === "work" ? f % 2 : 2 }),
      box([-28, 28.3, 10], [6, 0.3, 1.5], "glass", { glow: true, step: 1 }), box([28, 28.3, 10], [6, 0.3, 1.5], "glass", { glow: true, step: 1 }),
      box([34, -20, 26], [0.7, 0.7, 10], "gunmetal"), box([36.5, -20, 33], [3, 0.3, 2], "team"),
    ], 4, 3),
  });

  /* ---- the Motor Pool: where bikes and craft are put together ---- */
  add("a_garage", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 56),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => {
      const swing = anim === "work" ? (f - 1.5) * 8 : 0;
      return [
        box([0, 2, 9], [42, 26, 9], "gunmetal"),
        box([-12, -6, 21], [28, 16, 3], "steel"),
        box([0, 28.3, 8], [18, 0.6, 7], "rubber"),
        box([0, 28.8, 16], [18, 0.4, 0.8], "team"),
        box([30, 0, 24], [6, 6, 6], "steel"),
        box([30 - 10, swing * 0.3, 32], [16, 1.2, 1.2], "amber", { rot: [swing, 0, 0] }),
        box([30 - 24, swing * 0.6, 26], [0.5, 0.5, 6], "gunmetal"),
        box([-30, 28.4, 14], [6, 0.3, 2], "glass", { glow: true, step: anim === "work" ? f % 2 : 1 }),
      ];
    }, 4, 3),
  });
  /* ---- the Academy: where the PDF's officers are made, and its field medicine ---- */
  add("a_academy", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(3, 2, 48),
    anims: { idle: { n: 2, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 6], [31, 18, 6], "steel"),
      box([0, 2, 12.4], [32, 19, 0.5], "gunmetal"),
      cyl([-14, 0, 17], [8, 8, 5], "bone"),
      cone([-14, 0, 25], [8.5, 8.5, 3], "gunmetal"),
      box([10, 19.6, 6], [14, 0.4, 3], "glass", { glow: true, step: anim === "work" ? f % 2 : 1 }),
      box([-14, 8.2, 17], [6, 0.3, 1], "team"),
      box([20, -8, 18], [0.6, 0.6, 7], "gunmetal"), box([22.5, -8, 23], [2.5, 0.3, 1.5], "team"),
    ], 3, 2),
  });

  /* ---- the Drill Hall: arms and armour for the infantry ---- */
  add("a_drillhall", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 52),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 8], [42, 26, 8], "gunmetal"),
      box([-10, -4, 19], [26, 16, 3], "steel"),
      box([24, 10, 20], [10, 10, 4], "steel"),
      box([0, 28.3, 7], [26, 0.5, 5], "rubber"),
      box([0, 28.8, 13], [26, 0.4, 0.8], "team"),
      cyl([24, 10, 26], [4, 4, 2], "amber", { glow: anim === "work", step: f % 2 ? 1 : 2 }),
      box([-30, 28.4, 9], [6, 0.3, 2.5], "glass", { glow: true, step: 1 }),
    ], 4, 3),
  });
  /* ---- the Ordnance Works: guns and plate for the vehicles ---- */
  add("a_armory", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(3, 2, 48),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 6], [31, 18, 6], "gunmetal"),
      box([-8, -2, 15], [20, 12, 3], "steel"),
      cyl([18, 4, 15], [6, 6, 3], "steel"),
      box([18, 4, 19], [7, 1, 1], "gunmetal", { rot: [anim === "work" ? f * 22 : 0, 0, 0] }),
      box([0, 20.3, 6], [14, 0.4, 4], "rubber"), box([0, 20.6, 11], [14, 0.3, 0.6], "team"),
      cyl([-24, 10, 14], [2, 2, 4], "gunmetal"), ball([-24, 10, 19], [2, 2, 1.4], "fire", { glow: anim === "work", step: f % 2 ? 2 : 3 }),
    ], 3, 2),
  });
  /* ---- the Airfield: a landing deck, a control mast ---- */
  add("a_airfield", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 56),
    anims: { idle: { n: 2, fps: 2 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 5], [42, 26, 5], "gunmetal"),
      box([4, 4, 10.4], [30, 20, 0.4], "rock"),
      box([4, 4, 10.9], [26, 1, 0.2], "amber", { glow: true, step: anim === "work" ? f % 2 : 2 }),
      box([4, 4, 10.9], [1, 16, 0.2], "amber", { glow: true, step: anim === "work" ? (f + 1) % 2 : 2 }),
      box([-32, -10, 18], [6, 6, 13], "steel"),
      box([-32, -3.8, 26], [5, 0.3, 2], "glass", { glow: true, step: f % 2 }),
      box([-32, -10, 31.6], [6.3, 6.3, 0.6], "team"),
      box([34, 22, 13], [0.6, 0.6, 3], "red", { glow: true, step: f % 2 ? 1 : 3 }),
    ], 4, 3),
  });

  /* ---- the Science Lab: domes and an array ---- */
  add("a_lab", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(4, 3, 60),
    anims: { idle: { n: 2, fps: 1 }, work: { n: 4, fps: 6 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 2, 6], [42, 26, 6], "steel"),
      ball([-14, 0, 12], [13, 13, 11], "bone"),
      ball([16, 6, 12], [9, 9, 7], "bone"),
      box([-14, 0, 23.4], [6, 6, 0.6], "team"),
      cyl([20, -14, 18], [1, 1, 7], "gunmetal"),
      ball([20, -14, 27], [5, 5, 1.2], "steel", { rot: [0, anim === "work" ? 20 + f * 10 : 30, 0] }),
      box([0, 28.3, 6], [12, 0.4, 3], "glass", { glow: true, step: f % 2 }),
    ], 4, 3),
  });

  /* ---- the Missile Tower: anti-air, and eyes for the unseen ---- */
  add("a_tower", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(2, 2, 60),
    anims: { idle: { n: 2, fps: 2 }, work: { n: 1, fps: 1 }, attack: { n: 2, fps: 8 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building((anim, f) => [
      box([0, 0, 2], [20, 20, 2], "gunmetal"),
      cyl([0, 0, 12], [6, 6, 10], "steel"),
      box([0, 0, 22], [8, 8, 1], "team"),
      box([0, -4, 26], [6, 2, 3], "steel"), box([0, 4, 26], [6, 2, 3], "steel"),
      box([5, -4, 26], [1, 1.5, 2], "red", { glow: true, step: f % 2 ? 1 : 3 }), box([5, 4, 26], [1, 1.5, 2], "red", { glow: true, step: f % 2 ? 3 : 1 }),
      cyl([0, 0, 30], [0.5, 0.5, 2], "gunmetal"), ball([0, 0, 33], [1.6, 1.6, 0.8], "glass", { glow: true, step: f % 2 }),
    ], 2, 2),
  });
  /* ---- the Bunker: sandbagged concrete, firing slits, room for four ---- */
  add("a_bunker", {
    sheet: "buildings_a", facings: 1, heading: 0, box: frameFor(3, 2, 36),
    anims: { idle: { n: 1, fps: 1 }, work: { n: 1, fps: 1 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } },
    parts: building(() => [
      box([0, 0, 5], [30, 18, 5], "rock"),
      box([0, 0, 10.6], [26, 14, 1.2], "gunmetal"),
      box([0, 18.3, 7], [20, 0.4, 0.9], "rubber"), box([-31, 0, 7], [0.4, 10, 0.9], "rubber"), box([31, 0, 7], [0.4, 10, 0.9], "rubber"),
      box([0, 0, 12.2], [8, 6, 0.4], "team"),
      ball([-24, 17, 2], [5, 3, 2], "olive"), ball([-14, 18, 2], [5, 3, 2], "olive"), ball([14, 18, 2], [5, 3, 2], "olive"), ball([24, 17, 2], [5, 3, 2], "olive"),
    ], 3, 2),
  });
})();
