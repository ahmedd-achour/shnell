/**
 * Shnell Business — best stop order for ONE route that starts at the pickup
 * and visits every stop once (open path, no return). Works on any distance
 * matrix d (index 0 = pickup), road distances when we have them.
 *
 *  - up to EXACT_MAX stops: exact (Held-Karp dynamic programming);
 *  - above: nearest-neighbour and cheapest-insertion starts, each polished
 *    with 2-opt + or-opt until no move shortens the route; keep the best.
 */

const EXACT_MAX = 12;
const MAX_PASSES = 60;

export function pathCost(d: number[][], p: number[]): number {
  let c = 0;
  for (let k = 1; k < p.length; k++) c += d[p[k - 1]][p[k]];
  return c;
}

/** Visiting order as matrix indexes, always starting with 0 (the pickup). */
export function bestOrder(d: number[][]): number[] {
  const n = d.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  if (n - 1 <= EXACT_MAX) return exact(d);
  const a = improve(d, nearest(d));
  const b = improve(d, insertion(d));
  return pathCost(d, a) <= pathCost(d, b) ? a : b;
}

function exact(d: number[][]): number[] {
  const n = d.length - 1;               // stops are matrix rows 1..n
  const full = 1 << n;
  const dp = new Float64Array(full * n).fill(Infinity);
  const from = new Int8Array(full * n).fill(-1);
  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = d[0][j + 1];
  for (let m = 1; m < full; m++) {
    for (let j = 0; j < n; j++) {
      if (!(m & (1 << j))) continue;
      const v = dp[m * n + j];
      if (v === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (m & (1 << k)) continue;
        const m2 = m | (1 << k);
        const w = v + d[j + 1][k + 1];
        if (w < dp[m2 * n + k]) { dp[m2 * n + k] = w; from[m2 * n + k] = j; }
      }
    }
  }
  let m = full - 1;
  let j = 0;
  for (let k = 1; k < n; k++) if (dp[m * n + k] < dp[m * n + j]) j = k;
  const rev: number[] = [];
  while (j >= 0) {
    rev.push(j + 1);
    const prev = from[m * n + j];
    m &= ~(1 << j);
    j = prev;
  }
  return [0, ...rev.reverse()];
}

function nearest(d: number[][]): number[] {
  const n = d.length;
  const seen = new Array(n).fill(false);
  const p = [0];
  seen[0] = true;
  for (let s = 1; s < n; s++) {
    const last = p[p.length - 1];
    let best = -1;
    for (let k = 1; k < n; k++) if (!seen[k] && (best < 0 || d[last][k] < d[last][best])) best = k;
    seen[best] = true;
    p.push(best);
  }
  return p;
}

function insertion(d: number[][]): number[] {
  const p = [0];
  const left = new Set(Array.from({ length: d.length - 1 }, (_, i) => i + 1));
  while (left.size) {
    let bk = -1, bi = -1, bc = Infinity;
    for (const k of left) {
      for (let i = 1; i <= p.length; i++) {
        const prev = p[i - 1];
        const next = p[i];
        const c = d[prev][k] + (next === undefined ? 0 : d[k][next] - d[prev][next]);
        if (c < bc) { bc = c; bk = k; bi = i; }
      }
    }
    p.splice(bi, 0, bk);
    left.delete(bk);
  }
  return p;
}

/** 2-opt (reverse a stretch) + or-opt (move 1-3 consecutive stops). Asymmetric-safe. */
function improve(d: number[][], start: number[]): number[] {
  let p = start;
  let best = pathCost(d, p);
  for (let pass = 0, better = true; better && pass < MAX_PASSES; pass++) {
    better = false;
    for (let i = 1; i < p.length - 1; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const q = [...p.slice(0, i), ...p.slice(i, j + 1).reverse(), ...p.slice(j + 1)];
        const c = pathCost(d, q);
        if (c < best - 1e-9) { p = q; best = c; better = true; }
      }
    }
    for (let len = 1; len <= 3; len++) {
      for (let i = 1; i + len <= p.length; i++) {
        const seg = p.slice(i, i + len);
        const rest = [...p.slice(0, i), ...p.slice(i + len)];
        for (let k = 1; k <= rest.length; k++) {
          if (k === i) continue;
          const q = [...rest.slice(0, k), ...seg, ...rest.slice(k)];
          const c = pathCost(d, q);
          if (c < best - 1e-9) { p = q; best = c; better = true; break; }
        }
      }
    }
  }
  return p;
}

/** Straight-line km between [lat, lng] points. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
