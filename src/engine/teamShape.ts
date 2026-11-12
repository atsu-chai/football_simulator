import { learnedRoleX, learnedShape, TRACKING_TACTICS, trackingPhase } from './tracking';
import { FORMATIONS } from '../data/formations';
import { clamp, relX, toAbs, toRel } from './geometry';
import { MatchState, PITCH_H, PITCH_W, Player, Side, Tactics, TeamFrame, Vec } from './types';

const LINE_ADJ = { deep: -TRACKING_TACTICS.line, normal: 0, high: TRACKING_TACTICS.line };
const PRESS_ADJ = { low: -TRACKING_TACTICS.press, mid: 0, high: TRACKING_TACTICS.press };
const LENGTH_SCALE = { loose: 1 + TRACKING_TACTICS.length, normal: 1, tight: 1 - TRACKING_TACTICS.length };
const WIDTH_SCALE = { loose: 1 + TRACKING_TACTICS.defensiveWidth, normal: 1, tight: 1 - TRACKING_TACTICS.defensiveWidth };
const ATTACK_WIDTH = { narrow: 1 - TRACKING_TACTICS.attackingWidth, normal: 1, wide: 1 + TRACKING_TACTICS.attackingWidth };

export function updateFrames(m: MatchState) {
  for (const side of [0, 1] as Side[]) m.frames[side] = computeFrame(m, side);
}

function computeFrame(m: MatchState, side: Side): TeamFrame {
  const t = m.tactics[side];
  const hasBall = m.possession === side;
  const ball = toRel(side, m.ball.pos);
  // スロットの端が0/1でないことと、サポート・寄せによる縮みを全試合比較で補正する。
  const base = learnedShape(t.formation, trackingPhase(m, side), ball.x, ball.y);
  // データの基準形に戦術の変形を重ねる。守備ラインとプレス開始位置は別々に調整する。
  let line = base[1] + (hasBall ? 3 : 2) + LINE_ADJ[t.lineHeight] * (hasBall ? 0.8 : 1);
  if (!hasBall) line += PRESS_ADJ[t.pressHeight] - m.lineDrop[side];
  line = hasBall ? clamp(line, 8, 65) : clamp(line, 5, Math.max(5, Math.min(65, ball.x - 1.5)));
  const opponent = m.tactics[(1 - side) as Side];
  const pulled = hasBall ? 0 : (ATTACK_WIDTH[opponent.width] - 1) * base[3] * 0.45;
  return {
    hasBall, line,
    length: base[2] * (hasBall ? 0.92 : 1) * LENGTH_SCALE[t.compactness],
    width: base[3] * 1.15 * WIDTH_SCALE[t.compactness] * (hasBall ? ATTACK_WIDTH[t.width] : 1) + pulled,
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

/** 局面と役割から決まる、その選手の基準位置(絶対座標)。 */
export function shapeTarget(m: MatchState, p: Player): Vec {
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
  return toAbs(p.team, rel);
}

function shapeRel(m: MatchState, p: Player, t: Tactics, f: TeamFrame): Vec {
  const slot = FORMATIONS[t.formation][p.slot];
  if (p.role === 'gk') {
    const ball = toRel(p.team, m.ball.pos);
    const sweep = t.lineHeight === 'high' ? 15 : t.lineHeight === 'deep' ? 8 : 11;
    return { x: clamp(ball.x * 0.14 + 1, 1.5, f.hasBall ? sweep + 4 : sweep), y: 34 + (ball.y - 34) * 0.17 };
  }
  const sideSign = slot.y < 0.5 ? -1 : 1;
  let x = f.line + learnedRoleX(t.formation, trackingPhase(m, p.team), p.role, slot.x) * f.length;
  let y = f.cy + (slot.y - 0.5) * f.width;

  if (f.hasBall) {
    const lim = oppLineX(m, p.team);
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
          // 残る場合も、CBより一段前で幅を取ってビルドアップに参加する
          x += 3;
        }
        if (deepBuild && t.fullbacks !== 'invert') {
          x = Math.max(x, 30);
          y = 34 + sideSign * Math.min(edge + 1, 30);
        }
        break;
      case 'wb':
        // 同じ選手が攻守の幅を担うので、SBの上がりより一段低い位置までにする
        x = f.line + f.length * 0.56;
        y = 34 + sideSign * Math.min(edge + 2, 32);
        break;
      case 'cb': {
        // SB が内側に入る/高く上がるとCBは幅を取り、後方の3枚を作る。
        if (t.fullbacks !== 'stay' && FORMATIONS[t.formation].some((s) => s.role === 'fb')) {
          y = 34 + sideSign * 11;
        }
        if (deepBuild) {
          // 中央のCB(3バックの真ん中)は残り、両脇はペナルティエリアの角の外へ開く
          y = 34 + (slot.y - 0.5) * 2 * 17;
          x = Math.max(x, 8);
        }
        break;
      }
      case 'dm':
        x = Math.min(x, f.line + 15);
        break;
      case 'cm':
        x += 5;
        y = y * 0.65 + (34 + sideSign * 12) * 0.35;
        break;
      case 'am':
        x = Math.min(x + 3, lim - 6);
        y = y * 0.6 + (34 + sideSign * 10) * 0.4;
        break;
      case 'wg':
        x = Math.min(x + 2, lim - 3);
        y = 34 + sideSign * Math.min(edge, 31);
        break;
      case 'iw':
        x = Math.min(x + 4, lim - 2);
        y = 34 + sideSign * 13;
        break;
      case 'st':
        x = Math.min(x + 3, lim - 1);
        break;
      case 'f9':
        x = Math.min(x - 8, lim - 12);
        y = 34 + (y - 34) * 0.5;
        break;
    }
    x = Math.min(x, lim - 0.5);
  } else {
    // 最終ラインは中盤ほどボールサイドへ寄らず、逆サイドのCBは中央に絞って残る
    if (p.role === 'cb' || p.role === 'fb' || p.role === 'wb') {
      const ball = toRel(p.team, m.ball.pos);
      y = 34 + (ball.y - 34) * 0.2 + (slot.y - 0.5) * f.width * 0.92;
    }
    switch (p.role) {
      case 'wb':
        x = f.line + 1;
        y = 34 + (y - 34) * 1.35;
        y = clamp(y, 4, 64);
        break;
      case 'f9':
      case 'st':
        // カウンター狙いなら前線に残って出口になる
        x += t.onWin === 'counter' ? 8 : 0;
        break;
      case 'am':
        x += 2;
        break;
      case 'wg':
      case 'iw':
        // 高いプレス以外では、ウイングも中盤まで戻って守る
        if (t.pressHeight !== 'high') x = Math.min(x, f.line + f.length * 0.62);
        break;
    }
  }
  return { x, y };
}
