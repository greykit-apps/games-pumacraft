/* PumaCraft -- the page: the boot, the title and its menu, Settings, Help
 * and About, and the keys that work everywhere.
 *
 * This is the first build: the game is being made, and what ships for now
 * is its front door -- canon's boot and the integrated intro (games-meta
 * STANDARD.md §3, §14), the title over its scene, the first of the score,
 * and the Settings every greykit game keeps. Skirmish and the campaign open
 * here as they land. */
"use strict";
(() => {
  const S = PC.Store, A = PC.Audio;
  const CREDIT = 'Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a>';
  const SPEEDS = [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"], ["fastest", "Fastest"]];
  const speed = () => { const v = S.get(S.K.speed, "fast"); return SPEEDS.some(([k]) => k === v) ? v : "fast"; };

  /* ---- Settings (§7: the game's own, then Sound, then speed, then This browser) ---- */
  const sw = (on, label, attr) => '<button class="pc-sw" ' + attr + ' aria-pressed="' + on + '">' + label + '<span class="pc-knob" aria-hidden="true"></span></button>';
  function settingsHTML() {
    return '<section class="pc-set"><h3>Sound</h3>' +
      '<div class="pc-row">' + sw(!A.muted, "Sound", 'aria-label="Sound" data-set="sound"') + '<span class="pc-note">Everything, music too. <kbd>M</kbd> anywhere.</span></div>' +
      '<div class="pc-row">' + sw(A.musicOn, "Music", 'aria-label="Music" data-set="music"') + '<span class="pc-note">The score alone.</span></div></section>' +
      '<section class="pc-set"><h3>Game speed</h3><div class="pc-row pc-seg" role="group" aria-label="Game speed">' +
      SPEEDS.map(([k, l]) => '<button data-speed="' + k + '" aria-pressed="' + (speed() === k) + '">' + l + "</button>").join("") +
      '</div><p class="pc-note">How fast a skirmish runs. The game plays the same at every speed, only quicker.</p></section>' +
      '<section class="pc-set"><h3>This browser</h3><p class="pc-note">PumaCraft keeps its settings, and in time its saves, in this browser only.</p>' +
      '<div class="pc-row"><button class="pc-danger" data-forget>Forget everything</button></div></section>';
  }
  const settings = {
    html: settingsHTML,
    onClick(b, sheet) {
      if (b.dataset.set === "sound") { A.setMuted(!A.muted); refreshToggles(); sheet.refresh(); }
      else if (b.dataset.set === "music") { A.setMusic(!A.musicOn); refreshToggles(); sheet.refresh(); }
      else if (b.dataset.speed) { S.put(S.K.speed, b.dataset.speed); sheet.refresh(); }
      else if (b.hasAttribute("data-forget")) {
        sheet.confirm("Forget PumaCraft's settings and saves in this browser? Other greykit games keep theirs.", "Forget everything")
          .then(yes => { if (yes) S.forgetEverything(); });
      }
    }
  };

  const help = [
    ["Playing", "<p><strong>PumaCraft is being built.</strong> It will be real-time strategy in the Grey Reach: gather ore and vapour, raise a base, " +
      "train an army and break your enemy's, as one of three powers that play nothing alike.</p>" +
      "<p>Skirmish is open: the Pumacity Defense Force against the computer, easy, normal or hard, on a drawn map or one made from a seed. The other two powers and a campaign of three acts, one for each, open here as they are finished.</p>"],
    ["In the game", "<p>Left-click or drag to select your units; right-click to move, attack, gather ore or vapour, or set a building's rally point. Shift queues an order behind the last. Every button on the command card has its letter.</p>" +
      '<table class="pc-keys"><tr><td><kbd>Ctrl</kbd>+<kbd>0</kbd>&ndash;<kbd>9</kbd></td><td>Make a control group; <kbd>0</kbd>&ndash;<kbd>9</kbd> calls it, twice to look at it</td></tr>' +
      '<tr><td><kbd>F1</kbd></td><td>The next idle engineer</td></tr><tr><td><kbd>Backspace</kbd></td><td>Your command post</td></tr>' +
      '<tr><td><kbd>&larr;</kbd> <kbd>&uarr;</kbd> <kbd>&rarr;</kbd> <kbd>&darr;</kbd></td><td>Scroll (or touch the screen&rsquo;s edge)</td></tr>' +
      '<tr><td><kbd>F10</kbd> <kbd>Esc</kbd></td><td>Pause and the menu</td></tr></table>'],
    ["Keys", '<table class="pc-keys"><tr><td><kbd>M</kbd></td><td>Sound on or off, anywhere</td></tr>' +
      '<tr><td><kbd>S</kbd> <kbd>?</kbd> <kbd>A</kbd></td><td>Settings, Help, About</td></tr>' +
      '<tr><td><kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>Enter</kbd></td><td>Move through the menu</td></tr>' +
      '<tr><td><kbd>Esc</kbd></td><td>Close a sheet</td></tr></table>' +
      "<p class=\"pc-note\">PumaCraft plays with a mouse and keyboard on a desktop.</p>"],
  ];
  const about = "<p><strong>PumaCraft</strong> is a real-time strategy game in the manner of the classics of the late 1990s: " +
    "three asymmetric powers, bases and economies, armies and their counters, painted 16-bit pixel art and a score that follows the battle.</p>" +
    "<p>Everything in it is its own: its world, its names, its art, its sound. It is not affiliated with Blizzard Entertainment and uses none of its code, art, sound or text.</p>" +
    '<p class="pc-note">Typefaces: Barlow Semi Condensed and Pixelify Sans, under the SIL Open Font License.</p>' +
    '<p class="gk-credit">' + CREDIT + "</p>";

  const soon = what => alertSheet(what + " is still being built. It opens here when it is ready.", "Not yet");

  /* ---- the boot and the title (§3, §14) ---- */
  const q = new URLSearchParams(location.search);
  const titleHost = document.getElementById("title-host");
  const TOGGLES = { sound: { get: () => !A.muted, set: on => A.setMuted(!on) }, music: { get: () => A.musicOn, set: A.setMusic } };
  const tick = () => gkTick(A.ac, A.fx);
  let titleUI = null, stopScene = null, toggles = null;
  const refreshToggles = () => { if (toggles) toggles.refresh(); };
  const titleCfg = {
    name: "PumaCraft", lines: ["Puma", "Craft"], sub: "War in the Grey Reach", primary: "skirmish",
    scene: el => { stopScene = PC.titleScene(el); },
    get items() {
      const last = PC.Saves.latest(), info = last !== null ? PC.Saves.info(last) : null;
      return [
        info && { act: "resume", label: "Continue", key: "R", meta: info.label },
        { act: "skirmish", label: "Skirmish", key: "N", meta: "against the computer" },
        { act: "campaign", label: "Campaign", key: "C", meta: "soon" },
        { act: "load", label: "Load a game", key: "L" },
        "gap",
      { act: "settings", label: "Settings", key: "S" },
      { act: "help", label: "Help", key: "?" },
      { act: "about", label: "About", key: "A" },
      ];
    },
    help, about, settings,
    onAct(act) {
      if (act === "skirmish") PC.Skirmish.open(game => play(game));
      else if (act === "campaign") soon("The campaign");
      else if (act === "resume") { const n = PC.Saves.latest(); PC.Saves.fromSlot(n).then(sv => sv ? play({ save: sv }) : alertSheet("That save could not be read.", "Continue")); }
      else if (act === "load") loadSheet();
    },
  };

  /* a game takes the screen: the title steps aside (its keys and its scene with it), and comes back after */
  const leaveTitle = () => {
    if (titleUI) { titleUI.unmount(); titleUI = null; }
    if (stopScene) { stopScene(); stopScene = null; }
    titleHost.hidden = true; titleHost.innerHTML = ""; toggles = null;
    A.stopTheme();
  };
  const backToTitle = () => {
    titleHost.hidden = false;
    titleUI = mountTitle(titleHost, titleCfg);
    toggles = gkIntegrate(titleHost.querySelector(".gk-title"), { toggles: TOGGLES, tick });
    titleUI.reveal();
    A.startTheme();
  };
  /** Plays a game (a skirmish's choices, or { save }), and comes back to the title after. */
  const play = game => {
    leaveTitle();
    PC.Sheets.load().then(() => PC.Play.start(game, backToTitle))
      .catch(e => { backToTitle(); alertSheet(String(e.message || e), "The game could not start"); });
  };
  const practice = () => {
    leaveTitle();
    PC.Sheets.load().then(() => PC.Practice.start(backToTitle))
      .catch(e => { backToTitle(); alertSheet(String(e.message || e), "The game could not start"); });
  };
  const loadSheet = () => {
    const SV = PC.Saves;
    const body = `<div class="pc-col">` + [SV.AUTO, ...SV.SLOTS].map(n => { const i = SV.info(n); return i ? `<button data-slot="${n}">${n === SV.AUTO ? "Autosave" : "Slot " + n}<span class="pc-note"> ${i.label}</span></button>` : ""; }).join("") +
      `</div><div class="pc-row"><button data-file>Load from a file</button></div>`;
    PC.Sheet("Load a game", body, async (b, sh) => {
      let sv = null;
      if (b.dataset.slot !== undefined) sv = await SV.fromSlot(+b.dataset.slot);
      else if (b.hasAttribute("data-file")) sv = await SV.fromFile();
      else return;
      if (!sv) { alertSheet("That save could not be read.", "Load a game"); return; }
      sh.close(); play({ save: sv });
    });
  };

  injectTitleCSS();
  /* ?sandbox: straight to the practice range, no boot */
  if (q.has("sandbox")) { practice(); }
  else {
    const intro = startIntro({ audio: A.ctx, lines: [
      bootReloadLine(),
      gkFact("save", PC.Saves.latest() !== null ? PC.Saves.info(PC.Saves.latest()).label : "none"),
      gkFlavour(["charting the Grey Reach", "warming the forge plates", "counting ore on the survey charts", "the dropship is fuelled",
        "the beacon is answering", "plotting a course past the charted stars", "the Reach is quiet tonight"],
        ["the cat has taken the command chair", "the cat is sitting on the map"], q.has("rare") ? 1 : 12),
    ] });
    titleUI = mountTitle(titleHost, titleCfg);
    intro.finish({
      prefix: S.PREFIX,   /* the boot counts this game's saved keys */
      hold: q.get("hold") || "auto",
      name: "lines",
      toggles: TOGGLES, tick,
      onContinue: () => { const ac = A.ctx(); if (ac) ac.resume(); },
      onTitle: () => A.startTheme(),
    }).then(r => { toggles = r.toggles; });
  }

  /* M is the master switch anywhere (§8); the switches follow it */
  addEventListener("keydown", ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === "m") { A.setMuted(!A.muted); refreshToggles(); const s = document.querySelector('.gk-sheet [data-set="sound"]'); if (s) s.setAttribute("aria-pressed", String(!A.muted)); }
  });
})();
