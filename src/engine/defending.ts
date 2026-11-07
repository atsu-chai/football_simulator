import { clamp, dist, relX, toAbs, toRel } from './geometry';
import { nearestOpp } from './onBall';
import { interceptPoint } from './offBall';
import { shapeTarget } from './teamShape';
import { MatchState, PITCH_W, Player, Side, TICK, Vec } from './types';

const PRESS_LIMIT = { low: 40, mid: 66, high: 106 };
const PRESS_COUNT = { low: 1, normal: 2, high: 3 };

/** 守備チーム全体の判断を1ティック分行う。 */
export function teamDefense(m: MatchState, side: Side) {
  const t = m.tactics[side];
  const ball = toRel(side, m.ball.pos);
  const opp = (1 - side) as Side;
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  const since = m.t - m.possessionSince;
  const team = m.players.filter((p) => p.team === side);

  // ボール保持者がフリーで前を向いていれば、最終ラインは下がる。
  const free = carrier ? nearestOpp(m, opp, carrier.pos) > 4.5 : false;
  const danger = free ? 3.5 : -4;
  m.lineDrop[side] = clamp(m.lineDrop[side] + danger * TICK, 0, t.lineHeight === 'high' ? 11 : 16);

  // プレスする人数
  let pressers = 0;
  // 体力が落ちるとプレスの人数を維持できず、高い位置でも奪いに行けなくなる
  const energy = m.energy[side];
  const reach = energy < 0.3 ? Math.min(PRESS_LIMIT[t.pressHeight], PRESS_LIMIT.mid) : PRESS_LIMIT[t.pressHeight];
  if (ball.x < reach) pressers = Math.max(1, PRESS_COUNT[t.pressIntensity] - (energy < 0.45 ? 1 : 0) - (energy < 0.2 ? 1 : 0));
  // ゴール前では引いたチームでも、シュートコースを消しに寄せる
  if (ball.x < 32) pressers = Math.max(pressers, 2);
  const transition = since < 3.5;
  if (transition && t.onLoss === 'counterpress') pressers = 3;
  else if (transition && t.onLoss === 'regroup' && ball.x > 38) pressers = Math.min(pressers, 1);
  if (m.ball.owner < 0 && !m.ball.pass) pressers = Math.max(pressers, 1);

  const ranked = team
    .filter((p) => p.role !== 'gk')
    .map((p) => ({ p, d: dist(p.pos, m.ball.pos) }))
    .sort((a, b) => a.d - b.d);
  const pressSet = new Set<number>();
  for (let i = 0; i < ranked.length && pressSet.size < pressers; i++) {
    const limit = transition && t.onLoss === 'counterpress' ? 14 : 24;
    if (ranked[i].d < limit || i === 0) pressSet.add(ranked[i].p.id);
  }

  for (const p of team) {
    if (p.role === 'gk') {
      goalkeeper(m, p);
      continue;
    }
    p.runTarget = null;
    if (pressSet.has(p.id)) {
      p.pressing = true;
      const pt = m.ball.owner >= 0 ? m.ball.pos : interceptPoint(m, p).at;
      p.target = { ...pt };
      p.urgency = t.pressIntensity === 'low' ? 0.8 : 1;
      continue;
    }
    p.pressing = false;
    defenderMove(m, p);
  }
}

function defenderMove(m: MatchState, p: Player) {
  const side = p.team;
  const t = m.tactics[side];
  const base = shapeTarget(m, p);
  const baseRel = toRel(side, base);
  const ball = toRel(side, m.ball.pos);

  if (t.marking === 'man' && p.markTarget >= 0) {
    const o = m.players[p.markTarget];
    // 動き出しへの反応は遅れる。走る相手ほど離される。釣り出されやすいのも弱点。
    const oRel = toRel(side, { x: o.pos.x - o.vel.x * 0.7, y: o.pos.y - o.vel.y * 0.7 });
    const dx = -1.8;
    const dy = (34 - oRel.y) * 0.04 + (ball.y - oRel.y) * 0.05;
    p.target = toAbs(side, { x: clamp(oRel.x + dx, 2, PITCH_W - 2), y: clamp(oRel.y + dy, 2, 66) });
    p.urgency = 0.95;
    return;
  }

  // ゾーン: 自分の持ち場の近くにいる相手を、ゴール側から牽制する
  let mark: Player | null = null;
  let best = 10;
  for (const o of m.players) {
    if (o.team === side || o.role === 'gk') continue;
    const d = dist(o.pos, base);
    if (d < best) {
      best = d;
      mark = o;
    }
  }
  let target: Vec = baseRel;
  if (mark) {
    const r = toRel(side, mark.pos);
    const pull = 0.5;
    target = {
      x: baseRel.x + (r.x - 1.5 - baseRel.x) * pull,
      y: baseRel.y + (r.y - baseRel.y) * pull + (ball.y - r.y) * 0.05,
    };
  }

  // 最終ラインは背後を取られない
  const isBack = p.role === 'cb' || p.role === 'fb' || p.role === 'wb';
  if (isBack) {
    target.x = Math.min(target.x, m.frames[side].line + (mark ? 0 : 1));
    // ライン裏へ走る相手がいれば付いていく
    for (const o of m.players) {
      if (o.team === side || o.role === 'gk') continue;
      const r = toRel(side, o.pos);
      if (r.x < m.frames[side].line - 1 && dist(o.pos, p.pos) < 12) {
        target = { x: Math.max(r.x - 2, 3), y: r.y };
        break;
      }
    }
  }

  const rel = toRel(side, p.pos);
  // ボールより前にいる選手は全力で帰陣する
  const behind = rel.x > ball.x + 4;
  if (behind) {
    target.x = Math.min(target.x, ball.x - 2);
  }
  p.target = toAbs(side, { x: clamp(target.x, 2, PITCH_W - 2), y: clamp(target.y, 2, 66) });
  p.urgency = behind ? 0.95 : 0.72;
}

export function goalkeeper(m: MatchState, p: Player) {
  const base = shapeTarget(m, p);
  p.pressing = false;
  const rel = toRel(p.team, m.ball.pos);
  // ボックス内のこぼれ球は GK が処理する
  if (m.ball.owner < 0 && !m.ball.shot && rel.x < 16.5 && Math.abs(rel.y - 34) < 20) {
    const speedSq = m.ball.vel.x ** 2 + m.ball.vel.y ** 2;
    const nearest = nearestOpp(m, p.team, m.ball.pos);
    if (speedSq < 90 && nearest > dist(p.pos, m.ball.pos) * 0.6) {
      p.target = interceptPoint(m, p).at;
      p.urgency = 1;
      return;
    }
  }
  if (m.ball.shot) {
    p.target = { ...p.pos };
    p.urgency = 0.5;
    return;
  }
  p.target = base;
  p.urgency = 0.65;
}

/** マンマークの担当を決める。ポジションが近い相手から割り当てる。 */
export function assignMarks(m: MatchState, side: Side) {
  const opp = (1 - side) as Side;
  const mine = m.players.filter((p) => p.team === side && p.role !== 'gk');
  const theirs = m.players.filter((p) => p.team === opp && p.role !== 'gk');
  const used = new Set<number>();
  const pairs: { a: Player; b: Player; d: number }[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      const dx = relX(side, a.pos.x) - relX(side, b.pos.x);
      pairs.push({ a, b, d: Math.hypot(dx, a.pos.y - b.pos.y) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const done = new Set<number>();
  for (const { a, b } of pairs) {
    if (done.has(a.id) || used.has(b.id)) continue;
    a.markTarget = b.id;
    done.add(a.id);
    used.add(b.id);
  }
  m.markingDirty[side] = false;
}
