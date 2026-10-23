/* PumaCraft data -- what belongs to no one: the two resources.
 *
 * Ore lies in crystal veins a worker breaks off eight at a time, one worker
 * at a vein at once, until the vein is gone. Vapour vents from the ground
 * and is worth nothing until someone builds a refinery over the vent; then
 * workers draw it eight at a time from the refinery. Footprints in tiles. */
"use strict";
PC.Data.neutral({
  ore: { name: "Ore", kind: "resource", hp: 1, size: "large", foot: [2, 1], sight: 0, amount: 1500, gather: 1 },
  vapour: { name: "Vapour vent", kind: "resource", hp: 1, size: "large", foot: [4, 2], sight: 0, amount: 5000, gather: 2 },
});
