/* PumaCraft engine -- saves, replays and the state hash.
 *
 * A save is the game's header (map, players, seed) and every array in
 * W.state, base64, plus the commands still waiting. Loading it builds a new
 * world on the same map and pours the arrays back, so a loaded game is the
 * same game: tools/sim-check.js plays one on from a save and requires its
 * hash to match the game that never stopped.
 *
 * A replay is smaller: the header and the log of every command applied.
 * Played from the start it reproduces the game tick for tick, and the hash
 * checkpoints it carries say where it first went different if it ever does.
 *
 * The hash is FNV-1a, two lanes, over the bytes of every state array in
 * registration order. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const Fx = PC.Fixed;
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const DEC = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) DEC[B64.charCodeAt(i)] = i;
  const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  function enc(u8) {
    let out = "", i = 0;
    const parts = [];
    for (; i + 2 < u8.length; i += 3) {
      const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
      out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
      if (out.length > 65536) { parts.push(out); out = ""; }
    }
    if (i < u8.length) {
      const n = (u8[i] << 16) | ((i + 1 < u8.length ? u8[i + 1] : 0) << 8);
      out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : "=") + "=";
    }
    parts.push(out);
    return parts.join("");
  }
  function dec(s, into) {
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      const a = DEC[s.charCodeAt(i)], b = DEC[s.charCodeAt(i + 1)], c = DEC[s.charCodeAt(i + 2)], d = DEC[s.charCodeAt(i + 3)];
      const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
      if (o < into.length) into[o++] = n >> 16;
      if (c >= 0 && o < into.length) into[o++] = (n >> 8) & 255;
      if (d >= 0 && o < into.length) into[o++] = n & 255;
    }
    return o;
  }

  const S = PC.Serial = { enc, dec };

  /** The state hash, as 16 hex digits. */
  S.hash = W => {
    const h = [0x811c9dc5, 0x2c9277b5];
    for (const [, arr] of W.state) Fx.fnv(arr, h);
    return h[0].toString(16).padStart(8, "0") + h[1].toString(16).padStart(8, "0");
  };
  /** Which state array differs between two worlds, for a report. */
  S.diff = (A, B) => {
    for (let k = 0; k < A.state.length; k++) {
      const [name, a] = A.state[k], b = B.state[k][1];
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return name + "[" + i + "] " + a[i] + " vs " + b[i];
    }
    return null;
  };

  const header = W => ({ v: 1, map: W.map.id, players: W.players.map(p => ({ faction: p.faction, team: p.team })), seed: W.seed });

  S.save = W => {
    const arrays = {};
    for (const [name, arr] of W.state) arrays[name] = enc(bytes(arr));
    return Object.assign(header(W), { kind: "save", arrays, pending: W.pending.map(c => Object.assign({}, c)), log: W.log.map(c => Object.assign({}, c)) });
  };

  S.load = save => {
    if (!save || save.kind !== "save" || save.v !== 1) throw new Error("not a PumaCraft save");
    const def = PC.Map.registry[save.map];
    if (!def) throw new Error("this save's map is missing: " + save.map);
    const W = PC.newWorld(def, save.players, save.seed);
    for (const [name, arr] of W.state) {
      const s = save.arrays[name];
      if (typeof s !== "string") throw new Error("this save lacks " + name);
      const u8 = bytes(arr), n = dec(s, u8);
      if (n !== u8.length) throw new Error("this save's " + name + " is the wrong size");
    }
    W.seed = save.seed;
    W.pending = save.pending.map(c => Object.assign({}, c));
    W.log = save.log.map(c => Object.assign({}, c));
    PC.Sim.rebuild(W);
    return W;
  };

  S.replay = (W, checkpoints) => Object.assign(header(W), { kind: "replay", log: W.log.map(c => Object.assign({}, c)), checkpoints: checkpoints || [] });
})();
