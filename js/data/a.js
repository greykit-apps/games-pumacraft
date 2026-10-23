/* PumaCraft data -- faction A: the Pumacity Defense Force, Reach Expeditionary
 * Corps (working name, pending approval). Adaptable and mechanised: workers
 * who build, infantry, bikes and walkers, buildings that lift off.
 *
 * Numbers are in the original's measures (see js/engine/data.js): hp whole
 * points, speed in original pixels a tick, r the unit's half-width in
 * original pixels, sight and acquire in tiles, weapon range in original
 * pixels (32 a tile), cooldown and build times in ticks (24 a second). They
 * follow the balance of the game this one is in the manner of; names and
 * everything seen and heard are PumaCraft's own.
 *
 * This file grows to the whole roster in Milestone 5. */
"use strict";
PC.Data.faction("a", {
  name: "Pumacity Defense Force", short: "PDF",
  units: {
    a_engineer: { name: "Engineer", hp: 60, armor: 0, size: "small", speed: 4.92, r: 11, sight: 7, supply: 1, cost: [50, 0], buildTicks: 300, worker: true, hotkey: "E",
      bio: true, mine: 75, carry: 8, builds: ["a_command", "a_depot", "a_refinery", "a_barracks", "a_drillhall", "a_academy", "a_garage"],
      weapons: [{ name: "Cutting torch", dmg: 5, type: "normal", range: 10, cd: 15 }] },
    a_trooper: { name: "Trooper", hp: 40, armor: 0, size: "small", speed: 4, r: 8, sight: 7, supply: 1, cost: [50, 0], buildTicks: 360, hotkey: "T", acquire: 5,
      bio: true, abilities: ["stim"], armorUpgrade: "a_inf_armor",
      weapons: [{ name: "Carbine", dmg: 6, type: "normal", range: 128, cd: 15, air: true, upg: 1, upgrade: "a_inf_weapons" }] },
    a_torcher: { name: "Torcher", hp: 50, armor: 1, size: "small", speed: 4, r: 8, sight: 7, supply: 1, cost: [50, 25], buildTicks: 360, hotkey: "F", acquire: 3,
      bio: true, abilities: ["stim"], stimCost: 20, armorUpgrade: "a_inf_armor", req: ["a_academy"],
      weapons: [{ name: "Fire lance", dmg: 8, hits: 2, type: "concussive", range: 32, cd: 22, upg: 1, upgrade: "a_inf_weapons", splash: [15, 20, 25] }] },
    a_corpsman: { name: "Corpsman", hp: 60, armor: 1, size: "small", speed: 4, r: 8, sight: 9, supply: 1, cost: [50, 25], buildTicks: 450, hotkey: "C",
      bio: true, energy: 200, energyStart: 50, armorUpgrade: "a_inf_armor", req: ["a_academy"],
      heal: { amount: 1.5, every: 4, cost: 1, range: 32 } },
    a_hornet: { mech: true, name: "Hornet", hp: 80, armor: 0, size: "medium", speed: 6.4, r: 16, sight: 8, supply: 2, cost: [75, 0], buildTicks: 450, hotkey: "H", acquire: 6,
      weapons: [{ name: "Shrapnel launcher", dmg: 20, type: "concussive", range: 160, cd: 30, upg: 2 }] },
    a_dropship: { mech: true, name: "Pelican", hp: 150, armor: 1, size: "large", speed: 5.47, r: 24, sight: 8, supply: 2, cost: [100, 100], buildTicks: 750, air: true, hotkey: "P" },
  },
  buildings: {
    a_command: { name: "Command Post", hp: 1500, armor: 1, size: "large", foot: [4, 3], sight: 10, cost: [400, 0], buildTicks: 1800, supplyGive: 10, hotkey: "C",
      dropoff: true, trains: ["a_engineer"] },
    a_depot: { name: "Supply Depot", hp: 500, armor: 1, size: "large", foot: [3, 2], sight: 8, cost: [100, 0], buildTicks: 600, supplyGive: 8, hotkey: "S" },
    a_refinery: { name: "Refinery", hp: 750, armor: 1, size: "large", foot: [4, 2], sight: 8, cost: [100, 0], buildTicks: 600, hotkey: "R", onVapour: true },
    a_barracks: { name: "Barracks", hp: 1000, armor: 1, size: "large", foot: [4, 3], sight: 8, cost: [150, 0], buildTicks: 1200, hotkey: "B",
      trains: ["a_trooper", "a_torcher", "a_corpsman"], req: ["a_command"] },
    a_drillhall: { name: "Drill Hall", hp: 850, armor: 1, size: "large", foot: [4, 3], sight: 8, cost: [125, 0], buildTicks: 900, hotkey: "D", req: ["a_command"] },
    a_academy: { name: "Academy", hp: 600, armor: 1, size: "large", foot: [3, 2], sight: 8, cost: [150, 0], buildTicks: 1200, hotkey: "A", req: ["a_barracks"] },
    a_garage: { name: "Motor Pool", hp: 1250, armor: 1, size: "large", foot: [4, 3], sight: 8, cost: [200, 100], buildTicks: 1200, hotkey: "G",
      trains: ["a_hornet", "a_dropship"], req: ["a_barracks"] },
  },
  upgrades: {
    a_inf_weapons: { name: "Infantry weapons", levels: 3, cost: [[100, 100], [175, 175], [250, 250]], ticks: [4000, 4480, 4960], at: "a_drillhall", hotkey: "W",
      note: "More damage for troopers and torchers." },
    a_inf_armor: { name: "Infantry armour", levels: 3, cost: [[100, 100], [175, 175], [250, 250]], ticks: [4000, 4480, 4960], at: "a_drillhall", hotkey: "R",
      note: "A point of armour a level for all the PDF's infantry." },
    a_stim: { name: "Adrenal shot", levels: 1, cost: [[100, 100]], ticks: [1200], at: "a_academy", hotkey: "S",
      note: "Troopers and torchers can take a shot: half again as fast, and firing twice as often, for eleven seconds, for 10 health (a torcher 20)." },
  },
});
