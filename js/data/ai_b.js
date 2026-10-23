/* PumaCraft data -- how the computer plays the Horde. As js/data/ai_a.js;
 * its supply comes from Alphas, which it hatches rather than builds, and
 * since a Den's larvae, not its money, are what limit it, its first
 * building is a second Den, at its natural, and more come after. */
"use strict";
PC.Data.ai("b", {
  build: [
    { at: 9, expand: true },
    { at: 10, build: "b_pool" },
    { at: 11, build: "b_vat" },
    { at: 16, build: "b_spitpit" },
    { at: 18, build: "b_den" },
    { at: 20, build: "b_evo" },
    { at: 22, build: "b_thorn" },
    { at: 24, build: "b_den" },
    { at: 28, build: "b_roost" },
    { at: 30, build: "b_gland" },
    { at: 34, expand: true },
    { at: 40, build: "b_vat" },
  ],
  more: [["b_den", 7], ["b_thorn", 3]],
  research: ["b_haste", "b_missile", "b_spit_speed", "b_melee", "b_carapace", "b_missile", "b_flyer_atk", "b_melee", "b_carapace", "b_missile", "b_melee", "b_carapace"],
  train: { b_den: ["b_runner", "b_spitter", "b_runner", "b_spitter", "b_harrier"] },
  workers: "b_scav",
  waves: { easy: [12, 6], normal: [16, 8], hard: [24, 10] },
});
