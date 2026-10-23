/* PumaCraft -- the browser's storage, every key <prefix>_<feature>_v<n>
 * (games-meta STANDARD.md §5). Every read and write is guarded: storage can
 * be missing, full or blocked, and the game must still run without it. All
 * greykit games share one origin, so nothing here ever clears the whole of
 * it -- Forget everything removes this game's keys by prefix. */
"use strict";
const PC = globalThis.PC = globalThis.PC || {};
(() => {
  const PREFIX = "pumacraft";
  const K = {
    muted: "pumacraft_muted_v1",
    music: "pumacraft_music_v1",
    speed: "pumacraft_speed_v1",
  };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, String(v)); return true; } catch (e) { return false; } };
  const flag = (k, d) => { const v = get(k, null); return v === null ? d : v === "1"; };
  const setFlag = (k, on) => put(k, on ? "1" : "0");

  /** Every key this game owns, in both storage areas, then a reload. */
  function forgetEverything() {
    for (const area of [globalThis.localStorage, globalThis.sessionStorage]) {
      try {
        const mine = [];
        for (let i = 0; i < area.length; i++) { const k = area.key(i); if (k && k.startsWith("pumacraft")) mine.push(k); }
        for (const k of mine) area.removeItem(k);
      } catch (e) { /* storage blocked: nothing to forget */ }
    }
    location.reload();
  }

  PC.Store = { PREFIX, K, get, put, flag, setFlag, forgetEverything };
})();
