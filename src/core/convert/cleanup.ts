import { deltaE2000Raw } from '../color/index.ts';

export type CleanupLevel = 0 | 1 | 2 | 3;

/** Largest stray area removed at each level, in stitches. */
export const CLEANUP_MAX_SIZE: Record<CleanupLevel, number> = { 0: 0, 1: 1, 2: 2, 3: 4 };

/** ΔE above which a small area differs from all its neighbours and counts as a detail. */
export const DETAIL_DELTA_E = 18;

const NEIGHBOURS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/**
 * Removes small stray areas ("confetti") from an assignment grid (palette index, -1 = empty),
 * in place. Areas are 8-connected; each small area takes the most similar neighbouring colour,
 * unless `protectDetails` is set and it differs strongly from all of them (eyes, highlights).
 * Isolated specks on the empty background are removed and pinholes in stitched areas filled.
 * Returns the number of cells changed.
 */
export function removeConfetti(
  assign: Int16Array,
  width: number,
  height: number,
  paletteLab: Float64Array,
  level: CleanupLevel,
  protectDetails: boolean,
): number {
  const maxSize = CLEANUP_MAX_SIZE[level];
  if (maxSize === 0) return 0;
  let changed = 0;
  for (let pass = 0; pass < 6; pass++) {
    const n = cleanupPass(assign, width, height, paletteLab, maxSize, protectDetails);
    changed += n;
    if (n === 0) break;
  }
  return changed;
}

function cleanupPass(
  assign: Int16Array,
  w: number,
  h: number,
  paletteLab: Float64Array,
  maxSize: number,
  protectDetails: boolean,
): number {
  const seen = new Uint8Array(w * h);
  const changes: [number[], number][] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start]) continue;
    const colour = assign[start];
    // Flood-fill the component, giving up as soon as it is larger than maxSize.
    const comp: number[] = [];
    let large = false;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      if (!large) comp.push(i);
      if (comp.length > maxSize) large = true;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of NEIGHBOURS) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!seen[j] && assign[j] === colour) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (large) continue;

    const around = new Map<number, number>();
    let touchesBorder = false;
    for (const i of comp) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of NEIGHBOURS) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
          touchesBorder = true;
          continue;
        }
        const c = assign[yy * w + xx];
        if (c !== colour) around.set(c, (around.get(c) ?? 0) + 1);
      }
    }
    if (around.size === 0) continue;

    let target: number | undefined;
    if (colour < 0) {
      // A pinhole in the stitching: fill it, unless it is open to the border or to background.
      if (touchesBorder || around.has(-1)) continue;
      target = mostFrequent(around);
    } else {
      const stitched = [...around.keys()].filter((c) => c >= 0);
      if (stitched.length === 0) {
        target = -1; // speck on the background
      } else {
        let best = Infinity;
        for (const c of stitched) {
          const de = deltaE2000Raw(
            paletteLab[colour * 3],
            paletteLab[colour * 3 + 1],
            paletteLab[colour * 3 + 2],
            paletteLab[c * 3],
            paletteLab[c * 3 + 1],
            paletteLab[c * 3 + 2],
          );
          if (de < best || (de === best && around.get(c)! > around.get(target!)!)) {
            best = de;
            target = c;
          }
        }
        if (protectDetails && best > DETAIL_DELTA_E) continue;
      }
    }
    changes.push([comp, target!]);
  }
  let changed = 0;
  for (const [comp, target] of changes) {
    for (const i of comp) assign[i] = target;
    changed += comp.length;
  }
  return changed;
}

function mostFrequent(counts: Map<number, number>): number {
  let best = -1;
  let bestN = -1;
  for (const [c, n] of counts) {
    if (c >= 0 && (n > bestN || (n === bestN && c < best))) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/** Cells with no 8-neighbour of the same colour. */
export function countIsolated(
  assign: Int16Array | Uint16Array,
  width: number,
  height: number,
  emptyValue: number,
): number {
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = assign[y * width + x];
      if (c === emptyValue) continue;
      let alone = true;
      for (const [dx, dy] of NEIGHBOURS) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && assign[yy * width + xx] === c) {
          alone = false;
          break;
        }
      }
      if (alone) n++;
    }
  }
  return n;
}
