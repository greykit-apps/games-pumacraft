/* PumaCraft -- saved games.
 *
 * A save is the engine's own (PC.Serial.save: every state array and the
 * commands still waiting), as JSON, deflated with the browser's
 * CompressionStream and kept base64 in localStorage under
 * pumacraft_save_<slot>_v1 -- three slots, and an autosave every five game
 * minutes in slot 0. A short index of what is in each slot sits in
 * pumacraft_saves_v1. All greykit games share this browser's storage (about
 * 5 MB between them), so a slot is a few tens of kilobytes at most, and any
 * save can also be written out as a file and read back in.
 *
 * Where CompressionStream is missing the slots are not used at all: an
 * uncompressed save is too big to be a good neighbour. Files still work. */
"use strict";
(() => {
  const S = PC.Store;
  const SV = PC.Saves = { SLOTS: [1, 2, 3], AUTO: 0 };
  const key = n => "pumacraft_save_" + n + "_v1";
  const INDEX = "pumacraft_saves_v1";
  SV.canSlot = typeof CompressionStream === "function" && typeof DecompressionStream === "function";

  const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function deflate(text) { const st = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate")); return new Uint8Array(await new Response(st).arrayBuffer()); }
  async function inflate(u8) { const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate")); return await new Response(st).text(); }

  SV.index = () => { try { return JSON.parse(S.get(INDEX, "{}")) || {}; } catch (e) { return {}; } };
  /** What slot n holds, for a menu: { when, label } or null. */
  SV.info = n => SV.index()[n] || null;

  /** Saves world W (with the screen's own extras) into slot n; resolves true, or false if storage refused. */
  SV.toSlot = async (n, W, extra) => {
    if (!SV.canSlot) return false;
    const blob = b64(await deflate(JSON.stringify(Object.assign(PC.Serial.save(W), { extra }))));
    if (!S.put(key(n), blob)) return false;
    const idx = SV.index(), sec = Math.floor(W.hdr[0] / PC.C.TICK);
    idx[n] = { when: Date.now(), label: `${extra && extra.title || "Skirmish"}, ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} in` };
    S.put(INDEX, JSON.stringify(idx));
    return true;
  };
  /** The save in slot n, parsed; null if there is none or it cannot be read. */
  SV.fromSlot = async n => {
    const s = S.get(key(n), null);
    if (!s || !SV.canSlot) return null;
    try { return JSON.parse(await inflate(unb64(s))); } catch (e) { return null; }
  };
  SV.latest = () => { const idx = SV.index(); let best = null; for (const n in idx) if (!best || idx[n].when > idx[best].when) best = n; return best; };

  /** Offers the save as a file to keep. */
  SV.toFile = async (W, extra) => {
    const json = JSON.stringify(Object.assign(PC.Serial.save(W), { extra }));
    const data = SV.canSlot ? await deflate(json) : new TextEncoder().encode(json);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
    const d = new Date();
    a.download = `pumacraft-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.pcsave`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  /** Asks for a .pcsave file; resolves the parsed save or null. */
  SV.fromFile = () => new Promise(resolve => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".pcsave,application/octet-stream";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return resolve(null);
      const u8 = new Uint8Array(await f.arrayBuffer());
      try { resolve(JSON.parse(u8[0] === 0x7b ? new TextDecoder().decode(u8) : await inflate(u8))); } catch (e) { resolve(null); }
    };
    inp.click();
  });
})();
