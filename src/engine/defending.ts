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
  // 背後へのボールを出せる距離(最終ラインから40m以内)にいるフリーの保持者に対してだけ、少し下がる
  const free = carrier ? nearestOpp(m, opp, carrier.pos) > 4.5 : false;
  const inRange = carrier ? toRel(side, carrier.pos).x - m.frames[side].line < 40 : false;
  const danger = free && inRange ? 3 : -4;
  m.lineDrop[side] = clamp(m.lineDrop[side] + danger * TICK, 0, t.lineHeight === 'high' ? 6 : 8);

  // プレスする人数
  let pressers = 0;
  // 体力が落ちるとプレスの人数を維持できず、高い位置でも奪いに行けなくなる
  const energy = m.energy[side];
  const reach = energy < 0.3 ? Math.min(PRESS_LIMIT[t.pressHeight], PRESS_LIMIT.mid) : PRESS_LIMIT[t.pressHeight];
  if (ball.x < reach) pressers = Math.max(1, PRESS_COUNT[t.pressIntensity] - (energy < 0.45 ? 1 : 0) - (energy < 0.2 ? 1 : 0));
  // ゴール前では引いたチームでも、シュートコースを消しに寄せる
  if (ball.x < 32) pressers = Math.max(pressers, 1);
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

  // 最終ラインを横一線に揃える。誰かが下がれば全員下がり、裏で相手をオンサイドにしない
  const back = team.filter((p) => !pressSet.has(p.id) && (p.role === 'cb' || p.role === 'fb' || p.role === 'wb'));
  // ただし裏へ走る相手に付いて下がった選手は基準にしない(全員がゴール前まで下がらないように)
  if (back.length >= 2 && t.marking === 'zone') {
    const frameLine = m.frames[side].line;
    let deepest = 1e9;
    for (const p of back) {
      const x = toRel(side, p.target).x;
      if (x >= frameLine - 3) deepest = Math.min(deepest, x);
    }
    if (deepest < 1e9) {
      for (const p of back) {
        const r = toRel(side, p.target);
        if (r.x > deepest + 1.5) p.target = toAbs(side, { x: deepest + 1.5, y: r.y });
      }
    }
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
  const isBack = p.role === 'cb' || p.role === 'fb' || p.role === 'wb';
  let target: Vec = baseRel;
  if (mark) {
    const r = toRel(side, mark.pos);
    const pull = 0.5;
    // 最終ラインは横には寄るが、縦はラインの高さを保つ(手前に立つFWに引かれて下がり続けないため)
    const pullX = isBack ? 0 : pull;
    target = {
      x: baseRel.x + (r.x - 1.5 - baseRel.x) * pullX,
      y: baseRel.y + (r.y - baseRel.y) * pull + (ball.y - r.y) * 0.05,
    };
  }

  // 最終ラインは背後を取られない
  if (isBack) {
    target.x = Math.min(target.x, m.frames[side].line + (mark ? 0 : 1));
    // 裏へ走り出した相手にだけ付いていく。ラインの手前に立つだけの相手や、
    // オフサイドの位置に残った相手まで追うと、ラインがゴール前まで下がり続けてしまう。
    const actualLine = deepestOutfield(m, side);
    for (const o of m.players) {
      if (o.team === side || o.role === 'gk') continue;
      const r = toRel(side, o.pos);
      const running = o.runUntil > m.t && o.runTarget !== null;
      // オフサイドの位置に残っている相手には付かず、ラインを上げて置き去りにする
      if (running && r.x > actualLine - 14 && dist(o.pos, p.pos) < 12) {
        target = { x: Math.max(r.x - 2, 3), y: r.y };
        break;
      }
    }
  }

  // 自分の持ち場に入ってきた保持者には寄せて奪いに行く
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  // 1人が寄せたら、残りはカバーに回る
  const someoneOnBall = carrier !== null && m.players.some(
    (q) => q.team === side && q.id !== p.id && (q.pressing || dist(q.pos, carrier.pos) < dist(p.pos, carrier.pos)) && dist(q.pos, carrier.pos) < 4,
  );
  if (carrier && carrier.team !== side && !someoneOnBall && dist(carrier.pos, p.pos) < 6 && dist(carrier.pos, base) < 10) {
    p.target = { ...carrier.pos };
    p.urgency = 0.9;
    p.pressing = true;
    return;
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

/** そのチームで最も自陣ゴールに近いフィールドプレーヤーの位置(自チーム基準)。 */
function deepestOutfield(m: MatchState, side: Side): number {
  let x = 1e9;
  for (const p of m.players) if (p.team === side && p.role !== 'gk') x = Math.min(x, toRel(side, p.pos).x);
  return x;
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
  // ボックス内へのスルーパスは、届くなら飛び出して処理する
  const pass = m.ball.pass;
  if (pass && m.players[pass.from].team !== p.team && !pass.cross) {
    const pt = toRel(p.team, pass.point);
    if (pt.x < 16.5 && Math.abs(pt.y - 34) < 20 && dist(p.pos, pass.point) < 14) {
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
