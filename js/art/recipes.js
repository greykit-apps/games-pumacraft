/* PumaCraft art -- the recipe book every sprite is painted from.
 *
 * PC.Recipes.add(key, def) registers one:
 *   sheet     which sheet it packs into ("units_a", ...)
 *   facings   16 for anything that turns, 1 for a building
 *   box       [w, h, ox, oy]: the canvas each frame is painted on and where
 *             the unit's centre on the ground sits in it
 *   anims     { name: { n: frames, fps, facings? (override, e.g. 1 for a death) } }
 *   parts(anim, f, n)  the parts for frame f of n of that animation
 *             (see js/art/paint.js for what a part is)
 * The key is the unit type's art id (js/data/*.js). */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const R = PC.Recipes = { list: [], byKey: Object.create(null) };
  R.add = (key, def) => {
    if (R.byKey[key]) throw new Error("recipe registered twice: " + key);
    def.key = key; R.list.push(def); R.byKey[key] = def;
  };
  /* small helpers for writing parts */
  R.box = (at, size, ramp, more) => Object.assign({ s: "box", at, size, ramp }, more);
  R.ball = (at, size, ramp, more) => Object.assign({ s: "ball", at, size, ramp }, more);
  R.cyl = (at, size, ramp, more) => Object.assign({ s: "cyl", at, size, ramp }, more);
  R.cone = (at, size, ramp, more) => Object.assign({ s: "cone", at, size, ramp }, more);
  R.swing = (f, n, amp) => Math.sin(f / n * 2 * Math.PI) * amp;   /* a walk cycle's swing */
})();
