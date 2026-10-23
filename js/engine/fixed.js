/* PumaCraft engine -- integer arithmetic the simulation can trust.
 *
 * Every value here is an integer held in a double. For |a| < 2^53,
 * Math.floor(a / b) is exact: the quotient's rounding error is smaller than
 * its distance to the next integer. Positions are at most 2^21 in fixed
 * point, so a squared distance (2^43) stays well inside that. */
"use strict";
globalThis.PC = globalThis.PC || {};
(() => {
  const F = PC.Fixed = {};

  /** floor(sqrt(n)) for an integer 0 <= n < 2^53. Newton's method from a
   * power of two at or above the root, which only ever steps downward. */
  F.isqrt = n => {
    if (n <= 0) return 0;
    let x = 1;
    while (x * x < n) x *= 2;
    for (;;) {
      const y = Math.floor((x + Math.floor(n / x)) / 2);
      if (y >= x) return x;
      x = y;
    }
  };

  /** |(dx, dy)|, rounded down. */
  F.len = (dx, dy) => F.isqrt(dx * dx + dy * dy);

  /** The heading 0..255 of (dx, dy): 0 east, 64 south, 128 west, 192 north. */
  F.heading = (dx, dy) => {
    if (dx === 0 && dy === 0) return 0;
    const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    /* the angle in the first octant pair, 0..64 */
    const a = ax >= ay ? PC.ATAN[Math.floor(ay * 64 / ax)] : 64 - PC.ATAN[Math.floor(ax * 64 / ay)];
    let h;
    if (dx >= 0) h = dy >= 0 ? a : 256 - a;
    else h = dy >= 0 ? 128 - a : 128 + a;
    return h & 255;
  };

  /** (dx, dy) scaled to length len, toward the same heading; exact to a unit. */
  F.toward = (dx, dy, len, d = F.len(dx, dy)) => d === 0 ? [0, 0] : [Math.floor(dx * len / d), Math.floor(dy * len / d)];

  /* ---- the PRNG: mulberry32 over one Uint32 of state ---- */
  /** The next unsigned 32-bit draw from s, a Uint32Array(1). */
  F.next = s => {
    s[0] = (s[0] + 0x6d2b79f5) >>> 0;
    let t = s[0];
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  /** An integer 0..n-1. */
  F.int = (s, n) => Math.floor(F.next(s) / 4294967296 * n);

  /** FNV-1a over a typed array's bytes, taken a 32-bit word at a time where
   * the length allows (the tail byte by byte), in two lanes from different
   * offsets: 64 bits of fingerprint, as two unsigned 32-bit words in h. */
  F.fnv = (arr, h = [0x811c9dc5, 0x2c9277b5]) => {
    let a = h[0] | 0, b = h[1] | 0;   /* int32 from the start, or the loop runs on doubles */
    const words = arr.byteLength >> 2, w32 = new Int32Array(arr.buffer, arr.byteOffset, words);
    for (let i = 0; i < words; i++) {
      const v = w32[i];
      a = Math.imul(a ^ v, 16777619);
      b = Math.imul(b ^ v, 16777619) ^ (a >>> 13);
    }
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset + words * 4, arr.byteLength - words * 4);
    for (let i = 0; i < u8.length; i++) { a = Math.imul(a ^ u8[i], 16777619); b = Math.imul(b ^ u8[i], 16777619) ^ (a >>> 13); }
    h[0] = a >>> 0; h[1] = b >>> 0;
    return h;
  };
})();
