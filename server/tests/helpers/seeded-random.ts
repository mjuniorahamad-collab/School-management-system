// Deterministic property-test randomness for the calculation-verification
// suites. A seeded PRNG (mulberry32) keeps every generated case reproducible so
// a failure can be re-run exactly, without adding a property-testing dependency
// (fast-check is only transitively present and is not a declared dependency).

export interface SeededRng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** Money-like decimal in [min, max] rounded to `places` decimals. */
  dec(min: number, max: number, places?: number): number
  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T
  /** A shuffled copy of the input (Fisher-Yates, driven by the same PRNG). */
  shuffle<T>(items: readonly T[]): T[]
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed: number): SeededRng {
  const next = mulberry32(seed)
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    dec: (min, max, places = 2) => {
      const factor = 10 ** places
      return Math.round((min + next() * (max - min)) * factor) / factor
    },
    pick: <T,>(items: readonly T[]): T => items[int(0, items.length - 1)],
    shuffle: <T,>(items: readonly T[]): T[] => {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i)
        const tmp = copy[i] as T
        copy[i] = copy[j] as T
        copy[j] = tmp
      }
      return copy
    },
  }
}
