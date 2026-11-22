import { learnedPosition, learnedAttackWidth } from './positioning';
import { learnedRoleX, learnedShape, TRACKING_TACTICS, trackingPhase } from './tracking';
import { FORMATIONS } from '../data/formations';
import { clamp, relX, toAbs, toRel } from './geometry';
import { MatchState, PITCH_H, PITCH_W, Player, Side, Tactics, TeamFrame, Vec } from './types';

const LINE_ADJ = { deep: -TRACKING_TACTICS.line * 2, normal: 0, high: TRACKING_TACTICS.line * 2 };
const PRESS_ADJ = { low: -TRACKING_TACTICS.press, mid: 0, high: TRACKING_TACTICS.press };
const LENGTH_SCALE = { loose: 1 + TRACKING_TACTICS.length * 1.5, normal: 1, tight: 1 - TRACKING_TACTICS.length * 1.5 };
const WIDTH_SCALE = { loose: 1 + TRACKING_TACTICS.defensiveWidth, normal: 1, tight: 1 - TRACKING_TACTICS.defensiveWidth };
const ATTACK_WIDTH = { narrow: 1 - TRACKING_TACTICS.attackingWidth, normal: 1, wide: 1 + TRACKING_TACTICS.attackingWidth };

const targetCache = new WeakMap<MatchState, Map<number, Vec>>();

export function updateFrames(m: MatchState) {
  targetCache.delete(m);
  for (const side of [0, 1] as Side[]) m.frames[side] = computeFrame(m, side);
}

function computeFrame(m: MatchState, side: Side): TeamFrame {
  const t = m.tactics[side];
  const hasBall = m.possession === side;
  const ball = toRel(side, m.ball.pos);
  // スロットの端が0/1でないことと、サポート・寄せによる縮みを全試合比較で補正する。
  const base = learnedShape(t.formation, trackingPhase(m, side), ball.x, ball.y);
  // データの基準形に戦術の変形を重ねる。守備ラインとプレス開始位置は別々に調整する。
  let line = base[1] + (hasBall ? (trackingPhase(m, side) === 'win' ? 5 : 3) : 2) + LINE_ADJ[t.lineHeight] * (hasBall ? 0.8 : 1);
  if (!hasBall) line += PRESS_ADJ[t.pressHeight] - m.lineDrop[side];
  line = hasBall ? clamp(line, 8, 65) : clamp(line, 5, Math.max(5, Math.min(65, ball.x - 1.5)));
  const opponent = m.tactics[(1 - side) as Side];
  const pulled = hasBall ? 0 : (ATTACK_WIDTH[opponent.width] - 1) * base[3] * 0.45;
  return {
    hasBall, line, referenceBack: base[1],
    length: base[2] * (hasBall ? 0.92 : 1) * LENGTH_SCALE[t.compactness],
    width: base[3] * (hasBall ? 1.15 : trackingPhase(m, side) === 'loss' ? 1.10 : 1.2) * WIDTH_SCALE[t.compactness] * (hasBall ? ATTACK_WIDTH[t.width] : 1) + pulled,
    cy: base[4] + (hasBall ? (t.focus === 'left' ? -5 : t.focus === 'right' ? 5 : 0) : 0),
  };
}

/** 相手の最終ラインを自チーム基準の x で返す。 */
export function oppLineX(m: MatchState, side: Side): number {
  const opp = (1 - side) as Side;
  return PITCH_W - m.lastLine[opp];
}

export function updateLastLines(m: MatchState) {
  for (const side of [0, 1] as Side[]) {
    let a = 1e9;
    let b = 1e9;
    for (const p of m.players) {
      if (p.team !== side) continue;
      const x = relX(side, p.pos.x);
      if (x < a) {
        b = a;
        a = x;
      } else if (x < b) b = x;
    }
    m.lastLine[side] = b;
  }
}

/** オフサイドラインより前か(攻撃チーム基準)。 */
export function offsideLimit(m: MatchState, side: Side): number {
  const ballX = relX(side, m.ball.pos.x);
  return Math.max(oppLineX(m, side), ballX, PITCH_W / 2);
}

const layoutCache = new WeakMap<TeamFrame, Map<number, Vec>>();
/** 実測で学習した位置は役割単位なので、フォーメーション上の前後・左右の並びが消える。
 *  チームの重心(ブロックの位置)は学習値のまま、重心からの相対配置だけを
 *  学習値とフォーメーションの並びで混ぜ、アンカーとIH、シャドーと1トップなどの段差を残す。 */
export const FORMATION_BLEND = { x: 0.6, y: 0.25 };
function formationLayout(m: MatchState, team: Side, f: TeamFrame): Map<number, Vec> {
  const hit = layoutCache.get(f);
  if (hit) return hit;
  const slots = FORMATIONS[m.tactics[team].formation];
  // 最終ライン(スロットxが0付近)は実測の凹凸と間隔をそのまま使う。揃えると実測より平らで等間隔になる。
  // 奪った直後・失った直後の3秒は実測の崩れた動きを優先する(速攻・即時奪回の差を消さない)。
  const transition = trackingPhase(m, team) === 'win' || trackingPhase(m, team) === 'loss';
  const ps = transition ? [] : m.players.filter((q) => q.team === team && q.role !== 'gk' && slots[q.slot].x > 0.1);
  const obs = ps.map((q) => learnedPosition(m, q));
  const geo = ps.map((q) => ({ x: slots[q.slot].x * f.length, y: (slots[q.slot].y - 0.5) * f.width }));
  const mean = (a: Vec[]) => ({ x: a.reduce((s, v) => s + v.x, 0) / a.length, y: a.reduce((s, v) => s + v.y, 0) / a.length });
  const o = ps.length ? mean(obs) : { x: 0, y: 0 }, g = ps.length ? mean(geo) : { x: 0, y: 0 };
  // フォーメーションからは並び順だけを借り、前後・左右の広がりは実測の学習位置に合わせる
  // (スロット幅をそのまま使うと実測よりチームが縦に短くなる)。
  const sd = (a: number[], c: number) => Math.sqrt(a.reduce((s, v) => s + (v - c) ** 2, 0) / Math.max(1, a.length)) || 1;
  const kx = sd(obs.map((v) => v.x), o.x) / sd(geo.map((v) => v.x), g.x);
  const ky = sd(obs.map((v) => v.y), o.y) / sd(geo.map((v) => v.y), g.y);
  for (const v of geo) { v.x = g.x + (v.x - g.x) * kx; v.y = g.y + (v.y - g.y) * ky; }
  const out = new Map<number, Vec>();
  for (const q of m.players) if (q.team === team && q.role !== 'gk') out.set(q.id, learnedPosition(m, q));
  ps.forEach((q, i) => out.set(q.id, {
    x: o.x + (obs[i].x - o.x) * (1 - FORMATION_BLEND.x) + (geo[i].x - g.x) * FORMATION_BLEND.x,
    // 守備時の横位置はshapeRelで既にスロット幅を半分混ぜているので、ここでは足さない
    y: f.hasBall ? o.y + (obs[i].y - o.y) * (1 - FORMATION_BLEND.y) + (geo[i].y - g.y) * FORMATION_BLEND.y : obs[i].y,
  }));
  // Blending differently ordered positions shrinks variance even when each
  // input has the same spread. Restore the learned spread after blending too.
  for (const axis of ['x', 'y'] as const) {
    if (axis === 'y' && !f.hasBall) continue;
    const mixed = ps.map(q => out.get(q.id)![axis]);
    const scale = sd(obs.map(v => v[axis]), o[axis]) / sd(mixed, o[axis]);
    for (const q of ps) { const v = out.get(q.id)!; v[axis] = o[axis] + (v[axis] - o[axis]) * scale; }
  }
  layoutCache.set(f, out);
  return out;
}

/** 局面と役割から決まる、その選手の基準位置(絶対座標)。 */
export function shapeTarget(m: MatchState, p: Player): Vec {
  let cache = targetCache.get(m);
  if (!cache) { cache = new Map(); targetCache.set(m, cache); }
  const cached = cache.get(p.id);
  if (cached) return { ...cached };
  const t = m.tactics[p.team];
  const f = m.frames[p.team];
  const rel = shapeRel(m, p, t, f);
  const off = t.offsets?.[p.slot];
  if (off) {
    rel.x += off.x;
    rel.y += off.y;
  }
  rel.x = clamp(rel.x, 2, PITCH_W - 2);
  rel.y = clamp(rel.y, 1.5, PITCH_H - 1.5);
  const result = toAbs(p.team, rel);
  cache.set(p.id, result);
  return { ...result };
}

function shapeRel(m: MatchState, p: Player, t: Tactics, f: TeamFrame): Vec {
  const slot = FORMATIONS[t.formation][p.slot];
  if (p.role === 'gk') {
    const ball = toRel(p.team, m.ball.pos);
    const sweep = t.lineHeight === 'high' ? 15 : t.lineHeight === 'deep' ? 8 : 11;
    return { x: clamp(ball.x * 0.14 + 1, 1.5, f.hasBall ? sweep + 4 : sweep), y: 34 + (ball.y - 34) * 0.17 };
  }
  const sideSign = slot.y < 0.5 ? -1 : 1;
  let x = f.line + learnedRoleX(t.formation, trackingPhase(m, p.team), p.role, slot.x, toRel(p.team, m.ball.pos).x) * f.length;
  let y = f.cy + (slot.y - 0.5) * f.width;
  const observed = formationLayout(m, p.team, f).get(p.id)!;
  x = f.hasBall ? observed.x + (observed.x-f.referenceBack)*(LENGTH_SCALE[t.compactness]-1) + LINE_ADJ[t.lineHeight] * .8 * (1-slot.x) : f.line + (observed.x - f.referenceBack) * LENGTH_SCALE[t.compactness];
  y = f.hasBall ? 34 + (observed.y-34)*learnedAttackWidth(m,p.team)*ATTACK_WIDTH[t.width]*WIDTH_SCALE[t.compactness] + (t.focus==='left'?-5:t.focus==='right'?5:0) : y * .5 + observed.y * .5;

  if (f.hasBall) {
    const lim = offsideLimit(m, p.team);
    const edge = f.width / 2;
    // 自陣深くからの組み立てでは、CBがボックスの両脇へ開き、SBは高く幅を取ってパスの出口を作る
    const deepBuild = toRel(p.team, m.ball.pos).x < 30;
    switch (p.role) {
      case 'fb':
        if (t.fullbacks === 'overlap') {
          x += 14;
          y = 34 + sideSign * Math.min(edge + 1, 32);
        } else if (t.fullbacks === 'invert') {
          x = f.line + f.length * 0.34;
          y = 34 + sideSign * 10;
        } else {
          // 残るSBは実測混合スタイルの基準から1m低く、CBの前で出口を保つ。
          x -= 1;
        }
        if (deepBuild && t.fullbacks !== 'invert') {
          x = Math.max(x, 30);
        }
        break;
      case 'wb':
        // 同じ選手が攻守の幅を担うので、SBの上がりより一段低い位置までにする
        x += 4;
        y = 34 + sideSign * Math.min(edge + 2, 29);
        break;
      case 'cb': {
        // SB が内側に入る/高く上がるとCBは幅を取り、後方の3枚を作る。
        if (t.fullbacks !== 'stay' && FORMATIONS[t.formation].some((s) => s.role === 'fb')) {
          y = 34 + sideSign * 11;
        }
        if (deepBuild) {
          // 中央のCB(3バックの真ん中)は残り、両脇はペナルティエリアの角の外へ開く
          // ボックス脇へ開く幅は実測そのもの(フォーメーションの並びで狭めない)
          y = 34 + (learnedPosition(m, p).y - 34) * WIDTH_SCALE[t.compactness] * ATTACK_WIDTH[t.width] + (t.focus === 'left' ? -5 : t.focus === 'right' ? 5 : 0);
          x = Math.max(x, 8);
        }
        break;
      }
      case 'dm':
        x = Math.min(x, f.line + 26);
        break;
      case 'cm':
        break;
      case 'am':
        x = Math.min(x, lim - 3.5);
        break;
      case 'wg':
        x = Math.min(x, lim - 3);
        break;
      case 'iw':
        x = Math.min(x + 4, lim - 2);
        y = 34 + sideSign * 13;
        break;
      case 'st':
        x = Math.min(x, lim - 1);
        break;
      case 'f9':
        x = Math.min(x - 8, lim - 12);
        y = 34 + (y - 34) * 0.5;
        break;
    }
    x = Math.min(x, lim - 0.5);
  } else {
    // Calibrate the residual forward pull of marking, fading towards the front outlet.
    // 2m is smaller than the measured back-unit x SD (4.33m).
    x -= 2*(1-slot.x);
    if ((p.role === 'st' || p.role === 'f9') && toRel(p.team, m.ball.pos).x > 70) x += 2;
    if ((p.role === 'st' || p.role === 'f9') && toRel(p.team, m.ball.pos).x < 70) x -= 2;
    if (p.role === 'dm' || p.role === 'cm') y = f.cy + (y - f.cy) * .76;
    // 最終ラインは中盤ほどボールサイドへ寄らず、逆サイドのCBは中央に絞って残る
    if (p.role === 'cb' || p.role === 'fb' || p.role === 'wb') {
      const ball = toRel(p.team, m.ball.pos);
      y = observed.y * .5 + (34 + (ball.y - 34) * 0.2 + (slot.y - 0.5) * f.width * 0.92) * .5;
      if (p.role === 'cb') { const cy=34+(ball.y-34)*.2; y=cy+(y-cy)*1.12; }
    }
    switch (p.role) {
      case 'wb':
        x += 1;
        y = 34 + (y - 34) * 1.35;
        y = clamp(y, 4, 64);
        break;
      case 'f9':
      case 'st':
        // カウンター狙いなら前線に残って出口になる
        x += t.onWin === 'counter' ? 8 : 0;
        break;
      case 'am':
        break;
      case 'wg':
      case 'iw':
        // 高いプレス以外では、ウイングも中盤まで戻って守る

        break;
    }
  }
  return { x, y };
}
