/* PumaCraft -- the play screen: the battlefield, the console, and the hands
 * on them.
 *
 * Mouse: left-click selects (Shift adds or removes, Ctrl or a double-click
 * takes every unit of that kind on screen); drag a box to select your units
 * in it; right-click is the smart order -- attack an enemy, gather from ore
 * or your refinery, bring cargo home, or move -- and with a building
 * selected sets its rally point. Shift queues an order behind the last.
 *
 * Keys: the command card's letters, Esc to back out of a targeting or
 * building mode, Ctrl+0-9 to make a control group and 0-9 to call it
 * (twice to look at it), F1 for the next idle worker, Backspace for the
 * next town hall, the arrows or the screen's edge to scroll, F10 for the
 * menu, M for sound.
 *
 * Every order goes to the engine through PC.Orders.issue, stamped for the
 * next tick -- the same door the AI and a replay use. */
"use strict";
(() => {
  const C = PC.C, F = C.F, CMD = C.CMD, ORD = C.ORD, T = () => PC.Data.types, V = PC.View, Sp = PC.RenderSprites;
  const P = PC.Play = { me: 0 };
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fp = v => Math.floor(v * C.ONE);

  /* ---- the 8 x 8 command glyphs, drawn at twice size ---- */
  const GLYPH = {
    move: ["...##...", "..####..", ".######.", "...##...", "...##...", "...##...", "...##...", "........"],
    stop: ["........", ".######.", ".######.", ".######.", ".######.", ".######.", ".######.", "........"],
    attack: ["......##", ".....###", "....###.", "#..###..", ".####...", "..##....", ".#.##...", "#...#..."],
    patrol: ["..#.....", ".##.....", "########", ".##.....", "..#..#..", ".....##.", "########", ".....##."],
    hold: [".######.", "#.####.#", "#.####.#", "#.####.#", ".#.##.#.", ".#.##.#.", "..####..", "...##..."],
    gather: ["...#....", "..###...", "..###.#.", ".#####.#", ".#####.#", "########", ".######.", "........"],
    ret: ["...##...", "...##...", ".######.", "..####..", "...##...", "#......#", "########", "........"],
    build: ["#####...", "#####...", "..##....", "..##....", "..##....", "..##....", "..##....", "........"],
    cancel: ["#......#", ".#....#.", "..#..#..", "...##...", "...##...", "..#..#..", ".#....#.", "#......#"],
    rally: [".#......", ".#####..", ".######.", ".#####..", ".#......", ".#......", ".#......", "###....."],
    back: ["...#....", "..##....", ".#######", "########", ".#######", "..##....", "...#....", "........"],
    stim: ["......#.", ".....#.#", "....###.", "...###..", "..###...", ".###....", "##......", "#......."],
    weapons: ["...##...", "...##...", "..####..", "..####..", "..####..", "..####..", ".######.", "...##..."],
    armour: [".######.", "########", "########", "########", ".######.", ".######.", "..####..", "...##..."],
    cloak: ["..####..", ".#....#.", "#.#..#.#", "#......#", "#.####.#", ".#....#.", "..####..", "........"],
    matrix: ["..####..", ".##..##.", "##.##.##", "#.####.#", "##.##.##", ".##..##.", "..####..", "........"],
    buildAdv: ["#####.#.", "#####.#.", "..##.###", "..##..#.", "..##....", "..##....", "..##....", "........"],
    repair: ["....##..", "...#..#.", "...#.##.", "..##.#..", ".##.....", "##......", "#.......", "........"],
    unload: ["...##...", "...##...", "...##...", ".######.", "..####..", "...##...", "########", "........"],
    lift: ["...##...", "..####..", ".######.", "...##...", "########", "#......#", "########", "........"],
    land: ["########", "#......#", "########", "...##...", ".######.", "..####..", "...##...", "........"],
    scan: ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#..##..#", ".#....#.", "..####..", "........"],
    siege: ["...##...", "..####..", "...##...", "...##...", ".######.", "##.##.##", "#..##..#", "#......#"],
  };
  function glyph(name, colour = "#54f2ff") {
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const g = c.getContext("2d"); g.fillStyle = colour;
    GLYPH[name].forEach((row, y) => { for (let x = 0; x < 8; x++) if (row[x] === "#") g.fillRect(x * 2, y * 2, 2, 2); });
    return c;
  }
  /** A unit or building's icon: its idle frame facing the viewer, fitted into size x size. */
  function icon(typeId, owner, size) {
    const t = T()[typeId], c = document.createElement("canvas"); c.width = c.height = size;
    const fr = Sp.frame(t.art, "idle", 0, t.foot ? 0 : 64);
    if (!fr || !fr.r || !fr.r[2]) return c;
    const [x, y, w, h] = fr.r, k = Math.min(size / w, size / h, t.foot ? 1 : 2), g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(PC.Sheets.sheet(fr.sheet, owner), x, y, w, h, Math.round((size - w * k) / 2), Math.round((size - h * k) / 2), Math.round(w * k), Math.round(h * k));
    return c;
  }

  /* ---- the session ---- */
  /** Starts a game: opts { map, players, seed, setup(W) } and onEnd(result). */
  P.start = (opts, onEnd) => {
    const host = $("#game-host");
    host.hidden = false;
    host.innerHTML = `<div class="pc-play" role="application" aria-label="PumaCraft">
      <div class="pc-top"><span class="pc-res pc-ore" title="Ore"><i></i><b>0</b></span><span class="pc-res pc-vap" title="Vapour"><i></i><b>0</b></span>
        <span class="pc-res pc-sup" title="Supply: used / available"><i></i><b>0/0</b></span><span class="pc-clock">0:00</span>
        <span class="pc-idle" title="Idle workers (F1)"></span><button class="pc-menu" title="Menu (F10)">Menu</button></div>
      <div class="pc-msg" aria-live="polite"></div>
      <div class="pc-console">
        <canvas class="pc-mini" width="84" height="84" aria-label="Minimap"></canvas>
        <div class="pc-sel"></div>
        <div class="pc-card"></div>
      </div>
      <div class="pc-tip" hidden></div>
    </div>`;
    const box = $(".pc-play", host);
    V.mount(box);
    let W;
    if (opts.save) W = PC.Serial.load(opts.save);
    else {
      W = PC.Sim.create(opts.map, opts.players, opts.seed, { bases: true });
      if (opts.setup) opts.setup(W);
      PC.Sim.rebuild(W);
    }
    P.W = W; P.box = box; P.onEnd = onEnd; P.ended = false; P.title = opts.title || (opts.save && opts.save.extra && opts.save.extra.title) || "Skirmish";
    P.me = Sp.me = 0;
    P.sel = []; P.groups = Array.from({ length: 10 }, () => []); P.mode = null; P.menu = "main"; P.msg = { text: "", until: 0 };
    Sp.selected = new Set();
    const s = PC.Map.registry[W.map.id].starts[P.me];
    V.W_ = W;   /* so the camera knows the map's edges before the loop starts */
    if (opts.save && opts.save.extra && opts.save.extra.cam) { V.camX = opts.save.extra.cam[0]; V.camY = opts.save.extra.cam[1]; V.clamp(); }
    else V.centreOn(s.x * C.TILE, s.y * C.TILE + 40);
    V.paused = false;
    V.speed = P.speedOf(PC.Store.get(PC.Store.K.speed, "fast"));
    PC.SFX.view = { get camX() { return V.camX; }, get camY() { return V.camY; }, w: V.view.w, h: V.view.h };
    wire(box);
    let hudAt = 0, miniAt = 0;
    V.over = drawOver;
    V.run(W, {
      onFrame(dt, ms) { scroll(dt); if (ms - hudAt > 120) { hudAt = ms; hud(); } if (ms - miniAt > 200) { miniAt = ms; mini(); } },
      onStep(W2) {
        PC.SFX.events(W2, P.me);
        for (const e of W2.ev) {
          if (e[0] === "error" && e[1] === P.me) say(ERR[e[2]] || "Cannot do that.");
          else if (e[0] === "researched" && W2.owner[e[1]] === P.me) { const up = PC.Data.upgrades[e[2]]; say(`${up.name}${up.levels > 1 ? " level " + W2.upg[P.me * 64 + up.id] : ""}: research complete.`, 3500); }
        }
        if (W2.hdr[0] % 24 === 0) judge();
        /* an autosave every five game minutes */
        if (W2.hdr[0] % (C.TICK * 300) === 0 && PC.Saves.canSlot) PC.Saves.toSlot(PC.Saves.AUTO, W2, extra());
      },
    });
    say("Right-click to give orders. Drag to select. ? for help.", 5000);
  };
  P.speedOf = k => ({ slow: 0.5, normal: 0.67, fast: 0.85, fastest: 1 })[k] || 0.85;
  P.stop = () => { V.stop(); V.over = null; const host = $("#game-host"); host.hidden = true; host.innerHTML = ""; unwire(); };

  const ERR = { full: "There is no room inside.", ore: "Not enough ore.", vapour: "Not enough vapour.", supply: "More supply is needed: build a Supply Depot.", place: "Cannot build there.",
    queue: "The queue is full.", tech: "That needs another building first.", busy: "That is already being researched.", done: "That is already fully researched." };
  function say(text, ms = 2500) { P.msg = { text, until: performance.now() + ms }; const el = $(".pc-msg", P.box); if (el) { el.textContent = text; el.classList.add("on"); } }

  /* ---- what is where ---- */
  /** The live slot of id, or -1. */
  const live = id => PC.World.live(P.W, id);
  const selSlots = () => P.sel.map(live).filter(i => i >= 0);
  function world(lx, ly) { return [lx - V.view.x + V.camX, ly - V.view.y + V.camY]; }
  function inView(lx, ly) { return lx >= V.view.x && ly >= V.view.y && lx < V.view.x + V.view.w && ly < V.view.y + V.view.h; }
  /** The unit under world pixel (wx, wy) the viewer can see; -1 if none. Flyers first, then nearest the viewer. */
  function pick(wx, wy) {
    const W = P.W;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE) || (W.flags[i] & (F.INSIDE | F.EFFECT)) || !Sp.shown(W, i)) continue;
      const t = T()[W.type[i]], x = W.x[i] / C.ONE, y = W.y[i] / C.ONE - (W.mode[i] === 4 ? 18 : 0), air = W.flags[i] & F.AIR;
      let hit = false;
      if (t.foot) hit = Math.abs(wx - x) <= t.foot[0] * 12 && wy <= y + t.foot[1] * 12 && wy >= y - t.foot[1] * 12 - 20;
      else { const r = Math.max(7, t.r / C.ONE + 3), cy = y - (air ? 22 : 7); hit = Math.abs(wx - x) <= r && Math.abs(wy - cy) <= r + 4; }
      if (!hit) continue;
      const score = (air ? 1e6 : 0) + y;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  const mine = i => P.W.owner[i] === P.me;

  /* ---- selecting ---- */
  function select(slots, add = false) {
    const W = P.W;
    let ids = slots.map(i => PC.World.id(W, i));
    if (add) { const have = new Set(P.sel); for (const id of ids) if (have.has(id)) have.delete(id); else have.add(id); ids = [...have]; }
    P.sel = ids.slice(0, 250);
    P.mode = null; P.menu = "main";
    refreshSel();
    const first = selSlots()[0];
    if (first !== undefined && mine(first) && !(W.flags[first] & F.BUILDING)) { PC.SFX.play("chirp"); }
  }
  function refreshSel() { Sp.selected = new Set(selSlots()); card(); panel(); }
  /** Select by box in screen pixels: your units in it (or else your buildings, or else one other thing). */
  function boxSelect(x0, y0, x1, y1, add) {
    const W = P.W, [ax, ay] = world(Math.min(x0, x1), Math.min(y0, y1)), [bx, by] = world(Math.max(x0, x1), Math.max(y0, y1));
    const units = [], buildings = [];
    for (let i = 0; i < C.MAX_UNITS; i++) {
      if (!(W.flags[i] & F.ALIVE) || (W.flags[i] & (F.INSIDE | F.EFFECT)) || !mine(i)) continue;
      const x = W.x[i] / C.ONE, y = W.y[i] / C.ONE - (W.flags[i] & F.AIR ? 22 : 4);
      if (x < ax || x > bx || y < ay || y > by) continue;
      (W.flags[i] & F.BUILDING ? buildings : units).push(i);
    }
    select(units.length ? units : buildings.slice(0, 1), add);
  }
  /** Every unit of slot i's type and owner on screen. */
  function sameOnScreen(i) {
    const W = P.W, out = [];
    for (let j = 0; j < C.MAX_UNITS; j++) {
      if (!(W.flags[j] & F.ALIVE) || W.type[j] !== W.type[i] || W.owner[j] !== W.owner[i]) continue;
      const x = W.x[j] / C.ONE - V.camX, y = W.y[j] / C.ONE - V.camY;
      if (x >= 0 && y >= 0 && x < V.view.w && y < V.view.h) out.push(j);
    }
    return out;
  }

  /* ---- ordering ---- */
  function order(k, extra = {}, units = null) {
    const W = P.W, u = (units || selSlots().filter(mine)).map(i => PC.World.id(W, i));
    if (!u.length) return;
    PC.Orders.issue(W, Object.assign({ t: W.hdr[0] + 1, p: P.me, k, u }, extra));
  }
  /** The smart order at world pixel (wx, wy). */
  function smart(wx, wy, shift) {
    const W = P.W, s = selSlots().filter(mine);
    if (!s.length) return;
    const j = pick(wx, wy), x = fp(wx), y = fp(wy);
    const buildings = s.filter(i => (W.flags[i] & F.BUILDING) && W.mode[i] !== 4), mobile = s.filter(i => !(W.flags[i] & F.BUILDING) || W.mode[i] === 4);
    if (buildings.length && !mobile.length) { order(CMD.RALLY, { x, y, tgt: j >= 0 ? PC.World.id(W, j) : 0 }, buildings); flash(wx, wy, "#54f2ff"); return; }
    if (j >= 0) {
      const tj = T()[W.type[j]], id = PC.World.id(W, j), workers = mobile.filter(i => W.flags[i] & F.WORKER), others = mobile.filter(i => !(W.flags[i] & F.WORKER));
      if (W.owner[j] < C.MAX_PLAYERS && W.owner[j] !== P.me && PC.Combat.hostile(W, mobile[0], j)) { order(CMD.ATTACK, { tgt: id, q: shift }, mobile); flash(wx, wy, "#ff5266"); return; }
      if (mine(j) && (tj.cargo || tj.bunker) && j !== mobile[0] && mobile.some(i => !(W.flags[i] & F.AIR))) { order(CMD.LOAD, { tgt: id, q: shift }, mobile.filter(i => !(W.flags[i] & F.AIR) && (!tj.bunker || T()[W.type[i]].bio))); flash(wx, wy, "#54f2ff"); return; }
      if (mine(j) && workers.length && (tj.mech || tj.kind === "building") && !(W.flags[j] & F.UNDER_CONSTRUCTION) && W.hp[j] < tj.hp) { order(CMD.REPAIR, { tgt: id, q: shift }, workers); flash(wx, wy, "#54f2ff"); return; }
      const gatherable = (W.flags[j] & F.RESOURCE && tj.gather === 1) || (tj.onVapour && mine(j) && !(W.flags[j] & F.UNDER_CONSTRUCTION));
      if (gatherable && workers.length) { order(CMD.GATHER, { tgt: id, q: shift }, workers); if (others.length) order(CMD.MOVE, { x, y, q: shift }, others); flash(wx, wy, "#ffb000"); return; }
      if (tj.dropoff && mine(j) && workers.some(i => W.carry[i])) { order(CMD.RETURN, { q: shift }, workers.filter(i => W.carry[i])); return; }
    }
    order(CMD.MOVE, { x, y, q: shift }, mobile);
    flash(wx, wy, "#4ade6a");
  }
  let flashes = [];
  function flash(wx, wy, colour) { flashes.push({ wx, wy, colour, at: performance.now() }); }

  /* ---- the command card ---- */
  /** The buttons for the current selection and menu: [{ key, label, glyph|type, tip, act, cost? }] x up to 9. */
  function buttons() {
    const W = P.W, s = selSlots().filter(mine);
    if (!s.length) return [];
    const lead = s[0], lt = T()[W.type[lead]];
    if ((W.flags[lead] & F.BUILDING) && W.mode[lead] === 4) {
      /* in the air */
      return [
        { key: "V", glyph: "move", tip: "Move", act: () => { P.mode = { kind: "target", cmd: CMD.MOVE }; } },
        { key: "S", glyph: "stop", tip: "Stop", act: () => order(CMD.STOP) }, , , , , ,
        { key: "L", glyph: "land", tip: "Land", note: "Choose clear ground for it to set down on.", act: () => { P.mode = { kind: "land", type: W.type[lead], b: PC.World.id(W, lead) }; } },
      ];
    }
    if (W.flags[lead] & F.BUILDING) {
      if (W.flags[lead] & F.UNDER_CONSTRUCTION) return [, , , , , , , , { key: "Escape", label: "Esc", glyph: "cancel", tip: "Cancel construction (three quarters back)", act: () => order(CMD.CANCEL, { tgt: -1 }, [lead]) }];
      const b = lt.trains.map(id => { const ut = T()[id]; return { key: ut.hotkey, type: id, tip: `${ut.name}`, cost: ut.cost, supply: ut.supply, req: ut.req, act: () => order(CMD.TRAIN, { tgt: id }, s.filter(i => W.type[i] === W.type[lead])) }; });
      /* research: the next level of each upgrade this building holds */
      for (const uid of lt.researches) {
        const up = PC.Data.upgrades[uid], level = W.upg[P.me * 64 + uid];
        if (level >= up.levels) continue;
        b.push({ key: up.hotkey, glyph: up.art || (up.key.includes("armor") ? "armour" : up.key.includes("stim") ? "stim" : "weapons"),
          tip: up.name + (up.levels > 1 ? ` (level ${level + 1} of ${up.levels})` : ""), note: up.note, cost: up.cost[level], req: up.req[level],
          act: () => order(CMD.RESEARCH, { tgt: uid }, [lead]) });
      }
      while (b.length < 6) b.push(undefined);
      if (lt.trains.length) b[6] = { key: "Y", glyph: "rally", tip: "Set the rally point", act: () => { P.mode = { kind: "rally" }; } };
      if (lt.abilities.includes("scan")) b[3] = { key: "S", glyph: "scan", tip: "Scanner sweep", note: "See, and see the hidden, thirteen tiles round any point, for ten seconds. 50 energy.", act: () => { P.mode = { kind: "scan" }; } };
      if (lt.bunker && PC.Orders.cargoUsed(W, lead)) b[5] = { key: "U", glyph: "unload", tip: "Let them out", act: () => order(CMD.UNLOAD, {}, [lead]) };
      if (lt.lift && !W.qLen[lead]) b[7] = { key: "L", glyph: "lift", tip: "Lift off", note: "It flies, slowly, and trains nothing until it lands.", act: () => order(CMD.LIFT, {}, [lead]) };
      if (W.qLen[lead]) b[8] = { key: "Escape", label: "Esc", glyph: "cancel", tip: "Cancel the last in the queue", act: () => order(CMD.CANCEL, { tgt: W.qLen[lead] - 1 }, [lead]) };
      return b;
    }
    if (P.menu === "build" || P.menu === "build2") {
      const w = s.find(i => W.flags[i] & F.WORKER), wt = w !== undefined ? T()[W.type[w]] : null;
      const list = !wt ? [] : P.menu === "build" ? wt.builds.slice(0, wt.buildsBasic) : wt.builds.slice(wt.buildsBasic);
      const b = list.map(id => { const bt = T()[id]; return { key: bt.hotkey, type: id, tip: bt.name, cost: bt.cost, req: bt.req, act: () => { P.mode = { kind: "place", type: id, worker: PC.World.id(W, w) }; } }; });
      while (b.length < 8) b.push(undefined);
      b[8] = { key: "Escape", label: "Esc", glyph: "back", tip: "Back", act: () => { P.menu = "main"; card(); } };
      return b;
    }
    const armed = s.some(i => T()[W.type[i]].weapons.length), workers = s.some(i => W.flags[i] & F.WORKER);
    if (s.every(i => W.flags[i] & F.WORKER)) return [
      { key: "V", glyph: "move", tip: "Move", act: () => { P.mode = { kind: "target", cmd: CMD.MOVE }; } },
      { key: "S", glyph: "stop", tip: "Stop", act: () => order(CMD.STOP) },
      { key: "A", glyph: "attack", tip: "Attack", act: () => { P.mode = { kind: "target", cmd: CMD.ATTACK }; } },
      { key: "R", glyph: "repair", tip: "Repair", note: "A machine or a building of yours, for a little ore as it goes.", act: () => { P.mode = { kind: "target", cmd: CMD.REPAIR }; } },
      { key: "G", glyph: "gather", tip: "Gather ore or vapour", act: () => { P.mode = { kind: "target", cmd: CMD.GATHER }; } },
      { key: "C", glyph: "ret", tip: "Bring the load home", act: () => order(CMD.RETURN) },
      { key: "B", glyph: "build", tip: "Build", act: () => { P.menu = "build"; card(); } },
      { key: "N", glyph: "buildAdv", tip: "Build advanced", act: () => { P.menu = "build2"; card(); } },
    ];
    const b = [
      /* Move is V: M is sound, everywhere, in every greykit game (games-meta STANDARD.md §8) */
      { key: "V", glyph: "move", tip: "Move", act: () => { P.mode = { kind: "target", cmd: CMD.MOVE }; } },
      { key: "S", glyph: "stop", tip: "Stop", act: () => order(CMD.STOP) },
      armed ? { key: "A", glyph: "attack", tip: "Attack: a target, or move and fight what you meet", act: () => { P.mode = { kind: "target", cmd: CMD.ATTACK }; } } : undefined,
      { key: "P", glyph: "patrol", tip: "Patrol between here and there", act: () => { P.mode = { kind: "target", cmd: CMD.PATROL }; } },
      { key: "H", glyph: "hold", tip: "Hold position", act: () => order(CMD.HOLD) },
    ];
    /* the adrenal shot, once researched */
    const stimUp = PC.Data.upByKey.a_stim;
    if (stimUp && s.some(i => T()[W.type[i]].abilities.includes("stim")))
      b[5] = { key: "T", glyph: "stim", tip: "Adrenal shot", note: W.upg[P.me * 64 + stimUp.id] ? "Faster, and firing twice as often, for eleven seconds. Costs 10 health (a torcher 20)." : "Research it at an Academy first.",
        req: W.upg[P.me * 64 + stimUp.id] ? [] : [stimUp.at], act: () => { if (W.upg[P.me * 64 + stimUp.id]) order(CMD.ABILITY, { tgt: PC.Orders.ABILITY.stim }); } };
    /* siege mode: dig in, or pack up */
    const siegeUp = PC.Data.upByKey.a_siege;
    if (siegeUp && s.some(i => T()[W.type[i]].siege)) {
      const dug = s.some(i => W.mode[i] === 1), has = W.upg[P.me * 64 + siegeUp.id];
      b[7] = { key: "E", glyph: "siege", tip: dug ? "Pack up" : "Siege mode", note: has ? (dug ? "Back on its tracks: it can move again." : "Dig in: it cannot move, and its shells reach twelve tiles and burst.") : "Research Siege mode at a Motor Pool first.",
        req: has ? [] : [siegeUp.at], act: () => { if (has) order(CMD.ABILITY, { tgt: PC.Orders.ABILITY.siege, x: dug ? 2 : 0 }); } };
    }
    /* a Kestrel's cloak; an Aegis's defensive matrix */
    const cloakUp = PC.Data.upByKey.a_cloak;
    if (cloakUp && s.some(i => T()[W.type[i]].abilities.includes("cloak"))) {
      const on = s.some(i => W.flags[i] & F.CLOAKED), has = W.upg[P.me * 64 + cloakUp.id];
      b[6] = { key: "C", glyph: "cloak", tip: on ? "Decloak" : "Cloak", note: has ? (on ? "Seen again, and its energy comes back." : "Unseen but by detectors: 25 energy, then a point every 32 ticks.") : "Research Cloaking field at an Airfield first.",
        req: has ? [] : [cloakUp.at], act: () => { if (has) order(CMD.ABILITY, { tgt: PC.Orders.ABILITY.cloak, x: on ? 2 : 0 }); } };
    }
    if (s.some(i => T()[W.type[i]].abilities.includes("matrix")))
      b[7] = { key: "D", glyph: "matrix", tip: "Defensive matrix", note: "On a friendly unit: it takes the next 250 points of damage for ten seconds. 100 energy.", act: () => { P.mode = { kind: "ability", ab: PC.Orders.ABILITY.matrix }; } };
    if (s.some(i => T()[W.type[i]].cargo && PC.Orders.cargoUsed(W, i)))
      b[8] = { key: "U", glyph: "unload", tip: "Unload", note: "Choose where: it flies there and sets them down.", act: () => { P.mode = { kind: "target", cmd: CMD.UNLOAD }; } };
    return b;
  }
  let cardButtons = [];
  function card() {
    const el = $(".pc-card", P.box);
    if (!el) return;
    cardButtons = buttons();
    el.innerHTML = "";
    for (let k = 0; k < 9; k++) {
      const b = cardButtons[k], btn = document.createElement("button");
      btn.className = "pc-cmd";
      if (!b) { btn.disabled = true; btn.setAttribute("aria-hidden", "true"); btn.tabIndex = -1; el.appendChild(btn); continue; }
      btn.appendChild(b.glyph ? glyph(b.glyph) : icon(b.type, P.me, 22));
      const k2 = document.createElement("span"); k2.className = "pc-key"; k2.textContent = b.label || b.key; btn.appendChild(k2);
      btn.setAttribute("aria-label", `${b.tip}${b.key ? " (" + (b.label || b.key) + ")" : ""}`);
      btn.addEventListener("click", ev => { ev.stopPropagation(); press(b); });
      btn.addEventListener("mouseenter", () => tip(b, btn));
      btn.addEventListener("mouseleave", () => { $(".pc-tip", P.box).hidden = true; });
      el.appendChild(btn);
    }
  }
  function press(b) { if (!b) return; b.act(); card(); }
  function tip(b, btn) {
    const el = $(".pc-tip", P.box), W = P.W;
    let html = `<b>${esc(b.tip)}</b>${b.key ? ` <kbd>${esc(b.label || b.key)}</kbd>` : ""}`;
    if (b.note) html += `<span class="pc-tipnote">${esc(b.note)}</span>`;
    if (b.cost) html += `<span class="pc-cost"><i class="o"></i>${b.cost[0]}${b.cost[1] ? `<i class="v"></i>${b.cost[1]}` : ""}${b.supply ? `<i class="s"></i>${b.supply}` : ""}</span>`;
    if (b.req && b.req.length && !b.req.every(r => PC.Econ.has(W, P.me, r))) html += `<span class="pc-need">Needs ${b.req.map(r => esc(T()[r].name)).join(", ")}</span>`;
    el.innerHTML = html; el.hidden = false;
  }

  /* ---- the selection panel ---- */
  let panelKey = "";
  function panel() {
    const el = $(".pc-sel", P.box), W = P.W, s = selSlots();
    if (!el) return;
    const key = s.map(i => i + ":" + W.hp[i] + ":" + W.qLen[i] + ":" + (W.prog[i] >> 3) + ":" + W.carry[i]).join(",");
    if (key === panelKey) return;
    panelKey = key;
    if (!s.length) { el.innerHTML = ""; return; }
    if (s.length === 1) {
      const i = s[0], t = T()[W.type[i]], fl = W.flags[i];
      let html = `<div class="pc-port"></div><div class="pc-info"><h3>${esc(t.name)}</h3>`;
      if (fl & F.RESOURCE) html += `<p>${W.amount[i]} ${t.gather === 1 ? "ore" : "vapour"} left</p>`;
      else {
        html += `<p class="pc-hp"><span style="width:${Math.max(0, W.hp[i]) / t.hp * 100}%"></span></p><p>${Math.ceil(Math.max(0, W.hp[i]) / 4)} / ${t.hp / 4}</p>`;
        const w = t.weapons[0], arm = PC.Combat.armour(W, i);
        if (w) html += `<p class="pc-stat">${esc(w.name)}: ${PC.Combat.damage(W, i, w) / 4}${w.hits > 1 ? " x" + w.hits : ""} &middot; armour ${arm}${W.kills[i] ? ` &middot; ${W.kills[i]} kill${W.kills[i] > 1 ? "s" : ""}` : ""}</p>`;
        else if (!(fl & F.BUILDING)) html += `<p class="pc-stat">Armour ${arm}</p>`;
        if (t.energy) html += `<p class="pc-stat">Energy ${W.energy[i]} / ${t.energy}</p>`;
        if (W.stim[i]) html += `<p class="pc-stat pc-hot">Adrenal shot: ${Math.ceil(W.stim[i] / C.TICK)} s</p>`;
        if (W.matrix[i]) html += `<p class="pc-stat pc-hot">Defensive matrix: ${Math.ceil(W.matrix[i] / 4)} left</p>`;
        if (fl & F.CLOAKED) html += `<p class="pc-stat pc-hot">Cloaked</p>`;
        if (t.cargo || t.bunker) html += `<p class="pc-stat">Carrying ${PC.Orders.cargoUsed(W, i)} of ${PC.Orders.capacity(W, i)}</p>`;
        if (W.mode[i] === 4) html += `<p class="pc-stat pc-hot">In the air</p>`;
        if (fl & F.UNDER_CONSTRUCTION) html += `<p class="pc-prog"><span style="width:${W.prog[i] / Math.max(1, t.buildTicks) * 100}%"></span></p><p>Under construction</p>`;
        if (W.carry[i]) html += `<p class="pc-stat">Carrying ${W.amount[i]} ${W.carry[i] === 1 ? "ore" : "vapour"}</p>`;
        if (t.onVapour && !(fl & F.UNDER_CONSTRUCTION)) html += `<p class="pc-stat">${W.amount[i]} vapour left</p>`;
      }
      html += `</div>`;
      if ((fl & F.BUILDING) && W.qLen[i]) html += `<div class="pc-queue"></div>`;
      el.innerHTML = html;
      $(".pc-port", el).appendChild(icon(W.type[i], W.owner[i], 44));
      const q = $(".pc-queue", el);
      if (q) for (let k = 0; k < W.qLen[i]; k++) {
        const q = W.queue[i * 5 + k], R = PC.Data.RESEARCH, up = q >= R ? PC.Data.upgrades[q - R] : null;
        const b = document.createElement("button"); b.className = "pc-qi"; b.title = `${up ? up.name : T()[q].name}: click to cancel`;
        b.appendChild(up ? glyph(up.key.includes("armor") ? "armour" : up.key.includes("stim") ? "stim" : "weapons") : icon(q, W.owner[i], 18));
        if (k === 0) { const total = up ? up.ticks[Math.min(up.levels - 1, W.upg[W.owner[i] * 64 + up.id])] : T()[q].buildTicks; const pr = document.createElement("span"); pr.className = "pc-qp"; pr.style.width = (W.prog[i] / total * 100) + "%"; b.appendChild(pr); }
        b.addEventListener("click", ev => { ev.stopPropagation(); order(CMD.CANCEL, { tgt: k }, [i]); });
        q.appendChild(b);
      }
      return;
    }
    el.innerHTML = `<div class="pc-multi"></div>`;
    const grid = $(".pc-multi", el);
    s.slice(0, 24).forEach(i => {
      const t = T()[W.type[i]], b = document.createElement("button"), k = W.hp[i] / t.hp;
      b.className = "pc-mi " + (k > 0.66 ? "ok" : k > 0.33 ? "mid" : "low"); b.title = t.name;
      b.appendChild(icon(W.type[i], W.owner[i], 16));
      /* click: just that one; Shift-click: drop it from the selection */
      b.addEventListener("click", ev => { ev.stopPropagation(); select([i], ev.shiftKey); });
      grid.appendChild(b);
    });
    if (s.length > 24) { const m = document.createElement("span"); m.className = "pc-more"; m.textContent = "+" + (s.length - 24); grid.appendChild(m); }
  }

  /* ---- the top strip and the minimap ---- */
  function hud() {
    const W = P.W, me = P.me, top = $(".pc-top", P.box);
    if (!top) return;
    $(".pc-ore b", top).textContent = W.ore[me];
    $(".pc-vap b", top).textContent = W.vapour[me];
    const sup = $(".pc-sup", top);
    $("b", sup).textContent = `${W.supplyUsed[me]}/${Math.min(C.SUPPLY_MAX, W.supplyCap[me])}`;
    sup.classList.toggle("full", W.supplyUsed[me] >= W.supplyCap[me]);
    const sec = Math.floor(W.hdr[0] / C.TICK);
    $(".pc-clock", top).textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const idle = idleWorkers().length;
    $(".pc-idle", top).textContent = idle ? `${idle} idle` : "";
    if (P.msg.until && performance.now() > P.msg.until) { P.msg.until = 0; $(".pc-msg", P.box).classList.remove("on"); }
    panel();
    /* the card follows the state (a refinery done, a carrier home) */
    const sig = JSON.stringify(buttons().map(b => b && [b.key, b.glyph || b.type]));
    if (sig !== P.cardSig) { P.cardSig = sig; card(); }
    for (const btn of $(".pc-card", P.box).children) btn.classList.remove("na");
    cardButtons.forEach((b, k) => {
      if (!b) return;
      const no = (b.cost && (W.ore[me] < b.cost[0] || W.vapour[me] < b.cost[1])) || (b.req && !b.req.every(r => PC.Econ.has(W, me, r)));
      $(".pc-card", P.box).children[k].classList.toggle("na", !!no);
    });
  }
  function mini() { const c = $(".pc-mini", P.box); if (c) PC.RenderMinimap.draw(c.getContext("2d"), 84, P.W, P.me, V.camX, V.camY, V.view.w, V.view.h); }
  function idleWorkers() {
    const W = P.W, out = [];
    for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && (W.flags[i] & F.WORKER) && mine(i) && !W.oLen[i]) out.push(i);
    return out;
  }

  /* ---- what is drawn over the battlefield ---- */
  function drawOver(g) {
    const W = P.W, now = performance.now();
    /* the build ghost */
    if (P.mode && (P.mode.kind === "place" || P.mode.kind === "land") && P.mouse && inView(P.mouse[0], P.mouse[1])) {
      const t = T()[P.mode.type], [cx, cy] = siteAt(P.mouse[0], P.mouse[1], t), why = PC.Econ.canPlace(W, P.me, t, fp(cx), fp(cy), P.mode.worker ? live(P.mode.worker) : -1);
      const fr = Sp.frame(t.art, "idle", 0, 0);
      const sx = Math.round(cx - V.camX + V.view.x), sy = Math.round(cy - V.camY + V.view.y);
      if (fr && fr.r && fr.r[2]) { g.globalAlpha = 0.55; g.drawImage(PC.Sheets.sheet(fr.sheet, P.me), fr.r[0], fr.r[1], fr.r[2], fr.r[3], sx - fr.r[4], sy - fr.r[5], fr.r[2], fr.r[3]); g.globalAlpha = 1; }
      g.fillStyle = why ? "rgba(255,82,102,.35)" : "rgba(74,222,106,.3)";
      g.fillRect(sx - t.foot[0] * 12, sy - t.foot[1] * 12, t.foot[0] * 24, t.foot[1] * 24);
      g.strokeStyle = why ? "#ff5266" : "#4ade6a"; g.strokeRect(sx - t.foot[0] * 12 + 0.5, sy - t.foot[1] * 12 + 0.5, t.foot[0] * 24 - 1, t.foot[1] * 24 - 1);
    }
    /* the rally points of selected buildings */
    for (const i of selSlots()) if ((W.flags[i] & F.BUILDING) && mine(i) && (W.rallyX[i] || W.rallyY[i])) {
      const x = W.rallyX[i] / C.ONE - V.camX + V.view.x, y = W.rallyY[i] / C.ONE - V.camY + V.view.y, bx = W.x[i] / C.ONE - V.camX + V.view.x, by = W.y[i] / C.ONE - V.camY + V.view.y;
      g.strokeStyle = "rgba(84,242,255,.5)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#54f2ff"; g.fillRect(Math.round(x) - 1, Math.round(y) - 6, 1, 7); g.fillRect(Math.round(x), Math.round(y) - 6, 4, 3);
    }
    /* order flashes */
    flashes = flashes.filter(f => now - f.at < 400);
    for (const f of flashes) {
      const k = (now - f.at) / 400, x = f.wx - V.camX + V.view.x, y = f.wy - V.camY + V.view.y;
      g.strokeStyle = f.colour; g.globalAlpha = 1 - k;
      g.beginPath(); g.ellipse(Math.round(x) + 0.5, Math.round(y) + 0.5, 3 + k * 6, 2 + k * 4, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }
    /* the drag box */
    if (P.drag && P.drag.moved) {
      const [x0, y0] = P.drag.start, [x1, y1] = P.mouse;
      g.strokeStyle = "#4ade6a"; g.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
  /** The building site under screen point (lx, ly): its centre, snapped to whole tiles (a refinery snaps onto the nearest vent). */
  function siteAt(lx, ly, t) {
    const [wx, wy] = world(lx, ly);
    if (t.onVapour) {
      const W = P.W;
      let best = null, bd = 6 * C.TILE;
      for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.RESOURCE) && T()[W.type[i]].gather === 2) { const d = Math.hypot(W.x[i] / C.ONE - wx, W.y[i] / C.ONE - wy); if (d < bd) { bd = d; best = [W.x[i] / C.ONE, W.y[i] / C.ONE]; } }
      if (best) return best;
    }
    const tx = Math.round(wx / C.TILE - t.foot[0] / 2), ty = Math.round(wy / C.TILE - t.foot[1] / 2);
    return [(tx + t.foot[0] / 2) * C.TILE, (ty + t.foot[1] / 2) * C.TILE];
  }

  /* ---- scrolling ---- */
  const keysDown = Object.create(null);
  function scroll(dt) {
    const sp = dt * 0.45 * (P.scrollSpeed || 1);
    let dx = 0, dy = 0;
    if (keysDown.ArrowLeft) dx -= sp; if (keysDown.ArrowRight) dx += sp; if (keysDown.ArrowUp) dy -= sp; if (keysDown.ArrowDown) dy += sp;
    if (P.edge) { const [ex, ey] = P.edge; if (ex < 6) dx -= sp; if (ex > innerWidth - 7) dx += sp; if (ey < 6) dy -= sp; if (ey > innerHeight - 7) dy += sp; }
    if (dx || dy) { V.camX += dx; V.camY += dy; V.clamp(); }
  }

  /* ---- the end ---- */
  function judge() {
    if (P.ended) return;
    const W = P.W, standing = new Array(W.players.length).fill(0);
    for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && (W.flags[i] & F.BUILDING) && W.owner[i] < W.players.length) standing[W.owner[i]]++;
    const myTeam = W.players[P.me].team;
    const foes = standing.some((n, p) => n && W.players[p].team !== myTeam);
    if (!standing[P.me]) end("defeat");
    else if (!foes) end("victory");
  }
  function end(result) {
    P.ended = true; V.paused = true;
    const sec = Math.floor(P.W.hdr[0] / C.TICK);
    alertSheet(result === "victory" ? `Every enemy building is down, in ${Math.floor(sec / 60)} minutes ${sec % 60} seconds.` : "Your last building has fallen.", result === "victory" ? "Victory" : "Defeat")
      .then(() => { P.stop(); if (P.onEnd) P.onEnd(result); });
  }
  const extra = () => ({ title: P.title, cam: [V.camX, V.camY] });
  P.menuSheet = () => {
    if (document.querySelector(".gk-sheet")) return;
    V.paused = true;
    const SV = PC.Saves;
    const slots = () => SV.SLOTS.map(n => { const i = SV.info(n); return `<button data-save="${n}">Save in slot ${n}<span class="pc-note"> ${i ? esc(i.label) : "empty"}</span></button>`; }).join("");
    const body = () => `<p>The game is paused.</p>` + (SV.canSlot ? `<div class="pc-col">${slots()}</div>` : `<p class="pc-note">This browser cannot pack saves small enough to keep here; save to a file instead.</p>`) +
      `<div class="pc-row"><button data-file>Save to a file</button></div><div class="pc-row"><button data-primary data-resume>Resume</button><button class="pc-danger" data-leave>Leave the game</button></div>`;
    PC.Sheet("Paused", body(), async (b, sh) => {
      if (b.hasAttribute("data-resume")) sh.close();
      else if (b.dataset.save) { const ok = await SV.toSlot(+b.dataset.save, P.W, extra()); sh.refresh(body()); say(ok ? `Saved in slot ${b.dataset.save}.` : "This browser's storage is full: save to a file instead."); }
      else if (b.hasAttribute("data-file")) SV.toFile(P.W, extra());
      else if (b.hasAttribute("data-leave")) {
        sh.close();
        confirmSheet("Leave this game? Anything since your last save is lost.", "Leave the game").then(yes => { if (yes) { P.stop(); if (P.onEnd) P.onEnd("quit"); } else V.paused = false; });
        return;
      }
    }, () => { if (!P.ended && V.running) V.paused = false; });
  };

  /* ---- input ---- */
  let ctl = null;
  function unwire() { if (ctl) ctl.abort(); ctl = null; }
  function wire(box) {
    unwire(); ctl = new AbortController();
    const sig = { signal: ctl.signal }, cv = V.canvas, mm = $(".pc-mini", box);
    let lastClick = { at: 0, i: -1 }, lastGroup = { at: 0, k: -1 };
    cv.addEventListener("contextmenu", e => e.preventDefault(), sig);
    box.addEventListener("contextmenu", e => e.preventDefault(), sig);
    cv.addEventListener("pointerdown", e => {
      const [lx, ly] = V.local(e);
      if (!inView(lx, ly)) return;
      const [wx, wy] = world(lx, ly);
      if (e.button === 2) {
        if (P.mode) { P.mode = null; card(); return; }
        smart(wx, wy, e.shiftKey);
        return;
      }
      if (e.button !== 0) return;
      if (P.mode) { target(wx, wy, e.shiftKey); return; }
      P.drag = { start: [lx, ly], moved: false };
      cv.setPointerCapture(e.pointerId);
    }, sig);
    cv.addEventListener("pointermove", e => { P.mouse = V.local(e); if (P.drag && Math.hypot(P.mouse[0] - P.drag.start[0], P.mouse[1] - P.drag.start[1]) > 3) P.drag.moved = true; }, sig);
    addEventListener("pointermove", e => { P.edge = [e.clientX, e.clientY]; }, sig);
    document.addEventListener("pointerleave", () => { P.edge = null; }, sig);
    cv.addEventListener("pointerup", e => {
      if (!P.drag || e.button !== 0) return;
      const [lx, ly] = V.local(e), d = P.drag; P.drag = null;
      if (d.moved) { boxSelect(d.start[0], d.start[1], lx, ly, e.shiftKey); return; }
      const [wx, wy] = world(lx, ly), i = pick(wx, wy), now = performance.now();
      if (i < 0) { if (!e.shiftKey) select([]); return; }
      const dbl = now - lastClick.at < 350 && lastClick.i === i;
      lastClick = { at: now, i };
      if ((dbl || e.ctrlKey || e.metaKey) && mine(i)) select(sameOnScreen(i), e.shiftKey);
      else select([i], e.shiftKey && mine(i));
    }, sig);
    const miniTo = e => { const r = mm.getBoundingClientRect(), m = P.W.map, s = Math.max(m.w, m.h) * C.TILE; return [(e.clientX - r.left) / r.width * s, (e.clientY - r.top) / r.height * s]; };
    mm.addEventListener("pointerdown", e => {
      const [wx, wy] = miniTo(e);
      if (e.button === 2) { smart(wx, wy, e.shiftKey); return; }
      V.centreOn(wx, wy); mm.setPointerCapture(e.pointerId); P.miniDrag = true;
    }, sig);
    mm.addEventListener("pointermove", e => { if (P.miniDrag) { const [wx, wy] = miniTo(e); V.centreOn(wx, wy); } }, sig);
    mm.addEventListener("pointerup", () => { P.miniDrag = false; }, sig);
    $(".pc-menu", box).addEventListener("click", () => P.menuSheet(), sig);
    addEventListener("keyup", e => { keysDown[e.key] = false; }, sig);
    addEventListener("blur", () => { for (const k in keysDown) keysDown[k] = false; }, sig);
    addEventListener("keydown", e => {
      if (document.querySelector(".gk-sheet")) return;   /* a sheet is open: its keys */
      keysDown[e.key] = true;
      if (e.key.startsWith("Arrow")) { e.preventDefault(); return; }
      if (e.key === "F10" || (e.key === "Escape" && !P.mode && P.menu === "main" && !cardButtons.some(b => b && b.key === "Escape"))) { e.preventDefault(); P.menuSheet(); return; }
      if (e.key === "Escape" && P.mode) { P.mode = null; card(); return; }
      if (e.key === "F1") { e.preventDefault(); const w = idleWorkers(); if (w.length) { P.idleAt = ((P.idleAt || 0) + 1) % w.length; const i = w[P.idleAt]; select([i]); V.centreOn(P.W.x[i] / C.ONE, P.W.y[i] / C.ONE); } return; }
      if (e.key === "Backspace") { e.preventDefault(); const W = P.W, halls = []; for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & F.ALIVE) && mine(i) && T()[W.type[i]].dropoff) halls.push(i); if (halls.length) { P.hallAt = ((P.hallAt || 0) + 1) % halls.length; const i = halls[P.hallAt]; select([i]); V.centreOn(W.x[i] / C.ONE, W.y[i] / C.ONE); } return; }
      if (/^[0-9]$/.test(e.key)) {
        const k = +e.key;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); P.groups[k] = selSlots().filter(mine).map(i => PC.World.id(P.W, i)); say(`Group ${k} set.`, 1200); return; }
        if (e.shiftKey) { P.groups[k] = [...new Set([...P.groups[k], ...selSlots().filter(mine).map(i => PC.World.id(P.W, i))])]; return; }
        const slots = P.groups[k].map(live).filter(i => i >= 0);
        if (!slots.length) return;
        const now = performance.now();
        if (lastGroup.k === k && now - lastGroup.at < 400) { const W = P.W; V.centreOn(slots.reduce((s, i) => s + W.x[i], 0) / slots.length / C.ONE, slots.reduce((s, i) => s + W.y[i], 0) / slots.length / C.ONE); }
        lastGroup = { at: now, k };
        select(slots);
        return;
      }
      if (e.key === "?") { e.preventDefault(); helpSheet(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const b = cardButtons.find(x => x && x.key === key);
      if (b) { e.preventDefault(); press(b); }
    }, sig);
  }
  /** A left-click while a targeting or building mode is waiting. */
  function target(wx, wy, shift) {
    const W = P.W, m = P.mode, x = fp(wx), y = fp(wy);
    if (m.kind === "place") {
      const t = T()[m.type], [cx, cy] = siteAt(P.mouse[0], P.mouse[1], t);
      const why = PC.Econ.canPlace(W, P.me, t, fp(cx), fp(cy), live(m.worker));
      if (why) { say(ERR[why]); PC.SFX.play("error"); return; }
      if (W.ore[P.me] < t.cost[0] || W.vapour[P.me] < t.cost[1]) { say(ERR[W.ore[P.me] < t.cost[0] ? "ore" : "vapour"]); PC.SFX.play("error"); return; }
      PC.Orders.issue(W, { t: W.hdr[0] + 1, p: P.me, k: CMD.BUILD, u: [m.worker], x: fp(cx), y: fp(cy), tgt: m.type, q: shift });
      flash(cx, cy, "#4ade6a");
      if (!shift) { P.mode = null; P.menu = "main"; card(); }
      return;
    }
    if (m.kind === "scan") { order(CMD.ABILITY, { tgt: PC.Orders.ABILITY.scan, x, y }, selSlots().filter(i => mine(i))); flash(wx, wy, "#54f2ff"); P.mode = null; card(); return; }
    if (m.kind === "land") {
      const t = T()[m.type], [cx, cy] = siteAt(P.mouse[0], P.mouse[1], t);
      PC.Orders.issue(W, { t: W.hdr[0] + 1, p: P.me, k: CMD.LAND, u: [m.b], x: fp(cx), y: fp(cy) });
      flash(cx, cy, "#4ade6a"); P.mode = null; card(); return;
    }
    if (m.kind === "ability") {
      const j = pick(wx, wy);
      if (j < 0 || W.owner[j] !== P.me) { say("Choose one of your own units."); return; }
      order(CMD.ABILITY, { tgt: m.ab, x: PC.World.id(W, j) });
      flash(wx, wy, "#54f2ff"); P.mode = null; card(); return;
    }
    if (m.kind === "rally") { const j = pick(wx, wy); order(CMD.RALLY, { x, y, tgt: j >= 0 ? PC.World.id(W, j) : 0 }, selSlots().filter(i => W.flags[i] & F.BUILDING && mine(i))); P.mode = null; card(); return; }
    const j = pick(wx, wy);
    if (m.cmd === CMD.ATTACK) order(CMD.ATTACK, j >= 0 && W.owner[j] !== P.me ? { tgt: PC.World.id(W, j), q: shift } : { x, y, q: shift });
    else if (m.cmd === CMD.GATHER || m.cmd === CMD.REPAIR) { if (j >= 0) order(m.cmd, { tgt: PC.World.id(W, j), q: shift }); }
    else order(m.cmd, { x, y, q: shift });
    flash(wx, wy, m.cmd === CMD.ATTACK ? "#ff5266" : "#4ade6a");
    if (!shift) { P.mode = null; card(); }
  }

  function helpSheet() {
    V.paused = true;
    alertSheet("Left-click or drag to select; right-click to move, attack, gather or set a rally point; Shift queues. The card's letters work as keys. Ctrl+0-9 makes a group, 0-9 calls it, twice to look. F1 finds an idle engineer, Backspace your command post. Arrows or the screen's edge scroll. F10 is the menu.", "How to play")
      .then(() => { V.paused = false; });
  }
})();
