/* PumaCraft engine -- the registry every faction's data file fills.
 *
 * A faction file (js/data/<faction>.js) calls PC.Data.faction(id, def). Its
 * numbers are written in the original's measures -- 32 px tiles, speeds in
 * original pixels per tick, hit points whole -- so balance can be read
 * straight against the tables it follows. Here they are converted, once,
 * into the engine's: fixed-point pixels at 24 px a tile, and hit points in
 * quarter-points so every damage percentage stays an integer.
 *
 * Types get small integer ids in registration order; the load order of the
 * data files is fixed by index.html and tools/lib.js, so ids are the same
 * everywhere. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const C = PC.C;
  const D = PC.Data = { types: [null], byKey: Object.create(null), factions: Object.create(null), order: [] };

  /* original pixels to engine fixed point, rounded down */
  const px = v => Math.floor(v * C.ORIG_PX_NUM * C.ONE / C.ORIG_PX_DEN);
  const q = v => Math.round(v * 4);   /* whole points to quarter-points */
  /* damage types against unit sizes, percent: [small, medium, large] (the
     original's table, which is general knowledge of how it played) */
  const DTYPE = { normal: 0, concussive: 1, explosive: 2 };
  D.FACTOR = [[100, 100, 100], [100, 50, 25], [50, 75, 100]];

  function addType(key, kind, faction, d) {
    if (D.byKey[key]) throw new Error("type registered twice: " + key);
    const t = {
      id: D.types.length, key, kind, faction, name: d.name || key,
      hp: q(d.hp || 1), shield: q(d.shield || 0), armor: d.armor || 0, size: C.SIZE[d.size || "small"],
      speed: px(d.speed || 0), r: px(d.r || 8), sight: d.sight || 7,
      air: !!d.air, worker: !!d.worker, supply: d.supply || 0, supplyGive: d.supplyGive || 0,
      cost: d.cost || [0, 0], buildTicks: d.buildTicks || 0,
      foot: d.foot || null, art: d.art || key, hotkey: d.hotkey || null, raw: d,
      /* weapons: damage in quarter-points, range in fixed point from edge to edge, cooldown in ticks */
      weapons: (d.weapons || []).map(w => ({ name: w.name || "", dmg: q(w.dmg), dtype: DTYPE[w.type || "normal"], range: px(w.range || 0), cd: w.cd || 15,
        air: w.air !== false && !!w.air, ground: w.ground !== false, upg: q(w.upg || 0), splash: w.splash ? w.splash.map(px) : null, sfx: w.sfx || key })),
      acquire: px((d.acquire || 0) * 32),
      trains: d.trains || [], builds: d.builds || [], req: d.req || [],
      dropoff: !!d.dropoff, onVapour: !!d.onVapour, amount: d.amount || 0, gather: d.gather || 0,
      mine: d.mine || 0, carry: d.carry || 0,
    };
    if (t.foot) t.r = Math.floor(Math.min(t.foot[0], t.foot[1]) * C.TILE_FP / 2);
    D.types.push(t);
    D.byKey[key] = t;
    D.order.push(key);
    return t;
  }

  D.faction = (id, def) => {
    D.factions[id] = { id, name: def.name, short: def.short || def.name, units: [], buildings: [] };
    for (const [k, u] of Object.entries(def.units || {})) D.factions[id].units.push(addType(k, "unit", id, u).id);
    for (const [k, b] of Object.entries(def.buildings || {})) D.factions[id].buildings.push(addType(k, "building", id, b).id);
  };
  D.neutral = defs => { for (const [k, d] of Object.entries(defs)) addType(k, d.kind || "resource", "neutral", d); };
  /** Resolves the keys a type names (trains, builds, req) into type ids, once every file has loaded. */
  D.finish = () => {
    if (D.finished) return;
    for (const t of D.types.slice(1)) for (const k of ["trains", "builds", "req"]) t[k] = t[k].map(x => typeof x === "number" ? x : D.type(x).id);
    D.finished = true;
  };
  D.type = key => { const t = D.byKey[key]; if (!t) throw new Error("no such type: " + key); return t; };
})();
