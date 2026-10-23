/* PumaCraft data -- how the computer plays faction A.
 *
 * The build: steps in order, each taken when the bot's supply reaches `at`
 * and it can pay. `build` puts up a building near its base (a refinery on
 * its vent); `expand` puts a command post at its nearest free base site.
 * After the list runs out the bot keeps its supply ahead, its factories
 * busy, and puts spare money into the buildings in `more`.
 *
 * The army: what each factory trains, in what proportion; how big the
 * first wave is, and how much bigger each one after (in supply), by
 * difficulty. */
"use strict";
PC.Data.ai("a", {
  build: [
    { at: 9, build: "a_depot" },
    { at: 11, build: "a_barracks" },
    { at: 12, build: "a_refinery" },
    { at: 14, build: "a_barracks" },
    { at: 16, build: "a_depot" },
    { at: 18, build: "a_academy" },
    { at: 20, build: "a_garage" },
    { at: 22, build: "a_depot" },
    { at: 24, build: "a_drillhall" },
    { at: 26, expand: true },
    { at: 28, build: "a_barracks" },
    { at: 30, build: "a_depot" },
    { at: 34, build: "a_garage" },
    { at: 36, build: "a_refinery" },
    { at: 38, build: "a_armory" },
  ],
  /* when the build is done and money piles up: more of these, to these many */
  more: [["a_barracks", 5], ["a_garage", 3], ["a_depot", 12]],
  /* what to research, in order, as soon as it can be paid for */
  research: ["a_stim", "a_siege", "a_inf_weapons", "a_veh_weapons", "a_inf_armor", "a_inf_weapons", "a_veh_plating", "a_inf_armor", "a_inf_weapons", "a_veh_weapons", "a_inf_armor"],
  train: { a_barracks: ["a_trooper", "a_trooper", "a_torcher", "a_trooper", "a_corpsman"], a_garage: ["a_howitzer", "a_hornet", "a_strider", "a_howitzer", "a_hornet"] },
  workers: "a_engineer",
  waves: { easy: [12, 6], normal: [18, 8], hard: [24, 10] },
});
