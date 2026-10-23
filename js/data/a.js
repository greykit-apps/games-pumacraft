/* PumaCraft data -- faction A: the Pumacity Defense Force, Reach Expeditionary
 * Corps (working name, pending approval). Adaptable and mechanised: workers
 * who build, infantry, bikes and walkers, buildings that lift off.
 *
 * Numbers are in the original's measures (see js/engine/data.js): hp whole
 * points, speed in original pixels a tick, r the unit's half-width in
 * original pixels, sight in tiles. This file grows to the whole roster in
 * Milestone 5; for now it holds what the movement core needs to be tested
 * against: a worker, foot, a fast bike and a flyer. */
"use strict";
PC.Data.faction("a", {
  name: "Pumacity Defense Force", short: "PDF",
  units: {
    a_engineer: { name: "Engineer", hp: 60, armor: 0, size: "small", speed: 4.92, r: 11, sight: 7, supply: 1, cost: [50, 0], buildTicks: 300, worker: true, hotkey: "E" },
    a_trooper: { name: "Trooper", hp: 40, armor: 0, size: "small", speed: 4, r: 8, sight: 7, supply: 1, cost: [50, 0], buildTicks: 360, hotkey: "T" },
    a_hornet: { name: "Hornet", hp: 80, armor: 0, size: "medium", speed: 6.4, r: 16, sight: 8, supply: 2, cost: [75, 0], buildTicks: 450, hotkey: "H" },
    a_dropship: { name: "Pelican", hp: 150, armor: 1, size: "large", speed: 5.47, r: 24, sight: 8, supply: 2, cost: [100, 100], buildTicks: 750, air: true, hotkey: "P" },
  },
});
