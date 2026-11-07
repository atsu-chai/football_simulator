import { PITCH_H, PITCH_W, Side, Vec } from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const vec = (x: number, y: number): Vec => ({ x, y });

/** 絶対座標 → チーム基準座標(180度回転)。そのチームは常に x+ へ攻める。 */
export const toRel = (side: Side, v: Vec): Vec =>
  side === 0 ? { x: v.x, y: v.y } : { x: PITCH_W - v.x, y: PITCH_H - v.y };
/** 180度回転は自身の逆変換。 */
export const toAbs = toRel;

export const relX = (side: Side, x: number) => (side === 0 ? x : PITCH_W - x);

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 点 p から線分 ab への最短距離と、最近点の a からの割合。 */
export function pointToSegment(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-6;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
