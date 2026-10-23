/* PumaCraft -- sound. One AudioContext, a master bus (Sound, M) with a music
 * bus and an effects bus under it (games-meta STANDARD.md §8, §14). Every
 * sound is synthesised here: no audio files.
 *
 * The title theme is the first piece of the score: a slow D dorian pad under
 * a pulsing bass, an arpeggio that enters on the second pass and a lead that
 * answers it on the third. The adaptive engine that will mix the battle
 * score by intensity grows out of this scheduler. */
"use strict";
(() => {
  const S = PC.Store;
  const A = PC.Audio = {
    ac: null, master: null, music: null, fx: null,
    muted: S.flag(S.K.muted, false), musicOn: S.flag(S.K.music, true), timer: null,
  };
  A.ctx = () => {
    if (!A.ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      A.ac = new AC();
      A.master = A.ac.createGain(); A.master.connect(A.ac.destination);
      A.music = A.ac.createGain(); A.music.connect(A.master);
      A.fx = A.ac.createGain(); A.fx.connect(A.master);
      A.apply();
    }
    return A.ac;
  };
  A.apply = () => {
    if (!A.ac) return;
    A.master.gain.setTargetAtTime(A.muted ? 0 : 0.6, A.ac.currentTime, 0.03);
    A.music.gain.setTargetAtTime(A.musicOn ? 0.55 : 0, A.ac.currentTime, 0.05);
  };
  A.setMuted = m => { A.muted = m; S.setFlag(S.K.muted, m); A.apply(); };
  A.setMusic = on => { A.musicOn = on; S.setFlag(S.K.music, on); A.apply(); };

  /* ---- the title theme ---- */
  const BPM = 84, STEP = 60 / BPM / 4;          /* sixteenth notes */
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  /* the four chords, two bars each: Dm9, Bbmaj7, Gm9, A7sus4 -- as MIDI voicings */
  const CHORDS = [[50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [43, 50, 53, 57, 62], [45, 52, 55, 59, 62]];
  const BASS = [38, 34, 31, 33];
  const ARP = [0, 2, 3, 4, 3, 2, 1, 2];        /* indices into the chord, a step at a time */
  /* the lead: [step in the 128-step phrase, midi, length in steps] */
  const LEAD = [[0, 74, 6], [8, 72, 4], [12, 69, 4], [16, 70, 12], [32, 69, 6], [40, 67, 4], [44, 65, 4], [48, 67, 14],
    [64, 74, 6], [72, 76, 4], [76, 77, 4], [80, 74, 12], [96, 73, 6], [104, 76, 6], [112, 69, 14]];

  function voice(type, midi, at, len, peak, { cut = 0, detune = 0, attack = 0.01, release = null } = {}) {
    const ac = A.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = hz(midi); o.detune.value = detune;
    let out = o;
    if (cut) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; f.Q.value = 0.7; o.connect(f); out = f; }
    const rel = release === null ? len : release;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + Math.max(attack, len - rel * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + rel * 0.5);
    out.connect(g); g.connect(A.music);
    o.start(at); o.stop(at + len + rel * 0.5 + 0.05);
  }

  A.startTheme = () => {
    const ac = A.ctx();
    if (!ac || A.timer) return;
    let step = 0, next = ac.currentTime + 0.12;
    A.timer = setInterval(() => {
      while (next < ac.currentTime + 0.25) {
        const s = step % 128, bar = Math.floor(s / 32), pass = Math.floor(step / 128), chord = CHORDS[bar];
        /* the pad: the whole chord, swelled in over two bars */
        if (s % 32 === 0) for (let i = 1; i < chord.length; i++) {
          voice("sawtooth", chord[i], next, STEP * 31, 0.022, { cut: 900, detune: -6, attack: 1.4, release: 1.6 });
          voice("triangle", chord[i], next, STEP * 31, 0.03, { detune: 5, attack: 1.2, release: 1.6 });
        }
        /* the bass: a dotted pulse on the root */
        if (s % 8 === 0 || s % 8 === 3) voice("triangle", BASS[bar], next, STEP * 2.6, 0.32, { attack: 0.006, release: 0.2 });
        if (s % 16 === 0) voice("sine", BASS[bar] - 12, next, STEP * 6, 0.25, { attack: 0.01, release: 0.4 });
        /* the arpeggio, from the second pass */
        if (pass >= 1 && s % 2 === 0) voice("square", chord[ARP[(s / 2) % 8]] + 12, next, STEP * 1.6, 0.028, { cut: 2400, attack: 0.004, release: 0.12 });
        /* the lead, from the third */
        if (pass >= 2) for (const [at, m, n] of LEAD) if (at === s) voice("square", m, next, STEP * n, 0.035, { cut: 1800, detune: 3, attack: 0.03, release: 0.3 });
        next += STEP; step++;
      }
    }, 40);
  };
  A.stopTheme = () => { clearInterval(A.timer); A.timer = null; };
})();
