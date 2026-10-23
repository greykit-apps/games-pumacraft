/* PumaCraft -- sound effects, synthesised. No audio files.
 *
 * Each sound is a recipe of oscillators and filtered noise with envelopes,
 * played on the effects bus (js/audio.js). A sound made by something on
 * the battlefield is panned by where it is on screen and quietens with its
 * distance off screen, so a fight across the map is a murmur and one in
 * view is loud. Twelve voices at once at most; the same sound twice within
 * 30 ms is played once; the bus runs through a compressor so a battle does
 * not clip.
 *
 * The PDF's weapons are metallic: square waves and bright noise, quick to
 * fall. Its acknowledgements are radio chirps -- two or three band-passed
 * square notes -- with the words on screen. */
"use strict";
(() => {
  const A = PC.Audio;
  const S = PC.SFX = { voices: 0, last: Object.create(null), view: null };
  let comp = null, noiseBuf = null;

  function out() {
    const ac = A.ctx();
    if (!ac) return null;
    if (!comp) {
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      comp.connect(A.fx);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 0x1234567;
      for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2147483648) - 1; }
    }
    return ac;
  }

  /* building blocks: a tone and a burst of noise, each into dest */
  function tone(ac, dest, t, { type = "square", f0 = 440, f1 = null, dur = 0.1, gain = 0.2, attack = 0.003 }) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(ac, dest, t, { dur = 0.1, gain = 0.2, f = 2000, q = 1, type = "bandpass", f1 = null }) {
    const n = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    n.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(dest); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
  }

  const RECIPES = {
    a_engineer: (ac, d, t) => hiss(ac, d, t, { dur: 0.09, gain: 0.12, f: 5200, q: 3 }),
    a_trooper: (ac, d, t) => { hiss(ac, d, t, { dur: 0.06, gain: 0.3, f: 3400, q: 0.8 }); tone(ac, d, t, { f0: 1400, f1: 500, dur: 0.05, gain: 0.08 }); },
    a_hornet: (ac, d, t) => { tone(ac, d, t, { type: "sine", f0: 180, f1: 60, dur: 0.18, gain: 0.35 }); hiss(ac, d, t + 0.01, { dur: 0.2, gain: 0.25, f: 900, q: 0.7, type: "lowpass", f1: 200 }); },
    hit: (ac, d, t) => tone(ac, d, t, { type: "triangle", f0: 900 + Math.random() * 300, dur: 0.03, gain: 0.05 }),
    dieSmall: (ac, d, t) => { tone(ac, d, t, { type: "sawtooth", f0: 520, f1: 140, dur: 0.22, gain: 0.12 }); hiss(ac, d, t, { dur: 0.15, gain: 0.12, f: 1200 }); },
    dieBig: (ac, d, t) => { hiss(ac, d, t, { dur: 0.9, gain: 0.5, f: 1400, q: 0.5, type: "lowpass", f1: 120 }); tone(ac, d, t, { type: "sine", f0: 90, f1: 35, dur: 0.6, gain: 0.4 }); },
    built: (ac, d, t) => { tone(ac, d, t, { type: "square", f0: 660, dur: 0.09, gain: 0.07 }); tone(ac, d, t + 0.1, { type: "square", f0: 990, dur: 0.16, gain: 0.07 }); },
    trained: (ac, d, t) => { tone(ac, d, t, { type: "square", f0: 880, dur: 0.05, gain: 0.05 }); tone(ac, d, t + 0.07, { type: "square", f0: 1175, dur: 0.07, gain: 0.05 }); },
    error: (ac, d, t) => { tone(ac, d, t, { type: "square", f0: 140, dur: 0.12, gain: 0.08 }); tone(ac, d, t + 0.15, { type: "square", f0: 110, dur: 0.16, gain: 0.08 }); },
    place: (ac, d, t) => { hiss(ac, d, t, { dur: 0.12, gain: 0.2, f: 400, type: "lowpass" }); tone(ac, d, t, { type: "sine", f0: 120, f1: 70, dur: 0.12, gain: 0.2 }); },
    weld: (ac, d, t) => hiss(ac, d, t, { dur: 0.05, gain: 0.05, f: 6000, q: 4 }),
    mine: (ac, d, t) => tone(ac, d, t, { type: "sine", f0: 1900 + Math.random() * 500, dur: 0.06, gain: 0.03 }),
    deposit: (ac, d, t) => tone(ac, d, t, { type: "triangle", f0: 520, f1: 780, dur: 0.06, gain: 0.03 }),
    stim: (ac, d, t) => { hiss(ac, d, t, { dur: 0.08, gain: 0.12, f: 3000, q: 6 }); tone(ac, d, t + 0.05, { type: "sawtooth", f0: 200, f1: 600, dur: 0.2, gain: 0.06 }); },
    a_howitzer: (ac, d, t) => { tone(ac, d, t, { type: "sine", f0: 140, f1: 50, dur: 0.25, gain: 0.35 }); hiss(ac, d, t, { dur: 0.25, gain: 0.3, f: 1200, q: 0.6, type: "lowpass", f1: 250 }); },
    a_howitzer_siege: (ac, d, t) => { tone(ac, d, t, { type: "sine", f0: 90, f1: 30, dur: 0.6, gain: 0.5 }); hiss(ac, d, t, { dur: 0.7, gain: 0.45, f: 900, q: 0.4, type: "lowpass", f1: 100 }); },
    a_strider: (ac, d, t) => { tone(ac, d, t, { type: "square", f0: 520, f1: 260, dur: 0.08, gain: 0.1 }); hiss(ac, d, t, { dur: 0.1, gain: 0.2, f: 2600, q: 0.8 }); },
    siege: (ac, d, t) => { tone(ac, d, t, { type: "sawtooth", f0: 90, f1: 140, dur: 0.6, gain: 0.08 }); hiss(ac, d, t + 0.5, { dur: 0.1, gain: 0.2, f: 300, type: "lowpass" }); },
    heal: (ac, d, t) => tone(ac, d, t, { type: "sine", f0: 880, f1: 1320, dur: 0.12, gain: 0.03 }),
    a_torcher: (ac, d, t) => hiss(ac, d, t, { dur: 0.3, gain: 0.28, f: 700, q: 0.5, type: "lowpass", f1: 2400 }),
    /* the radio chirp: notes as a list of frequencies */
    chirp: (ac, d, t, notes = [1046, 1318]) => {
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.2; bp.connect(d);
      hiss(ac, bp, t, { dur: 0.03, gain: 0.08, f: 2500 });
      notes.forEach((f, k) => tone(ac, bp, t + 0.035 + k * 0.06, { f0: f, dur: 0.05, gain: 0.09 }));
    },
  };

  /** Plays sound name; at world pixel (x, y) if given, else in the middle. */
  S.play = (name, x, y, arg) => {
    if (A.muted) return;
    const ac = out();
    if (!ac || ac.state !== "running") return;
    const now = ac.currentTime;
    if (S.last[name] && now - S.last[name] < 0.03) return;
    if (S.voices >= 12) return;
    let gain = 1, pan = 0;
    const v = S.view;
    if (v && x !== undefined) {
      const cx = v.camX + v.w / 2, cy = v.camY + v.h / 2, dx = (x - cx) / (v.w / 2), dy = (y - cy) / (v.h / 2);
      const off = Math.max(0, Math.max(Math.abs(dx), Math.abs(dy)) - 1);
      gain = Math.max(0, 1 - off * 0.8);
      if (gain <= 0.02) return;
      pan = Math.max(-1, Math.min(1, dx * 0.6));
    }
    const r = RECIPES[name];
    if (!r) return;
    S.last[name] = now;
    const g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    g.gain.value = gain;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(comp); } else g.connect(comp);
    S.voices++;
    setTimeout(() => { S.voices--; g.disconnect(); }, 1200);
    r(ac, g, now + 0.005, arg);
  };

  /** Speaks for this tick's events of world W, heard by player me. */
  S.events = (W, me) => {
    const C = PC.C, T = PC.Data.types, at = i => [W.x[i] / C.ONE, W.y[i] / C.ONE];
    for (const e of W.ev) {
      const [k, a, b] = e;
      if (k === "fire") { const [x, y] = at(a); if (PC.RenderSprites.shown(W, a)) S.play(e[3] in RECIPES ? e[3] : "a_trooper", x, y); }
      else if (k === "hit") { if (Math.random() < 0.3) { const [x, y] = at(a); S.play("hit", x, y); } }
      else if (k === "die") { const t = T[e[4]], x = e[2] / C.ONE, y = e[3] / C.ONE; S.play(t.foot || t.size === 2 ? "dieBig" : "dieSmall", x, y); }
      else if (k === "built" && W.owner[a] === me) S.play("built");
      else if ((k === "trained" || k === "researched") && W.owner[a] === me) S.play(k === "researched" ? "built" : "trained");
      else if (k === "siege") { const [x, y] = at(a); S.play("siege", x, y); }
      else if (k === "stim") { const [x, y] = at(a); S.play("stim", x, y); }
      else if (k === "heal") { const [x, y] = at(a); S.play("heal", x, y); }
      else if (k === "error" && a === me) S.play("error");
      else if (k === "place" && W.owner[a] === me) { const [x, y] = at(a); S.play("place", x, y); }
      else if (k === "weld") { const [x, y] = at(a); S.play("weld", x, y); }
      else if (k === "mine") { const [x, y] = at(a); S.play("mine", x, y); }
      else if (k === "deposit" && W.owner[a] === me) { const [x, y] = at(a); S.play("deposit", x, y); }
    }
  };
})();
