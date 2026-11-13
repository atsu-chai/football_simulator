import { TRACKING_MOTION } from './tracking';
import { FORMATIONS } from '../data/formations';
import { assignMarks, teamDefense } from './defending';
import { dist, mulberry32, relX, toAbs, toRel, vec } from './geometry';
import { interceptPoint, attackerMove } from './offBall';
import { decideOnBall, resolveTackles, restartWith } from './onBall';
import { setKickoffHandler, stepBall } from './ball';
import { addEvent, gameMinute } from './events';
import { runCoach } from './coach';
import { shapeTarget, updateFrames, updateLastLines } from './teamShape';
import {
  Ball, DeadBall, MATCH_SECONDS, MatchConfig, MatchState, PITCH_H, PITCH_W, Player, Side, TICK, Tactics,
  TeamStats, Vec,
} from './types';

/** プレスする選手1人・1ティックあたりの消耗。全試合走り続けるとほぼ尽きる。 */
const PRESS_COST = 0.0001 * (900 / 1200);
const NUMBERS = [1, 2, 4, 5, 3, 6, 8, 10, 7, 11, 9];

function emptyStats(): TeamStats {
  return {
    possessionTicks: 0, passes: 0, passesDone: 0, longPasses: 0, shots: 0, onTarget: 0, xg: 0,
    tackles: 0, interceptions: 0, defActionsHigh: 0, passesOwn60: 0, finalThirdPasses: 0,
    lineBreaks: 0, turnoversOwnHalf: 0, ballWinsHigh: 0, counters: 0, offsides: 0, corners: 0,
    crosses: 0, halfSpaceShots: 0,
    posSum: Array.from({ length: 11 }, () => ({ x: 0, y: 0, n: 0 })),
    links: {},
  };
}

function makePlayers(cfg: MatchConfig): Player[] {
  const out: Player[] = [];
  for (const side of [0, 1] as Side[]) {
    const t = cfg.teams[side].tactics;
    FORMATIONS[t.formation].forEach((slot, i) => {
      out.push({
        id: out.length, team: side, slot: i, role: t.roles?.[i] ?? slot.role, number: NUMBERS[i],
        pos: vec(0, 0), prev: vec(0, 0), vel: vec(0, 0), target: vec(0, 0), moveTarget: vec(0, 0), urgency: 0.5,
        decideAt: 0, stunnedUntil: 0, runUntil: 0, runTarget: null, nextSpotAt: 0, spot: null, spotOwner: -1,
        markTarget: -1, pressing: false,
      });
    });
  }
  return out;
}

export function createMatch(cfg: MatchConfig): MatchState {
  const ball: Ball = {
    pos: vec(PITCH_W / 2, PITCH_H / 2), prev: vec(PITCH_W / 2, PITCH_H / 2), z: 0, vel: vec(0, 0),
    vz: 0, owner: -1, lastTouch: 0, pass: null, shot: null,
  };
  const frame = { hasBall: false, line: 30, length: 30, width: 40, cy: 34 };
  const m: MatchState = {
    cfg, t: 0, half: 1, finished: false, atHalftime: false,
    players: makePlayers(cfg), ball,
    tactics: [{ ...cfg.teams[0].tactics }, { ...cfg.teams[1].tactics }],
    possession: 0, possessionSince: 0, turnoverAt: -1e9, frames: [{ ...frame }, { ...frame }],
    lineDrop: [0, 0], energy: [1, 1], lastLine: [30, 30], dead: null, setPieceUntil: 0, score: [0, 0],
    stats: [emptyStats(), emptyStats()], shots: [], events: [], frames_rec: [],
    firedScripts: new Set(), firedHints: new Set(), coachNextAt: 15,
    rand: mulberry32(cfg.seed), markingDirty: [true, true], challenged: -1, skillNow: [1, 1],
  };
  refreshSkill(m);
  kickoff(m, 0, 1);
  addEvent(m, 'kickoff', 'キックオフ');
  return m;
}

/** キックオフの配置に戻す。 */
export function kickoff(m: MatchState, team: Side, delay: number) {
  m.ball.pos = vec(PITCH_W / 2, PITCH_H / 2);
  m.ball.prev = { ...m.ball.pos };
  m.ball.vel = vec(0, 0);
  m.ball.vz = 0;
  m.ball.z = 0;
  m.ball.owner = -1;
  m.ball.pass = null;
  m.ball.shot = null;
  m.possession = team;
  m.possessionSince = m.t;
  m.turnoverAt = -1e9;
  m.lineDrop = [0, 0];
  m.setPieceUntil = 0;
  updateLastLines(m);
  for (const p of m.players) {
    const slot = FORMATIONS[m.tactics[p.team].formation][p.slot];
    const x = slot.x < 0 ? 5 : 22 + slot.x * 24;
    const rel: Vec = { x, y: slot.x < 0 ? 34 : 10 + slot.y * 48 };
    const a = toAbs(p.team, rel);
    p.pos = a;
    p.prev = { ...a };
    p.vel = vec(0, 0);
    p.target = { ...a };
    p.moveTarget = { ...a };
    p.runTarget = null;
    p.spot = null;
    p.spotOwner = -1;
    p.stunnedUntil = 0;
    p.pressing = false;
  }
  const taker = m.players
    .filter((p) => p.team === team && (p.role === 'st' || p.role === 'f9' || p.role === 'am' || p.role === 'cm'))
    .sort((a, b) => relX(team, b.pos.x) - relX(team, a.pos.x))[0];
  // キックオフは配置し直した状態から開始する。キッカーを後から瞬間移動させない。
  taker.pos = vec(PITCH_W / 2, PITCH_H / 2);
  taker.prev = { ...taker.pos };
  taker.target = { ...taker.pos };
  taker.moveTarget = { ...taker.pos };
  for (const p of m.players) if (p.team !== team && dist(p.pos, taker.pos) < 9.15) {
    const r = toRel(p.team, p.pos);
    r.x = Math.min(r.x, PITCH_W / 2 - 9.15);
    p.pos = toAbs(p.team, r); p.prev = { ...p.pos }; p.target = { ...p.pos }; p.moveTarget = { ...p.pos };
  }
  m.dead = { kind: 'kickoff', team, at: vec(PITCH_W / 2, PITCH_H / 2), until: m.t + delay, maxUntil: m.t + delay, taker: taker.id };
  m.markingDirty = [true, true];
}

setKickoffHandler(kickoff);

export function resume(m: MatchState) {
  if (!m.atHalftime) return;
  m.atHalftime = false;
  kickoff(m, 1, 1);
}

/** 試合中の戦術変更。役割の再割当も行う。 */
/** 地力を計算し直す。ステージの相手は、こちらの設定が弱点を突いているほど崩れる。 */
export function refreshSkill(m: MatchState) {
  for (const s of [0, 1] as Side[]) {
    const team = m.cfg.teams[s];
    m.skillNow[s] = (team.skill ?? 1) * (team.skillMod ? team.skillMod(m) : 1);
  }
}

export function setTactics(m: MatchState, side: Side, t: Tactics) {
  m.tactics[side] = { ...t };
  const slots = FORMATIONS[t.formation];
  for (const p of m.players) {
    if (p.team !== side) continue;
    p.role = t.roles?.[p.slot] ?? slots[p.slot].role;
  }
  m.markingDirty[side] = true;
  refreshSkill(m);
}

function movePlayer(m: MatchState, p: Player) {
  p.prev = { ...p.pos };
  const stunned = m.t < p.stunnedUntil;
  const isCarrier = m.ball.owner === p.id;
  const urgent = !m.dead && (isCarrier || p.pressing || p.urgency >= 0.9);
  // 追走・保持時は反応を優先し、持ち場の調整は実測の横移動の遅れに応じて平滑化する。
  const target = p.moveTarget;
  const blend = 1 - Math.exp(-TICK / (urgent ? 0.15 : TRACKING_MOTION.response));
  if (dist(target, p.target) > (urgent ? 0.15 : 0.7)) {
    target.x += (p.target.x - target.x) * blend;
    target.y += (p.target.y - target.y) * blend;
  }
  p.moveTarget = target;
  const dx = target.x - p.pos.x;
  const dy = target.y - p.pos.y;
  const d = Math.hypot(dx, dy);
  let carry = 6.2;
  if (isCarrier) {
    // 前に守備者がいなければ、ほぼ全速でゴールへ運べる
    const x = relX(p.team, p.pos.x);
    const ahead = m.players.some((o) => o.team !== p.team && o.role !== 'gk' && relX(p.team, o.pos.x) > x - 1 && dist(o.pos, p.pos) < 14);
    if (!ahead) carry = 7.5;
    // 守備者がすぐ近くにいる時は、ボールを守りながらなので速く運べない
    else if (m.players.some((o) => o.team !== p.team && o.role !== 'gk' && dist(o.pos, p.pos) < 3)) carry = 5.2;
  }
  // 持ち場に近い時は歩き、大きくスライドする時は走る。一定の緊急度で全員が同じ速さにならない。
  const recovery = Math.min(m.dead ? 3.8 : TRACKING_MOTION.running, 0.5 + d * (m.dead ? 0.32 : 0.23)) * (0.7 + p.urgency * 0.3);
  // 裏抜け・パスへの追走だけスプリントし、寄せや帰陣の高緊急度と区別する。
  const sprintAction = p.runTarget !== null || m.ball.pass?.to === p.id;
  const chaseSpeed = (sprintAction ? TRACKING_MOTION.sprint : 5.8) * p.urgency;
  const top = (isCarrier ? carry : urgent ? chaseSpeed : recovery) * (stunned ? 0.35 : 1);
  const tired = 0.72 + 0.28 * m.energy[p.team];
  // 到着前に減速する。位置の微調整で走り続けない。
  const remaining = Math.max(0, d - (urgent || m.dead?.taker === p.id ? 0.15 : m.dead ? 0.8 : 1.2));
  const speed = Math.min(top * tired, remaining * (urgent ? 2.2 : 1.2), Math.sqrt(2 * 3 * remaining));
  let vx = d > 0.05 ? (dx / d) * speed : 0;
  let vy = d > 0.05 ? (dy / d) * speed : 0;
  // 味方と重ならないように少し離れる
  for (const o of m.players) {
    if (o.id === p.id || o.team !== p.team) continue;
    const sx = p.pos.x - o.pos.x;
    const sy = p.pos.y - o.pos.y;
    const sd = Math.hypot(sx, sy);
    if (sd < 1.8 && sd > 0.01) {
      vx += (sx / sd) * (1.8 - sd) * 0.7;
      vy += (sy / sd) * (1.8 - sd) * 0.7;
    }
  }
  // 加速・旋回を制限する。押し戻しを足しても最高速度を超えない。
  const desired = Math.hypot(vx, vy);
  if (desired > top * tired) { vx *= top * tired / desired; vy *= top * tired / desired; }
  const maxDv = (urgent ? TRACKING_MOTION.acceleration : TRACKING_MOTION.adjustmentAcceleration) * TICK;
  const ax = vx - p.vel.x;
  const ay = vy - p.vel.y;
  const a = Math.hypot(ax, ay);
  const k = a > maxDv ? maxDv / a : 1;
  p.vel.x += ax * k;
  p.vel.y += ay * k;
  p.pos.x += p.vel.x * TICK;
  p.pos.y += p.vel.y * TICK;
  p.pos.x = Math.max(0.2, Math.min(PITCH_W - 0.2, p.pos.x));
  p.pos.y = Math.max(0.2, Math.min(PITCH_H - 0.2, p.pos.y));
}

function stepDead(m: MatchState) {
  const d = m.dead!;
  const taker = m.players[d.taker];
  for (const p of m.players) {
    if (p.id === d.taker) {
      p.target = { ...d.at };
      p.urgency = 1;
      continue;
    }
    p.runTarget = null;
    p.pressing = false;
    let target = setPieceTarget(m, p, d.kind) ?? shapeTarget(m, p);
    // 相手のリスタートから離れる
    if (p.team !== d.team && dist(target, d.at) < 8) {
      const a = Math.atan2(target.y - d.at.y, target.x - d.at.x);
      target = { x: d.at.x + Math.cos(a) * 8, y: d.at.y + Math.sin(a) * 8 };
    }
    p.target = target;
    p.urgency = d.kind === 'kickoff' ? 0.3 : 0.92;
  }
  if (m.t >= d.maxUntil || (m.t >= d.until && restartReady(m, d))) {
    taker.pos = { ...d.at };
    taker.prev = { ...d.at };
    m.ball.pos = { ...d.at };
    m.setPieceUntil = d.kind === 'corner' ? m.t + 3 : 0;
    m.dead = null;
    restartWith(m, taker);
    if (d.kind === 'goalkick') taker.decideAt = m.t + 0.1;
  }
}

/** キッカーがボールに着き、ほとんどの選手が持ち場に戻ったら再開できる。 */
function restartReady(m: MatchState, d: DeadBall): boolean {
  if (dist(m.players[d.taker].pos, d.at) > 1) return false;
  let late = 0;
  for (const p of m.players) {
    if (p.id === d.taker || p.role === 'gk') continue;
    if (dist(p.pos, p.target) > 3) late++;
  }
  return late <= 2;
}

const BOX_SPOTS: Vec[] = [
  { x: 97, y: 29 }, { x: 97, y: 39 }, { x: 94, y: 34 }, { x: 99, y: 34 }, { x: 92, y: 26 }, { x: 92, y: 42 },
];

function setPieceTarget(m: MatchState, p: Player, kind: string): Vec | null {
  if (kind === 'kickoff') return { ...p.target };
  if (kind !== 'corner' && m.t >= m.setPieceUntil) return null;
  if (p.role === 'gk') return null;
  const t = m.tactics[p.team];
  const attackers = m.possession === p.team;
  const idx = FORMATIONS[t.formation].length - p.slot - 1;
  if (idx >= BOX_SPOTS.length) return null;
  if (attackers) return toAbs(p.team, BOX_SPOTS[idx]);
  const spot = BOX_SPOTS[idx];
  // 守備側は相手と同じ地点のゴール寄りに立つ(相手基準 → 自チーム基準で反転)
  return toAbs((1 - p.team) as Side, { x: spot.x + 1.5, y: spot.y });
}

function runScript(m: MatchState) {
  const s = m.cfg.script;
  if (!s) return;
  const min = gameMinute(m);
  const diff = m.score[s.side] - m.score[(1 - s.side) as Side];
  s.phases.forEach((ph, i) => {
    if (m.firedScripts.has(i)) return;
    if (ph.atMinute !== undefined && min < ph.atMinute) return;
    if (ph.whenDiffAtMost !== undefined && diff > ph.whenDiffAtMost) return;
    if (ph.whenDiffAtLeast !== undefined && diff < ph.whenDiffAtLeast) return;
    m.firedScripts.add(i);
    setTactics(m, s.side, { ...m.tactics[s.side], ...ph.change });
    addEvent(m, 'tactic', ph.message, s.side);
  });
}

function record(m: MatchState) {
  const f = new Float32Array(m.players.length * 2 + 3);
  m.players.forEach((p, i) => {
    f[i * 2] = p.pos.x;
    f[i * 2 + 1] = p.pos.y;
  });
  const n = m.players.length * 2;
  f[n] = m.ball.pos.x;
  f[n + 1] = m.ball.pos.y;
  f[n + 2] = m.ball.z;
  m.frames_rec.push(f);
}

/** 試合を 1 ティック進める。 */
export function step(m: MatchState) {
  if (m.finished || m.atHalftime) return;
  m.t += TICK;
  runScript(m);
  if (Math.round(m.t / TICK) % 50 === 0) refreshSkill(m);
  updateLastLines(m);
  updateFrames(m);
  for (const side of [0, 1] as Side[]) if (m.markingDirty[side]) assignMarks(m, side);

  if (m.dead) {
    stepDead(m);
  } else {
    const ownerId = m.ball.owner;
    const pass = m.ball.pass;
    const attackSide = m.possession;
    const defendSide = (1 - attackSide) as Side;

    teamDefense(m, defendSide);
    for (const p of m.players) {
      if (p.team !== attackSide) continue;
      if (p.id === ownerId) continue;
      if (pass && pass.to === p.id) {
        const ip = interceptPoint(m, p);
        p.target = dist(p.pos, pass.point) < 12 ? ip.at : pass.point;
        p.urgency = 1;
        continue;
      }
      attackerMove(m, p);
    }
    // 持ち主のいないボールは両チームの最寄りが追う
    if (ownerId < 0 && !pass && !m.ball.shot) chaseLooseBall(m);

    if (ownerId >= 0) {
      const c = m.players[ownerId];
      const pressure = pressureOn(m, c);
      if (m.t >= c.decideAt || (pressure < 2 && m.t >= c.decideAt - 0.3)) {
        const budget = { slow: 1.05, normal: 0.7, fast: 0.42 }[m.tactics[c.team].tempo];
        c.decideAt = m.t + budget * (c.role === 'gk' ? 1.3 : 1);
        decideOnBall(m, c);
      }
    }
    resolveTackles(m);
  }
  for (const p of m.players) movePlayer(m, p);
  const before = m.possession;
  stepBall(m);
  // 相手陣寄りでの奪取を PPDA の守備アクションとして数える
  if (before !== m.possession && !m.dead && relX(m.possession, m.ball.pos.x) > 42) {
    m.stats[m.possession].defActionsHigh += 1;
  }

  m.stats[m.possession].possessionTicks += 1;
  for (const p of m.players) {
    if (p.pressing) m.energy[p.team] = Math.max(0, m.energy[p.team] - PRESS_COST);
  }
  for (const p of m.players) {
    if (p.team !== m.possession) continue;
    const s = m.stats[p.team].posSum[p.slot];
    s.x += relX(p.team, p.pos.x);
    s.y += toRel(p.team, p.pos).y;
    s.n += 1;
  }
  if (m.cfg.record) record(m);
  runCoach(m);

  const half = MATCH_SECONDS / 2;
  if (m.half === 1 && m.t >= half) {
    m.half = 2;
    m.atHalftime = true;
    addEvent(m, 'halftime', 'ハーフタイム');
  } else if (m.t >= MATCH_SECONDS) {
    m.finished = true;
    addEvent(m, 'fulltime', '試合終了');
  }
}

function pressureOn(m: MatchState, c: Player) {
  let best = 1e9;
  for (const o of m.players) if (o.team !== c.team) best = Math.min(best, dist(o.pos, c.pos));
  return best;
}

function chaseLooseBall(m: MatchState) {
  for (const side of [0, 1] as Side[]) {
    let best: Player | null = null;
    let bestT = 1e9;
    let at: Vec = m.ball.pos;
    for (const p of m.players) {
      if (p.team !== side || p.role === 'gk') continue;
      const ip = interceptPoint(m, p);
      if (ip.time < bestT) {
        bestT = ip.time;
        best = p;
        at = ip.at;
      }
    }
    if (best) {
      best.target = at;
      best.urgency = 1;
      best.runTarget = null;
    }
  }
}

export function runToEnd(m: MatchState) {
  while (!m.finished) {
    step(m);
    if (m.atHalftime) resume(m);
  }
  return m;
}
