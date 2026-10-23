/* PumaCraft art -- the Horde's buildings: grown, not built. Mounds of hide
 * over a frame of bone, wet with the Range, a team-coloured scar and the
 * odd watching eye. Authored in world axes like the PDF's.
 *
 * Every building has: idle (it breathes), work (it pulses faster), build
 * (three stages: a swelling, a half-grown mound, the mound with its eyes
 * shut) and death (it bursts). */
"use strict";
(() => {
  const { add, box, ball, cyl, cone } = PC.Recipes;
  const S = PC.Paint.sin, Co = PC.Paint.cos;

  const frameFor = (fw, fh, tall = 48) => { const w = fw * 24 + 24, h = fh * 24 + tall + 24; return [w, h, w >> 1, h - (fh * 12) - 12]; };
  /** a breath: 0..1 over the cycle */
  const breath = (f, n) => (S(f / n * 6.283) + 1) / 2;

  /** Growth from the finished parts, and the burst. */
  function grown(full, fw, fh) {
    const hx = fw * 12 - 3, hy = fh * 12 - 3;
    const pad = ball([0, 0, 0.6], [hx, hy, 1.2], "range", { shade: -0.3 });
    return (anim, f, n) => {
      if (anim === "build") {
        if (f === 0) return [pad, ball([0, 0, 3], [hx * 0.45, hy * 0.45, 5], "flesh")];
        const parts = full("idle", 0, 1).map(p => Object.assign({}, p, p.glow ? { glow: false, ramp: "flesh", step: 3 } : {}));
        if (f === 1) return [pad, ...parts.filter(p => p.ramp !== "bone").map(p => Object.assign({}, p, { at: [p.at[0] * 0.7, p.at[1] * 0.7, p.at[2] * 0.55], size: [p.size[0] * 0.7, p.size[1] * 0.7, p.size[2] * 0.55] }))];
        return [pad, ...parts];
      }
      if (anim === "death") {
        const k = f / (n - 1), parts = [Object.assign({}, pad, { shade: -0.5 })];
        for (let j = 0; j < 7; j++) {
          const a = j * 0.9, rr = hx * (0.3 + (j % 3) * 0.25) * (0.6 + k);
          parts.push(ball([Co(a) * rr, S(a) * rr * 0.7, Math.max(1, 8 - k * 7 + (j % 2) * 2)], [3 + k * 2, 3 + k * 2, Math.max(1, 5 - k * 4)], j % 2 ? "blood" : "flesh", { shade: -0.4 - k * 0.4 }));
        }
        return parts;
      }
      return full(anim, f, n);
    };
  }
  /** a rib of bone arching over a mound, from (x0,y0) up to height h */
  const rib = (x, y, h, lean = 0, s = 1) => cone([x, y, h / 2], [0.9 * s, 0.9 * s, h / 2], "bone", { rot: [lean, 0, 0] });
  const eye = (x, y, z, r = 1.2, open = 1) => ball([x, y, z], [r, r * 0.8, r * 0.7 * open + 0.2], "eye", { glow: open > 0.5, step: 1 });
  const anims = (idle = 4) => ({ idle: { n: idle, fps: 3 }, work: { n: 4, fps: 8 }, build: { n: 3, fps: 1 }, death: { n: 5, fps: 8 } });

  /* ---- the Den: the Horde's town hall, a great hide mound over a burrow ---- */
  add("b_den", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(4, 3, 50),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n) * (anim === "work" ? 1.6 : 1);
      return [
        ball([0, -2, 14 + b], [40, 28, 15 + b], "flesh"),
        ball([-16, -8, 26 + b], [18, 14, 9], "wolf", { shade: -1 }),
        ball([14, -10, 24 + b], [16, 12, 8], "wolf", { shade: -1 }),
        ball([0, 14, 26 + b], [9, 5, 4], "team"),
        ...[-34, -20, 20, 34].map((x, k) => cone([x, -14 + (k % 2) * 6, 30], [1.6, 1.6, 12], "bone", { rot: [-20, x < 0 ? -30 : 30, 0] })),
        cone([0, -18, 38], [2, 2, 12], "bone", { rot: [-25, 0, 0] }),
        /* the burrow's mouth, front centre, and the eyes above it */
        ball([0, 27, 6], [10, 3, 6], "range", { shade: -0.6 }),
        eye(-9, 25, 15, 1.6), eye(9, 25, 15, 1.6),
      ];
    }, 4, 3),
  });

  /* ---- the Vat: a sac sealed over a vapour vent ---- */
  add("b_vat", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(4, 2, 40),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n) * 2;
      return [
        ball([0, 0, 6], [38, 18, 6], "range"),
        ball([0, -2, 14 + b], [22, 13, 11 + b], "flesh"),
        cyl([0, -2, 27 + b], [5, 5, 3], "bone"),
        ball([0, -2, 31 + b], [4, 4, 2], "grass", { glow: true, step: anim === "work" ? f % 2 : 2 }),
        box([0, 10, 18 + b], [8, 0.6, 2], "team"),
        rib(-24, 0, 14, 10), rib(24, 0, 14, 10),
      ];
    }, 4, 2),
  });

  /* ---- the Blood Pool: where runners are whelped ---- */
  add("b_pool", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(3, 2, 36),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n);
      return [
        ball([0, 0, 5], [30, 20, 6], "flesh"),
        ball([0, 0, 9.6], [20, 12, 1.2 + b * 0.6], "blood", { glow: true, step: anim === "work" ? f % 3 : 2 }),
        ...[[-26, -10], [26, -10], [-20, 14], [20, 14]].map(([x, y]) => rib(x, y, 16, y < 0 ? -20 : 20)),
        box([0, -18, 12], [10, 1, 2], "team"),
      ];
    }, 3, 2),
  });

  /* ---- the Gnawing Pit: bones gnawed for the Horde's teeth and hide ---- */
  add("b_evo", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(3, 2, 36),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n) * 1.5;
      return [
        ball([0, 0, 10 + b], [30, 19, 10 + b], "flesh"),
        ball([0, 2, 20 + b], [10, 7, 4], "team"),
        ...[-18, -6, 6, 18].map((x, k) => cone([x, -6 + k * 2, 22 + b], [2, 2, 6 + (k % 2) * 3], "bone", { rot: [0, (k - 1.5) * 12, 0] })),
        eye(0, 18, 10, 1.6, anim === "work" ? 1 : b > 0.5 ? 1 : 0.4),
      ];
    }, 3, 2),
  });

  /* ---- the Quill Nest: spitters' quills grow here ---- */
  add("b_spitpit", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(3, 2, 48),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n);
      const parts = [
        ball([0, 0, 9 + b], [28, 18, 9 + b], "flesh"),
        box([0, 16, 10], [8, 0.6, 2], "team"),
      ];
      for (let k = 0; k < 9; k++) {
        const a = k * 0.698, r = 12 + (k % 3) * 4;
        parts.push(cone([Co(a) * r, S(a) * r * 0.6, 22 + b], [1.4, 1.4, 10 + (k % 2) * 6], "bone", { rot: [S(a) * 25, -Co(a) * 25, 0] }));
      }
      return parts;
    }, 3, 2),
  });

  /* ---- the Roost: a tall spire the harriers hang from ---- */
  add("b_roost", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(2, 2, 64),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n);
      return [
        ball([0, 0, 6], [20, 18, 6], "flesh"),
        cone([0, 0, 26], [9, 9, 24], "wolf"),
        ball([0, 0, 40 + b], [8, 6, 5], "flesh"),
        box([0, 7, 30], [4, 0.6, 3], "team"),
        cone([-10, 0, 40], [1.2, 1.2, 6], "bone", { rot: [0, -60, 0] }), cone([10, 0, 40], [1.2, 1.2, 6], "bone", { rot: [0, 60, 0] }),
        eye(0, 6, 42 + b, 1.2),
      ];
    }, 2, 2),
  });

  /* ---- the Thornwall: a hunched mound that throws its tusks ---- */
  add("b_thorn", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(2, 2, 40),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n);
      return [
        ball([0, 0, 8 + b], [20, 18, 9 + b], "wolf", { shade: -1 }),
        ball([0, 6, 10], [6, 4, 3], "team"),
        cone([-8, 4, 22], [2.4, 2.4, 9], "bone", { rot: [25, -20, 0] }), cone([8, 4, 22], [2.4, 2.4, 9], "bone", { rot: [25, 20, 0] }),
        cone([0, -6, 24], [2.6, 2.6, 10], "bone"),
        eye(-4, 16, 9, 1.1), eye(4, 16, 9, 1.1),
      ];
    }, 2, 2),
  });

  /* ---- the Gland: a swollen bulb that breathes spores and sees the hidden ---- */
  add("b_gland", {
    sheet: "buildings_b", facings: 1, heading: 0, box: frameFor(2, 2, 44),
    anims: anims(),
    parts: grown((anim, f, n) => {
      const b = breath(f, n) * 2;
      return [
        ball([0, 0, 5], [18, 16, 5], "flesh"),
        cyl([0, 0, 12], [4, 4, 6], "flesh", { shade: -0.3 }),
        ball([0, 0, 24 + b], [11 + b, 11 + b, 10 + b], "flesh"),
        ball([0, 0, 33 + b * 1.5], [4, 4, 2], "grass", { glow: true, step: b > 1 ? 0 : 2 }),
        box([0, 10, 22], [4, 0.6, 2], "team"),
        eye(0, 10.5, 27 + b, 1.6),
      ];
    }, 2, 2),
  });
})();
