import { countIsolated } from './cleanup.ts';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface PatternMetrics {
  colors: number;
  stitches: number;
  /** Stitches with no same-colour neighbour. */
  confetti: number;
  confettiPercent: number;
  /** Average length of same-colour runs along rows. */
  averageRun: number;
  /** Colour changes along rows per 100 stitches. */
  changesPer100: number;
  difficulty: Difficulty;
  /** Rough stitching time at the given pace, confetti counting double. */
  hours: number;
}

export const DEFAULT_STITCHES_PER_HOUR = 100;

/** Metrics on a grid of palette ids where 0 means empty. */
export function computeMetrics(
  cells: Uint16Array,
  width: number,
  height: number,
  stitchesPerHour = DEFAULT_STITCHES_PER_HOUR,
): PatternMetrics {
  const colours = new Set<number>();
  let stitches = 0;
  let runs = 0;
  let changes = 0;
  for (let y = 0; y < height; y++) {
    let prev = 0;
    for (let x = 0; x < width; x++) {
      const c = cells[y * width + x];
      if (c) {
        stitches++;
        colours.add(c);
        if (c !== prev) {
          runs++;
          if (prev) changes++;
        }
      }
      prev = c;
    }
  }
  const confetti = countIsolated(cells, width, height, 0);
  const confettiPercent = stitches ? (confetti / stitches) * 100 : 0;
  const changesPer100 = stitches ? (changes / stitches) * 100 : 0;
  const score = colours.size / 12 + confettiPercent / 4 + changesPer100 / 20;
  const difficulty: Difficulty =
    score < 2 ? 'easy' : score < 4 ? 'medium' : score < 7 ? 'hard' : 'expert';
  return {
    colors: colours.size,
    stitches,
    confetti,
    confettiPercent,
    averageRun: runs ? stitches / runs : 0,
    changesPer100,
    difficulty,
    hours: (stitches + confetti) / stitchesPerHour,
  };
}
