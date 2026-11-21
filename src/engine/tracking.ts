import data from '../data/tracking.json';
import behaviour from '../data/behaviour-response.json';
import { clamp } from './geometry';
import { FormationId, MatchState, RoleId, Side } from './types';

export type TrackingPhase = 'attack' | 'defend' | 'win' | 'loss';
type Cell = number[];
const cells: Record<string, Cell> = data.cells;
const roles: Record<string, number[]> = data.roles;
const family = (formation: FormationId) => formation.startsWith('3') || formation.startsWith('5') ? 'three'
  : formation === '4-2-3-1' ? '4231' : formation === '4-3-3' ? '433' : '442';

export function trackingPhase(m: MatchState, side: Side): TrackingPhase {
  return !m.dead && m.t - m.turnoverAt < 3 ? (m.possession === side ? 'win' : 'loss') : (m.possession === side ? 'attack' : 'defend');
}

const means = new Map<string, Cell>();
for (const phase of ['attack', 'defend', 'win', 'loss']) {
  const sum = Array<number>(8).fill(0);
  for (const [key, cell] of Object.entries(cells)) if (key.startsWith(`all|${phase}|`)) {
    sum[0] += cell[0];
    for (let j = 1; j < 8; j++) sum[j] += cell[j] * cell[0];
  }
  for (let j = 1; j < 8; j++) sum[j] /= Math.max(1, sum[0]);
  means.set(phase, sum);
}

/** 疎なセルを全体平均へ縮約してから、ボール位置の周囲4セルを双線形補間する。 */
export function learnedShape(formation: FormationId, phase: TrackingPhase, x: number, y: number): Cell {
  const gx = clamp(x / 105 * 12 - 0.5, 0, 11), gy = clamp(y / 68 * 8 - 0.5, 0, 7);
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const fallback = means.get(phase)!;
  const out = Array<number>(8).fill(0);
  for (const [dx, dy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const suffix = `${phase}|${Math.min(ix + dx, 11)}|${Math.min(iy + dy, 7)}`;
    const global = cells[`all|${suffix}`] ?? fallback;
    const local = cells[`${family(formation)}|${suffix}`];
    const confidence = local ? local[0] / (local[0] + 250) : 0;
    const globalConfidence = global[0] / (global[0] + 100);
    for (let j = 1; j < 8; j++) {
      const base = global[j] * globalConfidence + fallback[j] * (1 - globalConfidence);
      out[j] += ((local?.[j] ?? base) * confidence + base * (1 - confidence)) * weight;
    }
  }
  return out;
}

/** 役割の前後関係は実測、同じ役割の左右と人数は編成スロットで保持する。 */
export function learnedRoleX(formation: FormationId, phase: TrackingPhase, role: RoleId, slotX: number, ballX?: number): number {
  const baseRole = role === 'iw' ? 'wg' : role === 'f9' ? 'st' : role;
  const global = roles[`all|${phase}|${baseRole}`];
  const local = roles[`${family(formation)}|${phase}|${baseRole}`];
  const confidence = local ? local[0] / (local[0] + 1000) : 0;
  const x = (local?.[1] ?? global?.[1] ?? slotX) * confidence + (global?.[1] ?? slotX) * (1 - confidence);
  if (ballX !== undefined) {
    const gx = clamp(ballX / 105 * 6 - .5, 0, 5), ix = Math.floor(gx), f = gx - ix;
    const phaseKey = phase === 'loss' ? 'defend' : phase === 'win' ? 'attack' : phase;
    const profiles: Record<string, number[]> = behaviour.roleCells;
    const a = profiles[`${phaseKey}|${ix}|${baseRole}`], b = profiles[`${phaseKey}|${Math.min(5, ix + 1)}|${baseRole}`];
    const localX = a && b ? a[1] * (1 - f) + b[1] * f : x;
    return localX * 0.85 + slotX * 0.15;
  }
  return x * 0.65 + slotX * 0.35;
}

// 実測速度の上位域と加速度分布で制限し、緊急でない持ち場の調整は別の反応時間を使う。
export const TRACKING_MOTION = {
  running: data.kinematics.speedP95,
  recoverySprint: data.kinematics.speedP99,
  ballSpeedLimit: behaviour.ballSpeedLimit,
  sprint: Math.min(8, Math.max(7.2, data.kinematics.speedP999)),
  acceleration: Math.min(3.5, Math.max(2.5, data.kinematics.accelP99)),
  adjustmentAcceleration: Math.min(2.5, Math.max(1.5, data.kinematics.accelP90)),
  // 相関の最大遅れは反応時間そのものではないため、その半分を平滑化時定数の目安にする。
  response: clamp(data.kinematics.responseLagSeconds * 0.5, 0.4, 1.2),
};

// 同じボール位置でのチーム間残差（10〜90百分位の幅）を変形量の基準にする。
// 12チーム標本から因果効果は同定できない。ラインとプレスは教材上の両極を見せるため幅を拡張する。
const styleSpan = (column: number) => data.styleVariation.defend.p90[column] - data.styleVariation.defend.p10[column];
export const TRACKING_TACTICS = {
  line: clamp(styleSpan(4) * 2, 4, 8),
  press: clamp(styleSpan(6) * 1.5, 8, 11),
  length: clamp(styleSpan(1) / data.validation.defend.values[1], 0.1, 0.25),
  defensiveWidth: clamp(styleSpan(2) / data.validation.defend.values[2], 0.1, 0.25),
  attackingWidth: clamp((data.styleVariation.attack.p90[2] - data.styleVariation.attack.p10[2]) / data.validation.attack.values[2], 0.12, 0.25),
};

/** V(t+1)=a+b*位置誤差+c*球速+d*V(t) の持続応答 c/(1-d)。5試合学習・2試合検証。 */
export function learnedBallResponse(role: RoleId, attacking = false, lateral = false): number {
  const line = role === 'cb' || role === 'fb' || role === 'wb' ? 0 : role === 'dm' || role === 'cm' ? 1 : 2;
  const key = `${attacking ? 'attack' : 'defend'}${line}${lateral ? 'y' : ''}` as const;
  const c = behaviour.response[key].coefficients;
  return c[2] / (1 - c[3]);
}
