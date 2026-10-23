/* PumaCraft -- setting up a skirmish.
 *
 * The map: a drawn one, or a generated one of a size and a seed (the seed
 * is the map: the same seed is the same ground every time). The other
 * players: the computer (js/engine/ai.js) at easy, normal or hard, or a
 * training target -- a base whose engineers mine but which builds nothing
 * and only fights where it stands. Every other player is against you and
 * against each other. Each side is a faction, or Random (settled by the
 * seed, so a seed replays the same match-up). Then the game starts, and its end comes back here.
 *
 * The last choices are kept (pumacraft_skirmish_v1). */
"use strict";
(() => {
  const C = PC.C, S = PC.Store, KEY = "pumacraft_skirmish_v1";
  const KINDS = [
    { id: "proving", label: "Proving Ground", note: "64 x 64, drawn, for two", players: 2 },
    { id: "gen96", label: "Generated, small", note: "96 x 96, for two", size: 96, players: 2 },
    { id: "gen128", label: "Generated, large", note: "128 x 128, for two", size: 128, players: 2 },
    { id: "gen128x4", label: "Generated, four corners", note: "128 x 128, for four", size: 128, players: 4 },
  ];
  const FOES = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"], ["target", "Training target"]];
  /* the sides: the factions there are, and a random one, settled by the seed */
  const SIDES = () => [...PC.Data.factionIds().map(id => [id, PC.Data.factions[id].short]), ["random", "Random"]];
  const DEF = { map: "gen96", seed: 1, foe: "normal", side: "a", foeSide: "random" };
  const load = () => { try { return Object.assign({}, DEF, { seed: 1 + Math.floor(Math.random() * 99999) }, JSON.parse(S.get(KEY, "{}"))); } catch (e) { return Object.assign({}, DEF); } };
  const keep = o => S.put(KEY, JSON.stringify(o));
  /** A side as a faction id: random is picked by the seed and the seat, so a seed replays the same match-up. */
  const settle = (side, seed, seat) => {
    const ids = PC.Data.factionIds();
    if (ids.includes(side)) return side;
    return ids[((Math.imul(seed + 1 + seat * 7919, 2654435761) >>> 0) >>> 16) % ids.length];
  };
  const sideRow = (label, key, cur) => `<div class="pc-row pc-seg" role="group" aria-label="${label}">` +
    SIDES().map(([id, l]) => `<button data-${key}="${id}" aria-pressed="${cur === id}">${l}</button>`).join("") + `</div>`;

  function html(o) {
    const k = KINDS.find(x => x.id === o.map) || KINDS[0];
    return `<section class="pc-set"><h3>The map</h3><div class="pc-row pc-seg" role="group" aria-label="Map">` +
      KINDS.map(x => `<button data-map="${x.id}" aria-pressed="${x.id === k.id}">${x.label}</button>`).join("") +
      `</div><p class="pc-note">${k.note}.${k.size ? " The seed is the map: the same seed, the same ground." : ""}</p>` +
      (k.size ? `<div class="pc-row"><label>Seed <input class="pc-seed" type="number" min="1" max="999999" value="${o.seed}" aria-label="Seed"></label><button data-reroll>Another</button></div>` : "") +
      `</section><section class="pc-set"><h3>Your side</h3>` + sideRow("Your side", "side", o.side) +
      `</section><section class="pc-set"><h3>The other side${k.players > 2 ? "s" : ""}</h3><div class="pc-row pc-seg" role="group" aria-label="Opponent">` +
      FOES.map(([id, l]) => `<button data-foe="${id}" aria-pressed="${o.foe === id}">${l}</button>`).join("") + `</div>` +
      sideRow("Their side", "foeside", o.foeSide) +
      `<p class="pc-note">${o.foe === "target" ? "A base that mines but builds nothing and only fights where it stands." : `The computer, ${o.foe}: it builds, trains and attacks in waves, each bigger than the last.`}${k.players > 2 ? ` ${k.players - 1} of them, every one against every other.` : ""}</p></section>` +
      `<div class="pc-row"><button data-primary data-start>Start</button></div>`;
  }

  PC.Skirmish = {
    open(onStart) {
      const o = load();
      PC.Sheet("Skirmish", html(o), (b, sh) => {
        if (b.dataset.map) { o.map = b.dataset.map; keep(o); sh.refresh(html(o)); }
        else if (b.dataset.foe) { o.foe = b.dataset.foe; keep(o); sh.refresh(html(o)); }
        else if (b.dataset.side) { o.side = b.dataset.side; keep(o); sh.refresh(html(o)); }
        else if (b.dataset.foeside) { o.foeSide = b.dataset.foeside; keep(o); sh.refresh(html(o)); }
        else if (b.hasAttribute("data-reroll")) { o.seed = 1 + Math.floor(Math.random() * 999999); keep(o); sh.refresh(html(o)); }
        else if (b.classList.contains("pc-seed")) { o.seed = Math.max(1, Math.min(999999, Math.floor(+b.value) || 1)); keep(o); }
        else if (b.hasAttribute("data-start")) { const inp = sh.el.querySelector(".pc-seed"); if (inp) o.seed = Math.max(1, Math.floor(+inp.value) || 1); keep(o); sh.close(); onStart(PC.Skirmish.game(o)); }
      });
    },
    /** The game a choice makes: { map, players, seed, title, setup } for PC.Play.start. */
    game(o) {
      const k = KINDS.find(x => x.id === o.map) || KINDS[0];
      const map = k.size ? PC.MapGen.idOf({ seed: o.seed, size: k.size, players: k.players }) : k.id;
      if (k.size) PC.MapGen.ensure(map);
      const players = [{ faction: settle(o.side || "a", o.seed, 0), team: 0, name: "You" }];
      const foe = FOES.some(([id]) => id === o.foe) ? o.foe : "normal";
      for (let p = 1; p < k.players; p++) players.push({ faction: settle(o.foeSide || "random", o.seed, p), team: p, name: foe === "target" ? "Training target" : "The computer", ai: foe });
      return { map, players, seed: o.seed, title: k.label + (k.size ? ` #${o.seed}` : ""), setup: PC.Skirmish.targets };
    },
    /** Training targets: their workers mine, and a few of their cheapest soldiers stand guard. */
    targets(W) {
      const F = C.F;
      for (let p = 1; p < W.players.length; p++) {
        if (W.players[p].ai !== "target") continue;
        const ws = []; let hall = -1;
        for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && W.owner[i] === p) { if (W.flags[i] & F.WORKER) ws.push(PC.World.id(W, i)); if (W.flags[i] & F.BUILDING) hall = i; }
        let vein = -1, bd = Infinity;
        for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && PC.Data.types[W.type[i]].gather === 1) { const d = Math.abs(W.x[i] - W.x[hall]) + Math.abs(W.y[i] - W.y[hall]); if (d < bd) { bd = d; vein = i; } }
        if (vein >= 0) PC.Orders.issue(W, { t: 0, p, k: C.CMD.GATHER, u: ws, tgt: PC.World.id(W, vein) });
        const guard = PC.Data.type(W.players[p].faction === "b" ? "b_runner" : "a_trooper").id;
        for (let k = 0; k < 4; k++) { const [x, y] = PC.Econ.exitPoint(W, hall); PC.World.spawn(W, guard, p, x + (k - 1.5) * 6 * C.ONE, y + 6 * C.ONE); }
      }
    },
  };
})();
