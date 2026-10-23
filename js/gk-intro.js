/* @gk-intro-begin v0.4 -- greykit.games shared code (games-meta STANDARD.md §14),
 * the integrated intro. A guideline, not a rule: nothing checks it, and a game
 * may take it, change its copy, or leave it. The copy of record is games-meta's
 * canon/gk-intro.js; a game that takes a newer version takes it whole.
 * Needs the @gk-title block loaded first (runBoot, reduced, escHTML,
 * decodeTitle, revealTitle) and changes nothing in it: the boot stays canon's
 * byte for byte, and this drives it from outside. Plain script, no imports or
 * exports, so a single-file game can paste it into a classic <script>.
 *
 * The integrated intro, in order:
 *   1. canon's boot, with a boot sound of the game's (silent on a cold load:
 *      the browser holds audio back until the page has been touched);
 *   2. the boot holds at its end on "Click or press a key to continue" --
 *      that press is what lets the title's music play;
 *   3. the boot fades quickly and the title fades in over the game's own
 *      live or drawn scene, the title music starting;
 *   4. the name arrives on a timer; then the menu prints in as the shade
 *      comes up behind it, with the Sound and Music switches top right and
 *      the greykit.com credit centred under the menu.
 * A key or a click during 3-4 skips to the end of it. */

const GK_INTRO_VERSION = "0.4";

const INTRO_CSS = `
/* ---- the hold at the end of the boot ---- */
.gk-boot.gki-hold{cursor:pointer}
.gk-boot.gki-hold .gk-skip{display:none}
.gk-boot .gki-prompt{position:absolute;left:16px;right:16px;top:calc(50% + var(--S) / 2 + 84px);text-align:center;
  font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--text);opacity:0;
  animation:gki-in .5s ease-out forwards,gki-breathe 2.6s ease-in-out .5s infinite}
.gk-boot .gki-prompt::before,.gk-boot .gki-prompt::after{content:"";display:inline-block;width:6px;height:6px;margin:0 14px 2px;
  border:1px solid var(--accent);transform:rotate(45deg)}
@keyframes gki-in{to{opacity:1}}
/* the cat blinks while it waits, as greykit.com's mark does (greykitweb
   consulting/index.html, .hero-mark .lid): an eyelid in the face's silver --
   the mark is drawn inverted at brightness .72 -- closing over the eye, every
   eight seconds, the first soon after the hold. The boot shows the mark
   flipped, so the lid sits mirrored from the site's, at +6deg, a little larger
   so it covers the whole eye (71-90% across, 45-60% down the flipped mark). */
.gk-boot .gki-lid{position:absolute;left:66.5%;top:41%;width:29%;height:24%;background:#b8b8b8;border-radius:50%;
  transform:rotate(6deg) scaleY(0);transform-origin:50% 10%;pointer-events:none}
.gk-boot.gki-hold .gki-lid{animation:gki-blink 8s ease-in-out -6s infinite}
@keyframes gki-blink{0%,92.5%{transform:rotate(6deg) scaleY(0)}94%,95.2%{transform:rotate(6deg) scaleY(1)}96.7%,100%{transform:rotate(6deg) scaleY(0)}}
@keyframes gki-breathe{0%,100%{opacity:1}50%{opacity:.42}}

/* the boot log's flavour line: quieter than the facts */
.gk-boot .gk-log i{color:color-mix(in srgb,var(--dim) 85%,transparent)}

/* ---- the integrated title: the credit centred under the menu (gkIntegrate
   moves the footer there), the switches top right ---- */
.gk-title.gki main>footer{width:min(460px,100%);margin-top:18px;text-align:center;font-size:16px;letter-spacing:.02em;color:var(--t-dim)}
/* the credit: the words lower-cased on screen (the page keeps §1's string
   byte for byte), the name lit in the title's highlight */
.gk-title.gki .gk-credit{text-transform:lowercase}
.gk-title.gki .gk-credit a{color:var(--t-hi,var(--accent));text-decoration:none}
.gk-title.gki .gk-credit a:hover,.gk-title.gki .gk-credit a:focus-visible{text-decoration:underline;text-underline-offset:3px}
.gki-toggles{position:absolute;z-index:2;top:20px;right:24px;display:flex;gap:10px}
.gki-tg{display:flex;align-items:center;gap:9px;height:36px;padding:0 10px 0 11px;font:inherit;color:var(--t-ink,var(--text));cursor:pointer;
  background:var(--t-panel,var(--panel));border:1px solid var(--t-line,var(--line));border-radius:18px}
.gki-tg:hover{border-color:var(--t-focus,var(--accent))}
.gki-tg:focus-visible{outline:2px solid var(--t-focus,var(--accent));outline-offset:2px}
.gki-tg svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gki-tg .gki-sw{position:relative;width:32px;height:18px;border-radius:9px;box-sizing:border-box;
  border:1px solid var(--t-line,var(--line));background:color-mix(in srgb,var(--bg) 70%,transparent);transition:background .18s,border-color .18s}
.gki-tg .gki-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
  background:var(--t-dim,var(--dim));transition:transform .18s cubic-bezier(.3,.7,.4,1),background .18s}
.gki-tg[aria-pressed="true"] .gki-sw{background:color-mix(in srgb,var(--t-focus,var(--accent)) 30%,transparent);border-color:var(--t-focus,var(--accent))}
.gki-tg[aria-pressed="true"] .gki-sw::after{transform:translateX(14px);background:var(--t-focus,var(--accent))}
.gki-tg[aria-pressed="false"]{color:var(--t-dim,var(--dim))}
/* music the master Sound switch has silenced: still its own switch, dimmed */
.gki-tg.gki-held{opacity:.5}
@media (max-width:640px){.gki-toggles{top:12px;right:12px;gap:6px}.gki-tg{height:32px;padding:0 8px;gap:7px}}

/* ---- the entrance: everything but the scene waits; the name on its timer,
   then the menu, the shade (the tint), the switches and the credit together ---- */
.gk-title.gki-intro>.gk-shade,.gk-title.gki-intro h1>span,.gk-title.gki-intro .gk-sub,.gk-title.gki-intro .gk-menu,
.gk-title.gki-intro main>footer,.gk-title.gki-intro .gki-toggles,.gk-title.gki-intro h1 .gki-w{opacity:0}
.gk-title.gki-intro h1>span.gki-on{opacity:1;transition:opacity 1.4s ease-in-out}
.gk-title.gki-intro h1 .gki-w.gki-on{opacity:1;transition:opacity 1.4s ease-in-out}
.gk-title.gki-intro.gki-menu>.gk-shade,.gk-title.gki-intro.gki-menu .gk-sub,.gk-title.gki-intro.gki-menu .gk-menu,
.gk-title.gki-intro.gki-menu main>footer,.gk-title.gki-intro.gki-menu .gki-toggles{opacity:1;transition:opacity 1s ease-out}
.gk-title h1 .gki-w{display:inline;color:inherit}
/* the title fading up from the boot's ground */
.gk-title.gki-fade{animation:gki-in .6s ease-out both}
@media (prefers-reduced-motion:reduce){.gk-title.gki-fade{animation:none}}
`;

function injectIntroCSS() {
  if (!document.getElementById("gk-intro-css")) document.head.insertAdjacentHTML("beforeend", '<style id="gk-intro-css">' + INTRO_CSS + "</style>");
}

/* @gk-meow-begin -- the cat on the pulse: a recording, trimmed, levelled and
   encoded as MP3 by games-meta's tools/build-meow.sh, which rewrites this
   block. Empty, the boot sound falls back to the arcade's coin. */
const GK_MEOW = "data:audio/mpeg;base64,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q6KCQlGntfT/3OySKNXH72WiYkg8QGYGvCax6yIQCx7K3CJiiJp/ovWyADiqf6lSBiTUWbM/6kkzyiuKABFJkkSjEUBcOBkWD1pDWv/7UsRcgApobU0mGG7BTIxq9MSYoEdSvUnKe/QtlOsSzEwQsCOqKNcrUN/Qf7dRigsQNFloY8DlnhQHBRwjAgBHryLli67KU1fud/6P49XzVobpkD5506+V0JLMxTAcRgFOBMOgoBbJMUmARCYITTaTiUiCgJO99YHZhVKH6S4M6lSYfFnOHCMUmpN5UgePTK62JMve7pQMAh8fHcmhPjG33XO7/6KBOup273SAHyNIhnA7gKQko5j+dkNQ2EyhY5yJAsG5kp6iPoaVjcjIACZo//tSxGcAClhrSweww8FKC+twxIx86l6BdBFgmiA4REyGvKWIrsIjg0AGF0vY1THU/YXGfobtW+9r1F8tmS/FxQROsxgDN1ULCoGiQfNOEoGNjBWlxKHmm+BhxhdN1PGMZu5pTZUvERMcmYSkzeBTh8PgIkCDhCNA50mxwwCsNHkeYOJY7U7vZeLL/3L9+70VCXjbQALfNgMhSoGsnh4Qh+fKR+JVzsprSwkHgb0aOV/K0qCiVyggJaZnLVrN1u51tq14lNHoWcpRklHuLIFj6BD/+1LEcgAKaFVZZhhsoTyM6rDWGDAIkxUIi08ZbV05r/qHXfqR0MXnNXWgBngAkAACoMAaPGQdCiEUBMyieNiyIoGtTUUmLYoUfuFIkFupUyx8yIub5GfxmEMKHU6FgmMBJp5jxUUJF0XW7CJqI1HdVTq+99oDLDEF6itG0AACMtJg9A6gAdBqnsFQbCgjGkTdGCF6hMqpAPsmJw6zspirnpPIgU8RB4Ho8rHDyxuba4sWe0FDYKw7266ehX66xkkszrutppil+9i3MpUMsUmAB//7UsR+gApkqVOGDFJBS5IqcJMNzPXgqTXJqYLkZjC3KRXNLC6U4BCBP5qLnJJ4V5gWqUspxIGo+z1Ky7O0rOhXuVmuJMs8kPFbsK1jY8Y/JS3NWZ5gszJVtZvRTO+y+pR5XSoAuOUACrSCyjGBe0NMSn61Rxok/1C5NFm7spis5RIsJhc7lVrHJejTB0nJPNbPokl6kpcwYVa/UBI4FREPDZUBPAQwSgIClgalRoV8RRK5Qd/LAA0BBhylAXM2ixHKil9dhA5Gpo0xkVB8kEwV//tSxImACkRTSYYkxwFNEmfs8xWgDxsyysdQNuaQkRxGw+INgIVMgsLC5EBCwsI3eaCoq32OqIu//60UqaZb///8BC9MQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+1LElIAKRJEvjBhPQScKX4jzJRBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=="; /* from DJI_0017.MP4, cleaned 8 dB, 87.24-88.02 s */
/* @gk-meow-end */

/* the meow, decoded once per context; null when there is none or it will not decode */
const gkMeowCache = new WeakMap();
function gkMeowBuffer(ac) {
  if (!GK_MEOW || !ac) return Promise.resolve(null);
  if (!gkMeowCache.has(ac)) {
    const bin = atob(GK_MEOW.slice(GK_MEOW.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    gkMeowCache.set(ac, new Promise(res => ac.decodeAudioData(bytes.buffer, res, () => res(null))).catch(() => null));
  }
  return gkMeowCache.get(ac);
}

/* when canon's logo finishes: the face pulses and glints from 1.15 s for 0.7 s */
const GK_LOGO_END = 1.85;

/**
 * The default boot sound: the cat's meow, and nothing else, placed so it ends
 * as the logo's animation does (GK_LOGO_END). Where there is no recording,
 * greykit.com/arcade's coin, ending there too.
 *   ac, out   the AudioContext and the node to play into
 *   since     seconds since the boot started (startIntro passes it: the sound
 *             starts only once the browser has said it may play, a moment in)
 *   rate      the meow's playback rate: below 1 a bigger, lower cat, above 1 a
 *             kitten (default 1); it still ends with the logo
 *   meow      false plays the coin even with a recording
 *   gain      the meow's level (default 0.6: 4.4 dB under the recording as
 *             levelled to -16 LUFS, so it sits under the title music that follows)
 */
function gkBootSound(ac, out, { since = 0, rate = 1, meow = true, gain = 0.6 } = {}) {
  const now = ac.currentTime, end = now + Math.max(0, GK_LOGO_END - since);
  /* greykit.com/arcade's coin, the sound a game is launched with there
     (greykitweb arcade/index.html, TUNES.coin and blip): B5 then E6 on a
     square wave, each falling away, at the arcade's own level */
  const coin = () => {
    const notes = [[988, 0.07], [1319, 0.24]];
    let at = Math.max(ac.currentTime + 0.01, end - notes.reduce((n, [, len]) => n + len, 0));
    for (const [f, len] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.035, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + len + 0.02);
      at += len;
    }
  };
  if (!meow || !GK_MEOW) return coin();
  gkMeowBuffer(ac).then(buf => {
    if (!buf) return coin();
    const len = buf.duration / rate, at = end - len;
    /* decoded too late to end on time: start it at once rather than lose
       it -- unless the logo has already finished */
    if (ac.currentTime > end) return;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.value = gain;
    s.connect(g);
    g.connect(out);
    s.start(Math.max(ac.currentTime + 0.01, at));
  });
}

/**
 * The menu's tick: a dry click with a little pitch in it, for a row coming
 * under the pointer or the arrow keys. Short and quiet, so a run of them down
 * the menu reads as one gesture. It is an effect, not music: play it into the
 * game's effects, under the Sound switch, so it is what you hear with the
 * music off.
 *   ac, out   the AudioContext and the node to play into
 *   freq      the blip's pitch in Hz (default 2400)
 *   gain      level (default 0.12)
 */
function gkTick(ac, out, { freq = 2400, gain = 0.12 } = {}) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, bus = ac.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  /* the click: 12ms of noise through a bandpass, falling fast */
  const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 0.015 | 0, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  n.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 1.6;
  bp.Q.value = 2;
  n.connect(bp);
  bp.connect(bus);
  n.start(t);
  /* the pitch: a 30ms sine blip under it */
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.03);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + 0.04);
}

/**
 * Ticks for a title's menu and switches: one when a row comes under the
 * pointer, and one when the keys move the focus to it. Not when the game
 * focuses a row itself (the default, as the menu lands), and not twice for
 * one row. Listens on the .gk-title, so a title mounted again needs it again.
 *   tick()   plays the tick -- the game's, into its effects
 */
function gkMenuTicks(title, tick) {
  let last = null;
  const rows = ".gk-menu button, .gki-tg";
  const hit = b => { if (b === last) return; last = b; try { tick(); } catch (e) { /* no sound */ } };
  title.addEventListener("pointerover", ev => {
    const b = ev.target.closest(rows);
    if (b && title.contains(b)) hit(b);
    else if (!b) last = null;
  });
  if (!gkMenuTicks.keys) { gkMenuTicks.keys = -1e9; window.addEventListener("keydown", () => { gkMenuTicks.keys = performance.now(); }, true); }
  title.addEventListener("focusin", ev => {
    const b = ev.target.closest(rows);
    if (b && performance.now() - gkMenuTicks.keys < 250) hit(b);
  });
}

/**
 * Whether this page may play sound now, without waiting for a press: after a
 * launcher's click (greykit.com/arcade goes to the game in the same tab), or on
 * a site the browser trusts. Firefox says so outright (getAutoplayPolicy);
 * elsewhere, a context the browser allows starts running within a moment of
 * resume(), and one it holds back does not start until the page is touched.
 * Resolves true or false within ms.
 *   ac   an AudioContext (the game's, or the intro's own)
 */
function gkSoundAllowed(ac, ms = 250) {
  return new Promise(resolve => {
    if (!ac) return resolve(false);
    try {
      if (navigator.getAutoplayPolicy) {
        const p = navigator.getAutoplayPolicy(ac);
        if (p === "allowed") return resolve(true);
        if (p === "disallowed") return resolve(false);
      }
    } catch (e) { /* not this browser's; ask the context */ }
    if (ac.state === "running") return resolve(true);
    let done = false;
    const end = ok => { if (!done) { done = true; resolve(ok); } };
    setTimeout(() => end(ac.state === "running"), ms);
    ac.resume().then(() => end(ac.state === "running"), () => end(false));
  });
}

/**
 * The boot log's lines are what the game passes startIntro, and the boot has
 * room for three before it ends (one every 0.55 s from 0.15 s): canon's
 * bootReloadLine(), a fact, and a flavour line. More would lengthen the boot.
 *
 * A fact: "label: value", the value lit -- what someone debugging wants to
 * see first, such as gkFact("save", "night 2") or gkFact("save", "none").
 */
function gkFact(label, value) {
  return escHTML(label) + ": <b>" + escHTML(value) + "</b>";
}

/**
 * A flavour line: one of the game's themed lines, picked at random and shown
 * quieter than the facts. About one load in rareChance (12), one of the rare
 * lines comes up instead -- the easter egg.
 */
function gkFlavour(lines, rare = [], rareChance = 12) {
  const pick = a => a[Math.random() * a.length | 0];
  const line = rare.length && Math.random() * rareChance < 1 ? pick(rare) : lines.length ? pick(lines) : "";
  return line ? "<i>" + escHTML(line) + "</i>" : "";
}

/**
 * Start the integrated intro: canon's boot, and the boot sound with it.
 *   lines      the boot log's first lines, as runBoot takes them
 *   audio()    optional: the game's AudioContext, made or found. Its sound
 *              plays there, and the continue press resumes it. Left out, the
 *              intro keeps a small context of its own for the boot sound.
 *   bootSound  (ac, out, { since }) => void, the game's own -- since is the
 *              seconds the boot has run; gkBootSound is the default, and false
 *              plays none
 * Returns { finish(opts), cancel() }. Mount the title under the boot while
 * it runs, then call finish() once the game is ready.
 */
function startIntro({ lines = [], audio = null, bootSound = gkBootSound } = {}) {
  injectIntroCSS();
  const t0 = performance.now();
  const boot = runBoot({ lines });
  const el = document.body.lastElementChild && document.body.lastElementChild.classList.contains("gk-boot") ? document.body.lastElementChild : null;
  /* the eyelid, shut away until the hold */
  const face = el && el.querySelector(".gk-lh .gk-pulse");
  if (face) face.insertAdjacentHTML("beforeend", '<div class="gki-lid"></div>');
  let ac = null;
  try { ac = audio ? audio() : null; } catch (e) { ac = null; }
  if (!ac && el && bootSound) {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ac = AC ? new AC() : null; } catch (e) { ac = null; }
  }
  /* may this page play sound already -- a launcher's click before it, or a
     site the browser trusts? The boot sound plays only then: a context the
     browser is holding back would play it later, late, over the title's music.
     The same answer lets finish() skip the hold. */
  const allowed = ac ? gkSoundAllowed(ac) : Promise.resolve(false);
  /* decode the meow now, so it is ready by the pulse */
  if (ac && bootSound === gkBootSound) gkMeowBuffer(ac);
  if (ac && el && bootSound) allowed.then(ok => { if (ok) try { bootSound(ac, ac.destination, { since: (performance.now() - t0) / 1000 }); } catch (e) { /* no sound */ } });

  /* the press that continues: any key but Escape and a lone modifier (the
     browser does not count those as a touch of the page), or any click.
     It resumes the audio there and then, inside the gesture, which some
     browsers insist on. */
  let pressed = false, onPress = null;
  const press = ev => {
    if (ev.type === "keydown" && (ev.key === "Escape" || ["Shift", "Control", "Alt", "Meta"].includes(ev.key))) return;
    if (ac && ac.state !== "running") ac.resume().catch(() => {});
    pressed = true;
    if (onPress) onPress();
  };
  window.addEventListener("keydown", press, true);
  window.addEventListener("pointerdown", press, true);
  const unhook = () => { window.removeEventListener("keydown", press, true); window.removeEventListener("pointerdown", press, true); };
  const say = html => {
    const log = el && el.querySelector(".gk-log");
    if (!log) return;
    const d = document.createElement("div");
    d.innerHTML = "&gt; " + html;
    log.appendChild(d);
  };

  return {
    /**
     * Finish the boot, hold for the press, and bring the title in.
     *   more        lines for the log now the game has loaded, as HTML. Each
     *               adds 0.3 s to the boot: the log's facts and flavour belong in
     *               startIntro's lines instead (gkFact, gkFlavour)
     *   prefix      the game's storage prefix (STANDARD.md §5): with it, the
     *               console's [boot] line says what this browser keeps for it
     *   title       the mounted .gk-title (the page's, if left out)
     *   name        how the name arrives: "lines" (each line fades in on its
     *               turn), "words" (a word at a time), "decode" (canon's decode)
     *   timing      { name, step, menu, done } in ms after the title starts:
     *               the name's first line, the gap between lines or words, the
     *               menu, and the end of the fades
     *   prompt      the hold's words; "Click or press a key to continue", or
     *               "Tap to continue" on a touchscreen
     *   hold        "auto" (the default): hold only when the browser will not
     *               play sound yet -- coming from a launcher's click (the
     *               arcade), or on a site the browser already trusts, the boot
     *               goes straight into the title; "always": hold every time;
     *               "never": a silent game's, which has no sound to let play
     *   toggles     { sound: { get, set }, music: { get, set } } for the
     *               switches top right (gkToggles); left out, none
     *   tick        plays the menu's tick into the game's effects (gkTick is the
     *               sound to play); left out, the menu is silent
     *   onContinue  the press: resume the game's audio here (inside the gesture)
     *   onTitle     the title starts: start the title music here
     *   onDone      the menu is in and focused
     * Resolves when the menu is in, or the entrance was skipped.
     */
    async finish({ more = [], prefix = "",
      title = document.querySelector(".gk-title"), name = "lines", timing = {}, prompt = null, hold = "auto",
      toggles = null, tick = null, onContinue = () => {}, onTitle = () => {}, onDone = () => {} } = {}) {
      const T = Object.assign({ name: 600, step: 700, menu: 3000, done: 4200 }, timing);
      /* a touchscreen has no keys to press */
      if (!prompt) prompt = matchMedia("(hover: none) and (pointer: coarse)").matches ? "Tap to continue" : "Click or press a key to continue";
      const sw = title ? gkIntegrate(title, { toggles, tick }) : null;
      const focus = () => { const b = title && (title.querySelector(".gk-primary") || title.querySelector(".gk-menu button")); if (b) b.focus({ preventScroll: true }); };

      /* no boot (reduced motion, or a game that skipped it): the title at
         once, still; the music starts now if the page may play, else at the
         first touch of the page, and that touch still does what it was for */
      if (!el && !pressed && await allowed) pressed = true;
      if (!el) {
        unhook();
        const first = ev => {
          if (ev.type === "keydown" && (ev.key === "Escape" || ["Shift", "Control", "Alt", "Meta"].includes(ev.key))) return;
          window.removeEventListener("keydown", first, true);
          window.removeEventListener("pointerdown", first, true);
          if (ac && ac.state !== "running") ac.resume().catch(() => {});
          onContinue();
          onTitle();
        };
        if (pressed) { onContinue(); onTitle(); }
        else { window.addEventListener("keydown", first, true); window.addEventListener("pointerdown", first, true); }
        boot.cancel();
        focus();
        onDone();
        return { toggles: sw };
      }

      /* the title waits behind the boot, everything but its scene hidden */
      const later = title ? [...title.querySelectorAll(".gk-menu, footer, .gki-toggles")] : [];
      if (title) { title.classList.add("gki-intro"); for (const n of later) n.inert = true; }

      /* the intro's own facts, for whoever is debugging: the console, never the screen */
      /* hold for the press only when it would let sound play -- or always if
         asked; never for a silent game (hold: "never"), which has no sound to let play */
      const ok = await allowed, holding = !pressed && hold !== "never" && (!ok || hold === "always");
      const auto = [["audio", hold === "never" ? "none (silent game)" : ok ? (holding ? "allowed; holding anyway" : "allowed") : "waiting for a press"]];
      if (toggles && toggles.sound && !toggles.sound.get()) auto.push(["sound", "off"]);
      if (toggles && toggles.music && !toggles.music.get()) auto.push(["music", "off"]);
      if (prefix) {
        let n = 0, size = 0;
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) { n++; size += k.length + (localStorage.getItem(k) || "").length; } } } catch (e) { n = -1; }
        /* UTF-16: two bytes a character */
        const bytes = size * 2, kept = bytes < 1024 ? bytes + " bytes" : (bytes / 1024).toFixed(1) + " KB";
        auto.push(["this browser", n < 0 ? "storage blocked" : n ? n + (n === 1 ? " key, " : " keys, ") + kept : "nothing kept"]);
      }
      auto.push(["intro", "v" + GK_INTRO_VERSION]);
      try { console.info("[boot] " + auto.map(f => f[0] + ": " + f[1]).join(" | ")); } catch (e) { /* no console */ }

      /* the rest of the log, then -- unless a press already came -- the hold */
      /* after the boot's own lines, as runBoot's finish would place them */
      const at = Math.max(150 + lines.length * 550, performance.now() - t0);
      for (const [i, l] of more.entries()) setTimeout(() => say(l), pressed ? 0 : Math.max(0, at + i * 300 - (performance.now() - t0)));
      /* never before the face has pulsed, nor before the log has had its say */
      const readyAt = Math.max(1850, at + more.length * 300);  /* canon's runBoot, to the millisecond */
      await new Promise(resolve => {
        if (pressed) return resolve();
        onPress = resolve;
        setTimeout(() => allowed.then(() => {
          if (pressed) return;
          /* sound may already play, so the press would be for nothing: the
             boot ends as it always did, straight into the title */
          if (!holding) { onPress = null; return resolve(); }
          el.classList.add("gk-ready", "gki-hold");
          const p = document.createElement("div");
          p.className = "gki-prompt";
          p.textContent = prompt;
          el.appendChild(p);
        }), Math.max(0, readyAt - (performance.now() - t0)));
      });
      onPress = null;
      unhook();
      onContinue();

      /* the boot goes quickly -- the press was a skip to it, so it does not
         wait -- and the title fades up from under it */
      if (title) title.classList.add("gki-fade");
      /* a press while the boot fades is a skip of the entrance, not lost */
      let early = false;
      const earlyHit = ev => {
        if (ev.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        early = true;
      };
      window.addEventListener("keydown", earlyHit, true);
      window.addEventListener("pointerdown", earlyHit, true);
      await boot.finish([]);
      window.removeEventListener("keydown", earlyHit, true);
      window.removeEventListener("pointerdown", earlyHit, true);
      onTitle();
      if (!title) { onDone(); return { toggles: sw }; }

      return new Promise(resolve => {
        const timers = [], ctl = new AbortController();
        const lines = [...title.querySelectorAll("h1 span[data-t]")];
        let steps = lines;
        if (name === "words") {
          steps = [];
          for (const l of lines) {
            l.innerHTML = l.dataset.t.split(" ").map(w => '<span class="gki-w">' + escHTML(w) + "</span>").join(" ");
            l.classList.add("gki-on");
            steps.push(...l.querySelectorAll(".gki-w"));
          }
        }
        steps.forEach((s, i) => timers.push(setTimeout(() => {
          s.classList.add("gki-on");
          if (name === "decode") decodeLine(s);
        }, T.name + i * T.step)));
        const end = () => {
          timers.forEach(clearTimeout);
          ctl.abort();
          for (const n of later) n.inert = false;
          focus();
          onDone();
          resolve({ toggles: sw });
        };
        timers.push(setTimeout(() => {
          title.classList.add("gki-menu", "gk-rise");
          end();
          setTimeout(() => title.classList.remove("gki-intro", "gki-menu", "gki-fade"), T.done - T.menu);
        }, T.menu));
        /* a key or a click during the entrance only ends it; it reaches nothing else */
        const skip = ev => {
          if (ev.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          for (const l of lines) if (name !== "words") l.textContent = l.dataset.t;
          title.classList.remove("gki-intro", "gki-menu", "gki-fade");
          end();
        };
        window.addEventListener("keydown", skip, { capture: true, signal: ctl.signal });
        window.addEventListener("pointerdown", skip, { capture: true, signal: ctl.signal });
        if (early) skip({ type: "early", preventDefault() {}, stopImmediatePropagation() {} });
      });
    },
    cancel() { unhook(); boot.cancel(); }
  };
}

/* one line of the name decoding out of noise, by the clock, as canon's
   decodeTitle does the whole name */
function decodeLine(el) {
  const text = el.dataset.t, glyphs = "▚▞▖▗▘▝#/\\<>=+", t0 = performance.now(), ms = 700;
  const t = setInterval(() => {
    const p = (performance.now() - t0) / ms;
    if (!el.isConnected || p >= 1) { clearInterval(t); el.textContent = text; return; }
    const done = Math.floor(text.length * p);
    el.textContent = text.slice(0, done) + [...text.slice(done)].map(c => c === " " ? " " : glyphs[Math.random() * glyphs.length | 0]).join("");
  }, 28);
}

/**
 * The integrated title's layout, on a mounted .gk-title: the credit moved
 * under the menu, the switches top right, and the menu's ticks. finish()
 * calls it; a game that mounts its title again later (back from a game)
 * calls it again on the new one.
 *   toggles   { sound, music } as gkToggles takes them; left out, none
 *   tick()    the menu's tick, as gkMenuTicks takes it; left out, silent
 * Returns gkToggles' { refresh() }, or null with no toggles.
 */
function gkIntegrate(title, { toggles = null, tick = null } = {}) {
  title.classList.add("gki");
  const main = title.querySelector("main"), foot = title.querySelector(":scope > footer");
  if (main && foot) main.appendChild(foot);
  if (tick) gkMenuTicks(title, tick);
  return toggles ? gkToggles(title, toggles) : null;
}

/**
 * The Sound and Music switches, top right of a .gk-title. Each is a button
 * named for what it switches, pressed while that is on (STANDARD.md §8):
 * Sound is the master -- everything, music too, as M is -- and Music is the
 * music alone. A game with no music passes sound only.
 *   sound, music   { get() -> bool, set(on) }
 * Returns { refresh() }: call it when the game changes either another way
 * (M, Settings), so the switches show it.
 */
function gkToggles(title, { sound = null, music = null } = {}) {
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>'
  };
  const wrap = document.createElement("div");
  wrap.className = "gki-toggles";
  const made = [];
  /* Music first, Sound -- the master -- in the corner */
  for (const [k, label, keyHint, ctl] of [["music", "Music", "", music], ["sound", "Sound", " (M)", sound]]) {
    if (!ctl) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gki-tg";
    b.setAttribute("aria-label", label);
    b.title = label + keyHint;
    b.innerHTML = ICON[k] + '<span class="gki-sw"></span>';
    b.addEventListener("click", ev => { ev.stopPropagation(); ctl.set(!ctl.get()); refresh(); });
    wrap.appendChild(b);
    made.push([b, k, ctl]);
  }
  const refresh = () => {
    for (const [b, k, ctl] of made) {
      b.setAttribute("aria-pressed", ctl.get() ? "true" : "false");
      if (k === "music") b.classList.toggle("gki-held", !!sound && !sound.get());
    }
  };
  refresh();
  title.appendChild(wrap);
  return { refresh };
}
/* @gk-intro-end */
