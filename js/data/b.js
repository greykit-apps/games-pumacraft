/* PumaCraft data -- faction B: the Wolf Empire's Horde (working name,
 * pending approval). Many, cheap and quick to heal: its units hatch from
 * eggs laid by larvae at a Den, its workers become the buildings they make,
 * and its buildings grow by themselves on the Range, the ground its Dens
 * spread round them. Everything of it knits its own wounds.
 *
 * Measures as js/data/a.js. Supply may be a half: a Runner is half a
 * supply, and they hatch two to an egg. */
"use strict";
PC.Data.faction("b", {
  name: "The Horde", short: "Horde", egg: "b_egg", start: ["b_alpha"],
  units: {
    b_scav: { name: "Scavenger", hp: 40, armor: 0, size: "small", speed: 4.92, r: 11, sight: 7, supply: 1, cost: [50, 0], buildTicks: 300, worker: true, hotkey: "D",
      bio: true, regen: true, morphs: true, mine: 75, carry: 8, armorUpgrade: "b_carapace",
      builds: ["b_den", "b_vat", "b_pool", "b_evo", "b_thorn", "b_gland"], buildsAdvanced: ["b_spitpit", "b_roost"],
      weapons: [{ name: "Gnawing", dmg: 5, type: "normal", range: 10, cd: 22 }] },
    b_runner: { name: "Runner", hp: 35, armor: 0, size: "small", speed: 5.49, r: 8, sight: 5, supply: 0.5, pair: true, cost: [50, 0], buildTicks: 420, hotkey: "R", acquire: 3,
      bio: true, regen: true, req: ["b_pool"], armorUpgrade: "b_carapace", speedUp: { upgrade: "b_haste", pct: 60 },
      weapons: [{ name: "Fangs", dmg: 5, type: "normal", range: 10, cd: 8, upg: 1, upgrade: "b_melee" }] },
    b_spitter: { name: "Spitter", hp: 80, armor: 0, size: "medium", speed: 3.66, r: 10, sight: 6, supply: 1, cost: [75, 25], buildTicks: 420, hotkey: "S", acquire: 5,
      bio: true, regen: true, req: ["b_spitpit"], armorUpgrade: "b_carapace", speedUp: { upgrade: "b_spit_speed", pct: 50 },
      weapons: [{ name: "Bone quill", dmg: 10, type: "explosive", range: 128, cd: 15, upg: 1, upgrade: "b_missile", air: true }] },
    b_alpha: { name: "Alpha", hp: 200, armor: 0, size: "large", speed: 0.83, r: 25, sight: 9, supplyGive: 8, cost: [100, 0], buildTicks: 600, hotkey: "A", air: true,
      bio: true, regen: true, detector: true, armorUpgrade: "b_carapace" },
    b_harrier: { name: "Harrier", hp: 120, armor: 0, size: "small", speed: 6.67, r: 11, sight: 7, supply: 2, cost: [100, 100], buildTicks: 600, hotkey: "H", acquire: 5, air: true,
      bio: true, regen: true, req: ["b_roost"], armorUpgrade: "b_flyer_hide",
      weapons: [{ name: "Ricochet bone", dmg: 9, type: "normal", range: 96, cd: 30, upg: 1, upgrade: "b_flyer_atk", air: true }] },
    b_egg: { name: "Egg", hp: 200, armor: 10, size: "large", speed: 0, r: 12, sight: 4, egg: true, bio: true, regen: true },
  },
  buildings: {
    b_den: { name: "Den", hp: 1250, armor: 1, size: "large", foot: [4, 3], sight: 9, cost: [300, 0], buildTicks: 1800, supplyGive: 1, hotkey: "D",
      dropoff: true, larvae: 3, creep: 10, creepOk: true, selfBuild: true, regen: true,
      trains: ["b_scav", "b_runner", "b_spitter", "b_alpha", "b_harrier"] },
    b_vat: { name: "Vat", hp: 750, armor: 1, size: "large", foot: [4, 2], sight: 7, cost: [50, 0], buildTicks: 600, hotkey: "V", onVapour: true, creepOk: true, selfBuild: true, regen: true },
    b_pool: { name: "Blood Pool", hp: 750, armor: 1, size: "large", foot: [3, 2], sight: 7, cost: [200, 0], buildTicks: 1200, hotkey: "P", creepReq: true, selfBuild: true, regen: true, req: ["b_den"] },
    b_evo: { name: "Gnawing Pit", hp: 750, armor: 1, size: "large", foot: [3, 2], sight: 7, cost: [75, 0], buildTicks: 600, hotkey: "E", creepReq: true, selfBuild: true, regen: true, req: ["b_den"] },
    b_spitpit: { name: "Quill Nest", hp: 850, armor: 1, size: "large", foot: [3, 2], sight: 7, cost: [100, 50], buildTicks: 600, hotkey: "Q", creepReq: true, selfBuild: true, regen: true, req: ["b_pool"] },
    b_roost: { name: "Roost", hp: 600, armor: 1, size: "large", foot: [2, 2], sight: 7, cost: [200, 150], buildTicks: 1800, hotkey: "R", creepReq: true, selfBuild: true, regen: true, req: ["b_spitpit"] },
    b_thorn: { name: "Thornwall", hp: 300, armor: 2, size: "large", foot: [2, 2], sight: 9, cost: [150, 0], buildTicks: 600, hotkey: "T", creepReq: true, selfBuild: true, regen: true, creep: 6, req: ["b_pool"], acquire: 7,
      weapons: [{ name: "Tusk", dmg: 40, type: "explosive", range: 224, cd: 32, ground: true }] },
    b_gland: { name: "Gland", hp: 400, armor: 0, size: "large", foot: [2, 2], sight: 9, cost: [125, 0], buildTicks: 600, hotkey: "G", creepReq: true, selfBuild: true, regen: true, creep: 6, req: ["b_evo"], detector: true, acquire: 7,
      weapons: [{ name: "Spore cloud", dmg: 15, type: "normal", range: 224, cd: 15, air: true, ground: false }] },
  },
  upgrades: {
    b_melee: { name: "Fangs", levels: 3, cost: [[100, 100], [150, 150], [200, 200]], ticks: [4000, 4480, 4960], at: "b_evo", hotkey: "F", note: "Sharper teeth for the Horde's biters." },
    b_missile: { name: "Quills", levels: 3, cost: [[100, 100], [150, 150], [200, 200]], ticks: [4000, 4480, 4960], at: "b_evo", hotkey: "Q", note: "Harder spit for the Horde's spitters." },
    b_carapace: { name: "Hide", levels: 3, cost: [[150, 150], [225, 225], [300, 300]], ticks: [4000, 4480, 4960], at: "b_evo", hotkey: "H", art: "armour", note: "A point of armour a level for the Horde on the ground." },
    b_haste: { name: "Long legs", levels: 1, cost: [[100, 100]], ticks: [1500], at: "b_pool", hotkey: "L", art: "stim", note: "Runners run three-fifths again as fast." },
    b_spit_speed: { name: "Loping stride", levels: 1, cost: [[150, 150]], ticks: [1500], at: "b_spitpit", hotkey: "L", art: "stim", note: "Spitters move half again as fast." },
    b_flyer_atk: { name: "Talons", levels: 3, cost: [[100, 100], [175, 175], [250, 250]], ticks: [4000, 4480, 4960], at: "b_roost", hotkey: "T", note: "More damage for the Horde's flyers." },
    b_flyer_hide: { name: "Wing hide", levels: 3, cost: [[150, 150], [225, 225], [300, 300]], ticks: [4000, 4480, 4960], at: "b_roost", hotkey: "W", art: "armour", note: "A point of armour a level for the Horde's flyers." },
  },
});
