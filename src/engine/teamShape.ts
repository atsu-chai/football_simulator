import { FORMATIONS } from '../data/formations';
import { clamp, relX, toAbs, toRel } from './geometry';
import { MatchState, PITCH_H, PITCH_W, Player, Side, Tactics, TeamFrame, Vec } from './types';

const HEIGHT = { low: 21, mid: 33, high: 47 };
const LINE_ADJ = { deep: -6, normal: 0, high: 7 };
const LEN_DEF = { loose: 36, normal: 29, tight: 22 };
const WID_DEF = { loose: 50, normal: 43, tight: 35 };
const WID_ATT = { narrow: 42, normal: 54, wide: 65 };

export function updateFrames(m: MatchState) {
  for (const side of [0, 1] as Side[]) m.frames[side] = computeFrame(m, side);
}

function computeFrame(m: MatchState, side: Side): TeamFrame {
  const t = m.tactics[side];
  const hasBall = m.possession === side;
  const ball = toRel(side, m.ball.pos);
  if (hasBall) {
    const line = clamp(ball.x - 27 + LINE_ADJ[t.lineHeight] * 0.8, 13, 60);
    const width = WID_ATT[t.width];
    const focus = t.focus === 'left' ? -5 : t.focus === 'right' ? 5 : 0;
    return { hasBall, line, length: 44, width, cy: 34 + (ball.y - 34) * 0.12 + focus };
  }
  let line = HEIGHT[t.pressHeight] + LINE_ADJ[t.lineHeight] + (ball.x - 52.5) * 0.3;
  line -= m.lineDrop[side];
  line = clamp(line, Math.min(15, ball.x - 1.5), Math.min(62, ball.x - 1.5));
  line = Math.max(line, 5);
  // 攻撃側が幅を取ると守備側も横に引っ張られ、狭く攻めると中央に固まれる
  const pulled = (WID_ATT[m.tactics[(1 - side) as Side].width] - WID_ATT.normal) * 0.65;
  return {
    hasBall,
    line,
    length: LEN_DEF[t.compactness],
    width: WID_DEF[t.compactness] + pulled,
    cy: 34 + (ball.y - 34) * 0.42,
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
  let x = f.line + slot.x * f.length;
  let y = f.cy + (slot.y - 0.5) * f.width;

  if (f.hasBall) {
    const lim = oppLineX(m, p.team);
    const edge = f.width / 2;
    switch (p.role) {
      case 'fb':
        if (t.fullbacks === 'overlap') {
          x += 19;
          y = 34 + sideSign * Math.min(edge + 1, 32);
        } else if (t.fullbacks === 'invert') {
          x = f.line + f.length * 0.34;
          y = 34 + sideSign * 10;
        } else {
          // 残る場合も、CBより一段前で幅を取ってビルドアップに参加する
          x += 10;
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
        x = Math.max(x, lim - 11);
        y = y * 0.6 + (34 + sideSign * 10) * 0.4;
        break;
      case 'wg':
        x = Math.max(x, lim - 5);
        y = 34 + sideSign * Math.min(edge, 31);
        break;
      case 'iw':
        x = Math.max(x, lim - 3);
        y = 34 + sideSign * 13;
        break;
      case 'st':
        x = lim - 1;
        break;
      case 'f9':
        x = lim - 15;
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
        x = f.line + f.length + (t.onWin === 'counter' ? 11 : t.pressHeight === 'low' ? 2 : 4);
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
