/**
 * Seeded RNG. OWNER: [B].
 *
 * The only source of randomness allowed anywhere in `web/src/engine/`.
 * No Math.random, no Date.now — the counterfactual replays the same future
 * against a different decision, and unseeded randomness makes that comparison
 * meaningless.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const range = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
export const round = (x: number, to: number) => Math.round(x / to) * to;

/** Weighted pick. `weights` must be the same length as `xs` and sum to > 0. */
export function pickWeighted<T>(r: Rng, xs: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let u = r() * total;
  for (let i = 0; i < xs.length; i++) {
    u -= weights[i];
    if (u <= 0) return xs[i];
  }
  return xs[xs.length - 1];
}

/**
 * A fresh generator per year, so adding a decision in 2028 cannot change what
 * happened in 2026. `stream` separates independent draws inside the same year
 * (e.g. the two 2026 events).
 */
export function yearRng(seed: number, year: number, stream = 0): Rng {
  return mulberry32(seed + year * 7919 + stream * 104729);
}
