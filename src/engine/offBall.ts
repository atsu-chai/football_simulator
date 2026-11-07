import { clamp, dist, pointToSegment, toAbs, toRel } from './geometry';
import { GROUND_DECEL } from './ball';
import { threat, nearestOpp } from './onBall';
import { offsideLimit, oppLineX, shapeTarget } from './teamShape';
import { MatchState, PITCH_W, Player, TICK, Vec } from './types';

const RUN_ROLES = new Set(['st', 'wg', 'iw', 'am', 'wb', 'fb', 'cm']);

/** 攻撃側の味方(ボール保持者以外)の動き。 */
export function attackerMove(m: MatchState, p: Player) {
  const side = p.team;
  const t = m.tactics[side];
  const base = shapeTarget(m, p);
  p.pressing = false;
  if (p.role === 'gk') {
    p.target = base;
    p.urgency = 0.6;
    return;
  }

  const sinceWin = m.t - m.possessionSince;
  const counter = t.onWin === 'counter' && sinceWin < 6;
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  const rel = toRel(side, p.pos);
  const lim = offsideLimit(m, side);

  // 走り出している選手
  if (p.runTarget && p.runUntil > m.t) {
    p.target = p.runTarget;
    p.urgency = 1;
    return;
  }
  p.runTarget = null;

  // 裏抜け: 味方が前を向けているとき、最終ラインの背後にスペースがあれば走る
  if (carrier && carrier.team === side && RUN_ROLES.has(p.role)) {
    const space = PITCH_W - 7 - oppLineX(m, side);
    const carrierFree = nearestOpp(m, side, carrier.pos) > 3.5;
    const nearLine = rel.x > lim - 9 && rel.x <= lim;
    const rate = (counter ? 0.9 : 0.55) * (p.role === 'st' || p.role === 'wg' || p.role === 'iw' ? 1 : 0.5);
    if (space > 6 && carrierFree && nearLine && m.rand() < rate * TICK) {
      const depth = Math.min(space, 16);
      const tgtRel = { x: lim + depth, y: clamp(rel.y + (34 - rel.y) * 0.25, 4, 64) };
      p.runTarget = toAbs(side, tgtRel);
      p.runUntil = m.t + 2.6;
      p.target = p.runTarget;
      p.urgency = 1;
      return;
    }
  }

  // サイドの深い位置にボールが入ったら、ゴール前へ飛び込む
  if (carrier && carrier.team === side && (p.role === 'st' || p.role === 'f9' || p.role === 'am' || p.role === 'iw' || p.role === 'wg')) {
    const cr = toRel(side, carrier.pos);
    if (cr.x > 74 && Math.abs(cr.y - 34) > 12 && Math.abs(rel.y - cr.y) > 6) {
      const lane = p.slot % 2 === 0 ? -4.5 : 4.5;
      p.target = toAbs(side, { x: Math.min(lim - 0.3, 95), y: 34 + lane });
      p.urgency = 0.95;
      return;
    }
  }

  // カウンター: 前線が一気に駆け上がる
  if (counter && rel.x < lim - 2 && p.role !== 'cb' && p.role !== 'dm') {
    const baseRel = toRel(side, base);
    p.target = toAbs(side, { x: Math.min(lim - 0.5, baseRel.x + 16), y: baseRel.y });
    p.urgency = 0.95;
    return;
  }

  // 空いている場所を探して受ける
  const ballDist = dist(p.pos, m.ball.pos);
  if (ballDist < 32 && p.role !== 'cb') {
    if (m.t >= p.nextSpotAt) {
      p.nextSpotAt = m.t + 0.5 + m.rand() * 0.3;
      p.spot = findOpenSpot(m, p, base, lim);
    }
    if (p.spot) {
      p.target = p.spot;
      p.urgency = 0.72;
      return;
    }
  }
  p.spot = null;
  p.target = base;
  p.urgency = dist(p.pos, base) > 9 ? 0.75 : 0.5;
}

function findOpenSpot(m: MatchState, p: Player, base: Vec, lim: number): Vec {
  const side = p.team;
  const baseRel = toRel(side, base);
  const ballPos = m.ball.pos;
  let best = base;
  let bestScore = -1e9;
  for (let i = -1; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i < 0 ? 0 : 6.5;
    const c: Vec = {
      x: clamp(baseRel.x + Math.cos(a) * r, 2, Math.min(lim - 0.4, PITCH_W - 3)),
      y: clamp(baseRel.y + Math.sin(a) * r, 2, 66),
    };
    const abs = toAbs(side, c);
    const open = Math.min(nearestOpp(m, side, abs), 8);
    let lane = 8;
    for (const o of m.players) {
      if (o.team === side) continue;
      lane = Math.min(lane, pointToSegment(o.pos, ballPos, abs).d);
    }
    const score = open * 0.5 + Math.min(lane, 6) * 0.6 + threat(c) * 7 - dist(abs, base) * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = abs;
    }
  }
  return best;
}

/** 動いているボールを最も早く捕まえられる地点。 */
export function interceptPoint(m: MatchState, p: Player): { at: Vec; time: number } {
  const b = m.ball;
  const speed = 7.6;
  let pos = { ...b.pos };
  let vel = { ...b.vel };
  let z = b.z;
  let vz = b.vz;
  const dt = 0.2;
  for (let t = 0; t < 3.4; t += dt) {
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
    if (z > 0 || vz > 0) {
      z += vz * dt;
      vz -= 9.8 * dt;
      if (z <= 0) {
        z = 0;
        vz = 0;
        vel = { x: vel.x * 0.72, y: vel.y * 0.72 };
      }
    } else {
      const sp = Math.hypot(vel.x, vel.y);
      if (sp > 0) {
        const ns = Math.max(0, sp - GROUND_DECEL * dt);
        vel = { x: (vel.x * ns) / sp, y: (vel.y * ns) / sp };
      }
    }
    if (z > 2) continue;
    if (dist(p.pos, pos) / speed + 0.1 <= t) return { at: pos, time: t };
  }
  return { at: pos, time: dist(p.pos, pos) / speed + 0.5 };
}
