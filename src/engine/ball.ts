import { clamp, dist, relX, toRel } from './geometry';
import { DeadKind, GOAL_H, GOAL_W, MatchState, PITCH_H, PITCH_W, Player, Side, TICK, Vec } from './types';
import { addEvent, gameMinute } from './events';
import { attemptHeader } from './onBall';

const G = 9.8;
export const GROUND_DECEL = 2.6;
const ARRIVE_SPEED = 9;

export function groundPassSpeed(d: number) {
  return Math.sqrt(ARRIVE_SPEED * ARRIVE_SPEED + 2 * GROUND_DECEL * d);
}
export function groundPassTime(d: number) {
  return (groundPassSpeed(d) - ARRIVE_SPEED) / GROUND_DECEL;
}
export function loftTime(d: number) {
  return 0.9 + d / 30;
}

export function kick(m: MatchState, to: Vec, speed: number, vz = 0) {
  const b = m.ball;
  const d = dist(b.pos, to) || 1;
  b.owner = -1;
  b.vel = { x: ((to.x - b.pos.x) / d) * speed, y: ((to.y - b.pos.y) / d) * speed };
  b.vz = vz;
}

export function giveBall(m: MatchState, p: Player) {
  const b = m.ball;
  b.owner = p.id;
  b.lastTouch = p.id;
  b.vel = { x: 0, y: 0 };
  b.vz = 0;
  b.z = 0;
  b.shot = null;
  m.challenged = -1;
  setPossession(m, p.team);
}

export function setPossession(m: MatchState, side: Side) {
  if (m.possession !== side) {
    m.possession = side;
    m.possessionSince = m.t;
  }
}

function startDead(m: MatchState, kind: DeadKind, team: Side, at: Vec, delay: number) {
  const b = m.ball;
  b.owner = -1;
  b.pass = null;
  b.shot = null;
  b.vel = { x: 0, y: 0 };
  b.vz = 0;
  b.z = 0;
  b.pos = { ...at };
  setPossession(m, team);
  let taker = -1;
  let best = 1e9;
  for (const p of m.players) {
    if (p.team !== team) continue;
    if (kind === 'goalkick') {
      if (p.role === 'gk') taker = p.id;
      continue;
    }
    if (p.role === 'gk' && kind !== 'free') continue;
    const d = dist(p.pos, at) * (p.role === 'gk' ? 1.5 : 1);
    if (d < best) {
      best = d;
      taker = p.id;
    }
  }
  m.dead = { kind, team, at: { ...at }, until: m.t + delay, taker };
  if (kind === 'corner') m.setPieceUntil = m.t + delay + 3;
}

export function freeKick(m: MatchState, team: Side, at: Vec) {
  startDead(m, 'free', team, at, 1.6);
}

export function stepBall(m: MatchState) {
  const b = m.ball;
  b.prev = { ...b.pos };
  if (b.owner >= 0) {
    const p = m.players[b.owner];
    const sp = Math.hypot(p.vel.x, p.vel.y);
    const dir = sp > 0.3 ? { x: p.vel.x / sp, y: p.vel.y / sp } : { x: p.team === 0 ? 1 : -1, y: 0 };
    b.pos = { x: p.pos.x + dir.x * 0.7, y: p.pos.y + dir.y * 0.7 };
    b.z = 0;
    return;
  }
  if (m.dead) return;

  b.pos.x += b.vel.x * TICK;
  b.pos.y += b.vel.y * TICK;
  if (b.z > 0 || b.vz > 0) {
    b.z += b.vz * TICK;
    b.vz -= G * TICK;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = Math.abs(b.vz) > 2.5 ? -b.vz * 0.35 : 0;
      b.vel.x *= 0.72;
      b.vel.y *= 0.72;
    }
  } else {
    const sp = Math.hypot(b.vel.x, b.vel.y);
    if (sp > 0) {
      const ns = Math.max(0, sp - GROUND_DECEL * TICK);
      b.vel.x *= ns / sp;
      b.vel.y *= ns / sp;
    }
  }
  if (b.pass && b.z === 0 && b.vz === 0 && Math.hypot(b.vel.x, b.vel.y) < 2) b.pass = null;
  if (checkOut(m)) return;
  resolveShot(m);
  if (!b.shot) checkControl(m);
}

function resolveShot(m: MatchState) {
  const b = m.ball;
  const s = b.shot;
  if (!s) return;
  if (s.outcome === 'blocked') {
    const d = m.players[s.blocker];
    if (dist(d.pos, b.pos) < 1.8) {
      b.shot = null;
      b.lastTouch = d.id;
      const a = m.rand() * Math.PI * 2;
      b.vel = { x: Math.cos(a) * 9, y: Math.sin(a) * 9 };
      b.vz = 1.5;
    }
  } else if (s.outcome === 'saved') {
    const shooterTeam = m.players[s.shooter].team;
    const gk = m.players.find((p) => p.team !== shooterTeam && p.role === 'gk')!;
    if (dist(gk.pos, b.pos) < 2.5) {
      b.shot = null;
      m.stats[shooterTeam].onTarget += 1;
      addEvent(m, 'save', '好セーブ', gk.team);
      if (m.rand() < 0.6) {
        giveBall(m, gk);
        b.pass = null;
        gk.decideAt = m.t + 1.8;
      } else {
        // 弾いたボールはこぼれ球になり、セカンドボールの勝負になる。
        const a = (m.rand() - 0.5) * 2.4;
        const out = gk.team === 0 ? 1 : -1;
        b.lastTouch = gk.id;
        b.vel = { x: Math.cos(a) * 8 * out, y: Math.sin(a) * 8 };
        b.vz = 1;
      }
    }
  }
}

function checkOut(m: MatchState): boolean {
  const b = m.ball;
  const { x, y } = b.pos;
  const last = m.players[b.lastTouch];
  const lastTeam: Side = last ? last.team : 0;
  if (y < 0 || y > PITCH_H) {
    const other = (1 - lastTeam) as Side;
    startDead(m, 'throw', other, { x: clamp(x, 1, PITCH_W - 1), y: y < 0 ? 0.3 : PITCH_H - 0.3 }, 1.7);
    return true;
  }
  if (x < 0 || x > PITCH_W) {
    const defending: Side = x < 0 ? 0 : 1;
    const inGoal = Math.abs(y - 34) < GOAL_W / 2 && b.z < GOAL_H;
    if (inGoal && !(b.shot && b.shot.outcome !== 'goal')) {
      scoreGoal(m, (1 - defending) as Side);
      return true;
    }
    if (lastTeam === defending) {
      const c = { x: x < 0 ? 0.3 : PITCH_W - 0.3, y: y < 34 ? 0.3 : PITCH_H - 0.3 };
      m.stats[(1 - defending) as Side].corners += 1;
      addEvent(m, 'corner', 'コーナーキック', (1 - defending) as Side);
      startDead(m, 'corner', (1 - defending) as Side, c, 2.6);
    } else {
      startDead(m, 'goalkick', defending, { x: x < 0 ? 5.5 : PITCH_W - 5.5, y: 34 }, 2);
    }
    return true;
  }
  return false;
}

function scoreGoal(m: MatchState, team: Side) {
  m.score[team] += 1;
  const shooter = m.ball.shot ? m.players[m.ball.shot.shooter] : m.players[m.ball.lastTouch];
  m.stats[team].onTarget += 1;
  addEvent(m, 'goal', `ゴール! #${shooter?.number ?? ''} (${m.cfg.teams[team].short})`, team);
  m.ball.shot = null;
  m.ball.pass = null;
  kickoffAfterGoal(m, (1 - team) as Side);
}

/** match.ts が登録する、キックオフ配置へ戻す処理。循環参照を避けるためここで受ける。 */
let kickoffHandler: (m: MatchState, team: Side, delay: number) => void = () => {};
export function setKickoffHandler(h: typeof kickoffHandler) {
  kickoffHandler = h;
}
function kickoffAfterGoal(m: MatchState, team: Side) {
  kickoffHandler(m, team, 3.5);
}

function checkControl(m: MatchState) {
  const b = m.ball;
  const sp = Math.hypot(b.vel.x, b.vel.y);
  const pass = b.pass;
  let best: Player | null = null;
  let bestD = 1e9;
  for (const p of m.players) {
    if (m.t < p.stunnedUntil) continue;
    const reach = p.role === 'gk' && inOwnBox(p, b.pos) ? 2 : 1.25;
    const maxZ = p.role === 'gk' && inOwnBox(p, b.pos) ? 2.7 : 2.0;
    if (b.z > maxZ) continue;
    const d = dist(p.pos, b.pos);
    if (d > reach) continue;
    if (d < bestD) {
      const isTarget = pass !== null && pass.to === p.id;
      const mate = pass !== null && m.players[pass.from].team === p.team;
      let chance = 1;
      if (!isTarget) {
        if (mate) chance = 0.75;
        else if (sp < 8) chance = 0.85;
        else if (sp < 13) chance = 0.42;
        else chance = 0.2;
        if (pass && pass.from === p.id) continue;
      }
      if (m.rand() < chance) {
        best = p;
        bestD = d;
      }
    }
  }
  if (!best) return;
  takeControl(m, best);
}

function inOwnBox(p: Player, at: Vec) {
  const r = toRel(p.team, at);
  return r.x < 16.5 && Math.abs(r.y - 34) < 20.2;
}

function takeControl(m: MatchState, p: Player) {
  const b = m.ball;
  const pass = b.pass;
  if (pass) {
    const passer = m.players[pass.from];
    const stats = m.stats[passer.team];
    if (passer.team === p.team) {
      if (pass.offside[p.id]) {
        m.stats[p.team].offsides += 1;
        addEvent(m, 'offside', 'オフサイド', (1 - p.team) as Side);
        b.pass = null;
        freeKick(m, (1 - p.team) as Side, { ...p.pos });
        return;
      }
      stats.passesDone += 1;
      const key = `${passer.slot}-${p.slot}`;
      stats.links[key] = (stats.links[key] ?? 0) + 1;
      if (relX(p.team, p.pos.x) > 70) stats.finalThirdPasses += 1;
    } else {
      const s = m.stats[p.team];
      s.interceptions += 1;
      onBallWon(m, p);
    }
  }
  // 空中のボールを相手ボックス内で受けたら、そのままヘディング/ボレー。
  const header = b.z > 0.9;
  const attackingBox = toRel(p.team, b.pos);
  const wasCross = pass?.cross && m.players[pass.from].team === p.team;
  if (p.role !== 'gk' && wasCross && attackingBox.x > 88.5 && Math.abs(attackingBox.y - 34) < 18) {
    b.pass = null;
    if (attemptHeader(m, p, header)) return;
  }
  b.pass = null;
  giveBall(m, p);
  p.decideAt = m.t + 0.25;
}

export function onBallWon(m: MatchState, p: Player) {
  const r = relX(p.team, p.pos.x);
  if (r > 58) m.stats[p.team].ballWinsHigh += 1;
  const loser = (1 - p.team) as Side;
  if (r < 52.5 && m.tactics[p.team].onWin === 'counter') m.stats[p.team].counters += 1;
  if (r > 52.5) m.stats[loser].turnoversOwnHalf += 1;
}

export function gameMinuteOf(m: MatchState) {
  return gameMinute(m);
}
