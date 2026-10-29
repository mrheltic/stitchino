/**
 * Minimum cut on an 8-connected pixel grid with the Boykov–Kolmogorov max-flow algorithm
 * ("An experimental comparison of min-cut/max-flow algorithms for energy minimization in vision",
 * 2004). The source side is the foreground.
 *
 * Arc `a = node * 8 + k` goes from `node` to its neighbour in direction `DIRS[k]`; the opposite
 * direction is `k ^ 1`, so the reverse arc is `neighbour * 8 + (k ^ 1)`.
 */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

const TERMINAL = -1;
const NONE = -2;
const ORPHAN = -3;
const FAR = 1 << 30;

export class GridGraph {
  readonly size: number;
  private flow = 0;
  /** Residual capacity of each arc. */
  private readonly cap: Float64Array;
  /** Neighbour reached by each arc, -1 outside the grid. */
  private readonly head: Int32Array;
  /** Residual terminal capacity: > 0 from the source, < 0 to the sink. */
  private readonly tr: Float64Array;
  /** Arc from a node to its parent in the search tree, or TERMINAL / NONE / ORPHAN. */
  private readonly parent: Int32Array;
  /** Tree of a node with a parent: 0 source, 1 sink. */
  private readonly inSink: Uint8Array;
  private readonly stamp: Int32Array;
  private readonly dist: Int32Array;

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.size = n;
    this.cap = new Float64Array(n * 8);
    this.head = new Int32Array(n * 8).fill(-1);
    this.tr = new Float64Array(n);
    this.parent = new Int32Array(n).fill(NONE);
    this.inSink = new Uint8Array(n);
    this.stamp = new Int32Array(n);
    this.dist = new Int32Array(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < 8; k++) {
          const nx = x + DIRS[k][0];
          const ny = y + DIRS[k][1];
          if (nx >= 0 && ny >= 0 && nx < width && ny < height)
            this.head[(y * width + x) * 8 + k] = ny * width + nx;
        }
      }
    }
  }

  /** What labelling node `i` costs: `toBackground` if it ends up background, `toForeground` if not. */
  setTerminals(i: number, toBackground: number, toForeground: number): void {
    this.flow += Math.min(toBackground, toForeground);
    this.tr[i] = toBackground - toForeground;
  }

  /** Same capacity both ways between `i` and its neighbour in direction `k`. */
  setEdge(i: number, k: number, capacity: number): void {
    const j = this.head[i * 8 + k];
    if (j < 0) return;
    this.cap[i * 8 + k] = capacity;
    this.cap[j * 8 + (k ^ 1)] = capacity;
  }

  /** True when node `i` is on the source (foreground) side of the minimum cut. */
  isForeground(i: number): boolean {
    return this.parent[i] !== NONE && this.inSink[i] === 0;
  }

  private sister(a: number): number {
    return this.head[a] * 8 + ((a & 7) ^ 1);
  }

  maxflow(): number {
    const { size: n, cap, head, tr, parent, inSink, stamp, dist } = this;
    const queue = new Int32Array(n + 1);
    const queued = new Uint8Array(n);
    let qHead = 0;
    let qTail = 0;
    const activate = (i: number) => {
      if (queued[i]) return;
      queued[i] = 1;
      queue[qTail] = i;
      qTail = qTail === n ? 0 : qTail + 1;
    };
    const nextActive = () => {
      while (qHead !== qTail) {
        const i = queue[qHead];
        qHead = qHead === n ? 0 : qHead + 1;
        queued[i] = 0;
        if (parent[i] !== NONE) return i;
      }
      return -1;
    };
    const orphans: number[] = [];
    const orphan = (i: number) => {
      parent[i] = ORPHAN;
      orphans.push(i);
    };

    for (let i = 0; i < n; i++) {
      if (tr[i] > 0) {
        parent[i] = TERMINAL;
        inSink[i] = 0;
      } else if (tr[i] < 0) {
        parent[i] = TERMINAL;
        inSink[i] = 1;
      } else continue;
      dist[i] = 1;
      activate(i);
    }

    let time = 0;
    let current = -1;
    for (;;) {
      let i = current >= 0 && parent[current] !== NONE ? current : -1;
      if (i < 0 && (i = nextActive()) < 0) break;

      // Growth: look for an arc from the source tree to the sink tree.
      let middle = -1;
      if (inSink[i] === 0) {
        for (let k = 0; k < 8; k++) {
          const a = i * 8 + k;
          const j = head[a];
          if (j < 0 || cap[a] <= 0) continue;
          if (parent[j] === NONE) {
            inSink[j] = 0;
            parent[j] = j * 8 + (k ^ 1);
            stamp[j] = stamp[i];
            dist[j] = dist[i] + 1;
            activate(j);
          } else if (inSink[j] === 1) {
            middle = a;
            break;
          } else if (stamp[j] <= stamp[i] && dist[j] > dist[i]) {
            parent[j] = j * 8 + (k ^ 1);
            stamp[j] = stamp[i];
            dist[j] = dist[i] + 1;
          }
        }
      } else {
        for (let k = 0; k < 8; k++) {
          const j = head[i * 8 + k];
          if (j < 0) continue;
          const b = j * 8 + (k ^ 1);
          if (cap[b] <= 0) continue;
          if (parent[j] === NONE) {
            inSink[j] = 1;
            parent[j] = b;
            stamp[j] = stamp[i];
            dist[j] = dist[i] + 1;
            activate(j);
          } else if (inSink[j] === 0) {
            middle = b;
            break;
          } else if (stamp[j] <= stamp[i] && dist[j] > dist[i]) {
            parent[j] = b;
            stamp[j] = stamp[i];
            dist[j] = dist[i] + 1;
          }
        }
      }

      time++;
      if (middle < 0) {
        current = -1;
        continue;
      }
      current = i;

      // Augmentation along source root → middle arc → sink root.
      const sNode = middle >> 3;
      const tNode = head[middle];
      let bottleneck = cap[middle];
      for (let x = sNode; ;) {
        const a = parent[x];
        if (a === TERMINAL) {
          bottleneck = Math.min(bottleneck, tr[x]);
          break;
        }
        bottleneck = Math.min(bottleneck, cap[this.sister(a)]);
        x = head[a];
      }
      for (let x = tNode; ;) {
        const a = parent[x];
        if (a === TERMINAL) {
          bottleneck = Math.min(bottleneck, -tr[x]);
          break;
        }
        bottleneck = Math.min(bottleneck, cap[a]);
        x = head[a];
      }
      cap[this.sister(middle)] += bottleneck;
      cap[middle] -= bottleneck;
      for (let x = sNode; ;) {
        const a = parent[x];
        if (a === TERMINAL) {
          tr[x] -= bottleneck;
          if (tr[x] === 0) orphan(x);
          break;
        }
        const s = this.sister(a);
        cap[a] += bottleneck;
        cap[s] -= bottleneck;
        if (cap[s] === 0) orphan(x);
        x = head[a];
      }
      for (let x = tNode; ;) {
        const a = parent[x];
        if (a === TERMINAL) {
          tr[x] += bottleneck;
          if (tr[x] === 0) orphan(x);
          break;
        }
        cap[this.sister(a)] += bottleneck;
        cap[a] -= bottleneck;
        if (cap[a] === 0) orphan(x);
        x = head[a];
      }
      this.flow += bottleneck;

      // Adoption: find new parents for the orphans, or free them.
      for (let o = 0; o < orphans.length; o++) {
        const x = orphans[o];
        const sinkTree = inSink[x];
        let best = NONE;
        let bestDist = FAR;
        for (let k = 0; k < 8; k++) {
          const a0 = x * 8 + k;
          const j = head[a0];
          if (j < 0) continue;
          if ((sinkTree ? cap[a0] : cap[j * 8 + (k ^ 1)]) <= 0) continue;
          if (inSink[j] !== sinkTree || parent[j] === NONE) continue;
          // Is j still connected to its terminal? Count the steps, reusing marks of this round.
          let d = 0;
          let y = j;
          for (;;) {
            if (stamp[y] === time) {
              d += dist[y];
              break;
            }
            const a = parent[y];
            d++;
            if (a === TERMINAL) {
              stamp[y] = time;
              dist[y] = 1;
              break;
            }
            if (a === ORPHAN) {
              d = FAR;
              break;
            }
            y = head[a];
          }
          if (d < FAR) {
            if (d < bestDist) {
              best = a0;
              bestDist = d;
            }
            for (y = j; stamp[y] !== time; y = head[parent[y]]) {
              stamp[y] = time;
              dist[y] = d--;
            }
          }
        }
        if (best !== NONE) {
          parent[x] = best;
          stamp[x] = time;
          dist[x] = bestDist + 1;
          continue;
        }
        parent[x] = NONE;
        for (let k = 0; k < 8; k++) {
          const a0 = x * 8 + k;
          const j = head[a0];
          if (j < 0 || inSink[j] !== sinkTree || parent[j] === NONE) continue;
          if ((sinkTree ? cap[a0] : cap[j * 8 + (k ^ 1)]) > 0) activate(j);
          const pj = parent[j];
          if (pj !== TERMINAL && pj !== ORPHAN && head[pj] === x) orphan(j);
        }
      }
      orphans.length = 0;
    }
    return this.flow;
  }
}
