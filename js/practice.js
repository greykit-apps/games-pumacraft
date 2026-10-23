/* PumaCraft -- the practice range: the Proving Ground against a base that
 * does not fight back yet. Your command post and four engineers in one
 * main; in the other, the enemy's post, its depot and barracks, and a few
 * troopers on guard. Build up and break it. A thinking opponent arrives
 * with the skirmish AI; until then this is where the game can be played.
 * Opened from the title's Practice, or with ?sandbox on the address. */
"use strict";
(() => {
  const C = PC.C, fp = v => Math.floor(v * C.TILE_FP);
  PC.Practice = {
    start(onEnd) {
      PC.Play.start({
        map: "proving", seed: 1,
        players: [{ faction: "a", team: 0, name: "You" }, { faction: "a", team: 1, name: "The range" }],
        setup(W) {
          const T = k => PC.Data.type(k).id, W2 = PC.World;
          W2.spawn(W, T("a_depot"), 1, fp(50.5), fp(52));
          W2.spawn(W, T("a_barracks"), 1, fp(56), fp(51.5));
          for (const [x, y] of [[51, 55], [52, 55], [51, 56], [52, 56], [50, 58], [51, 58]]) W2.spawn(W, T("a_trooper"), 1, fp(x + 0.5), fp(y + 0.5));
          /* the range's engineers work, so its ore pile grows: something to take */
          const ids = [];
          for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & C.F.ALIVE) && W.owner[i] === 1 && (W.flags[i] & C.F.WORKER)) ids.push(W2.id(W, i));
          let vein = -1;
          for (let i = 0; i < C.MAX_UNITS; i++) if ((W.flags[i] & C.F.RESOURCE) && PC.Data.types[W.type[i]].gather === 1 && W.x[i] > fp(50)) { vein = i; break; }
          if (vein >= 0) PC.Orders.issue(W, { t: 0, p: 1, k: C.CMD.GATHER, u: ids, tgt: W2.id(W, vein) });
        },
      }, onEnd);
    },
  };
})();
