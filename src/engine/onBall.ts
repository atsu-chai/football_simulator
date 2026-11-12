import { clamp, dist, pointToSegment, relX, sigmoid, toAbs, toRel } from './geometry';
import { GOAL_W, MatchState, PITCH_W, Player, Side, Vec } from './types';
import { giveBall, groundPassSpeed, groundPassTime, kick, loftLandingFor, loftTime, onBallWon } from './ball';
import { addEvent, gameMinute } from './events';
import { offsideLimit } from './teamShape';

const SPRINT = 7.6;
// 実測のブロック配置へ置き換えた後の試合集計で、シュートの期待値を再校正する。
export const XG_SCALE = 1.55;

/** そのチーム基準の位置の脅威度。ゴールに近いほど、ハーフスペースほど高い。 */
export function threat(rel: Vec): number {
  const d = Math.hypot(PITCH_W - rel.x, rel.y - 34);
  let v = 0.35 * (1 - d / 120) + 0.65 * Math.exp(-d / 16);
  const off = Math.abs(rel.y - 34);
  if (rel.x > 70 && off > 7 && off < 21) v += 0.04;
  return v;
}

export function nearestOpp(m: MatchState, side: Side, at: Vec): number {
  let best = 1e9;
  for (const p of m.players) {
    if (p.team === side || p.role === 'gk') continue;
    const d = dist(p.pos, at);
    if (d < best) best = d;
  }
  return best;
}

/** 相手がパスに届くまでの時間差から、パスの通りやすさを見積もる。 */
export function passSafety(m: MatchState, from: Vec, to: Vec, side: Side, lofted: boolean, receiver?: Player): number {
  const d = dist(from, to);
  const total = lofted ? loftTime(d) : groundPassTime(d);
  let margin = 9;
  for (const o of m.players) {
    if (o.team === side) continue;
    const reach = o.role === 'gk' ? 2 : 1.25;
    if (lofted) {
      // 浮き球は滞空中に両者が落下点へ寄るので、受け手との到達競争になる
      const tOpp = (dist(o.pos, to) - reach) / SPRINT + 0.2;
      const tMe = receiver ? dist(receiver.pos, to) / SPRINT : total;
      margin = Math.min(margin, tOpp - Math.max(tMe, 0));
    } else {
      const { d: lane, t } = pointToSegment(o.pos, from, to);
      // 受け手の背後(パスの到達点より奥)にいる守備者は、受け手より先にはボールに触れない
      const behindReceiver = t > 0.97 && dist(o.pos, from) > dist(to, from);
      const tOpp = (lane - reach) / 6 + 0.42 + (behindReceiver ? 0.5 : 0);
      margin = Math.min(margin, tOpp - total * t);
    }
  }
  let safe = sigmoid(margin * 3 + (lofted ? -0.9 : 1));
  // マークされた受け手への浮き球は、空中戦の五分五分になる
  if (lofted && receiver) {
    const marked = m.players.some((o) => o.team !== side && o.role !== 'gk' && dist(o.pos, receiver.pos) < 2.5);
    safe = Math.min(safe, marked ? 0.45 : 0.62);
  }
  return safe;
}

export function computeXg(m: MatchState, p: Player, at: Vec, header = false): number {
  const rel = toRel(p.team, at);
  const d = Math.hypot(PITCH_W - rel.x, rel.y - 34);
  const a1 = Math.atan2(rel.y - (34 - GOAL_W / 2), PITCH_W - rel.x);
  const a2 = Math.atan2(rel.y - (34 + GOAL_W / 2), PITCH_W - rel.x);
  const angle = Math.abs(a1 - a2);
  // 中央からのシュートの基準値(6m で約0.6、PKの位置で約0.24、16m で約0.10、20m で約0.05、25m で約0.02)
  let xg = 0.6 * Math.exp(-(d - 6) / 5.5);
  // 同じ距離でも、角度がないほど入りにくい
  const central = 2 * Math.atan(GOAL_W / 2 / Math.max(d, 1));
  xg *= clamp(angle / central, 0.25, 1);
  const goal: Vec = toAbs(p.team, { x: PITCH_W, y: 34 });
  let blockers = 0;
  for (const o of m.players) {
    if (o.team === p.team || o.role === 'gk') continue;
    const dd = dist(o.pos, at);
    if (dd < 2) xg *= 0.62;
    else if (dd < 4) xg *= 0.8;
    if (dist(o.pos, goal) < d && pointToSegment(o.pos, at, goal).d < 2.4) blockers += 1;
  }
  xg *= Math.pow(0.72, Math.min(blockers, 4));
  // シュート地点より前にいる守備者の数。カウンターは少なく、整った守備は多い。
  let settled = 0;
  for (const o of m.players) {
    if (o.team === p.team || o.role === 'gk') continue;
    // 真横(2m以内)の守備者もシュートを妨げられるので数える
    if (relX(p.team, o.pos.x) > rel.x - 2 && dist(o.pos, goal) < 26) settled += 1;
  }
  xg *= settled === 0 ? 1.5 : settled === 1 ? 1.2 : settled >= 5 ? 0.7 : settled >= 3 ? 0.85 : 1;
  const gk = m.players.find((o) => o.team !== p.team && o.role === 'gk')!;
  const gkRel = toRel(p.team, gk.pos);
  if (Math.abs(gkRel.y - rel.y) > 7 && d < 18) xg *= 1.4;
  // ヘディングは同じ位置でも足より入りにくい
  if (header) xg *= 0.55;
  return clamp(xg * XG_SCALE * m.skillNow[p.team], 0.005, 0.7);
}

interface Option {
  score: number;
  run: () => void;
}

export function decideOnBall(m: MatchState, p: Player) {
  const t = m.tactics[p.team];
  const side = p.team;
  const rel = toRel(side, p.pos);
  const pressure = nearestOpp(m, side, p.pos);
  const sinceWin = m.t - m.possessionSince;
  const counter = t.onWin === 'counter' && m.t - m.turnoverAt < 6;
  const safeMode = t.onWin === 'keep' && sinceWin < 4;
  const skill = m.skillNow[side];
  const noise = (0.016 + (pressure < 3 ? 0.03 : 0)) / skill;
  const tempoMul = { slow: 0.7, normal: 1, fast: 1.2 }[t.tempo] * (counter ? 1.4 : 1) * (safeMode ? 0.75 : 1);
  const riskPow = { short: 2.1, mixed: 1.5, long: 1.15 }[t.buildUp] * (safeMode ? 1.15 : 1) * (counter ? 0.75 : 1);

  const options: Option[] = [];
  const lim = offsideLimit(m, side);
  const hereValue = threat(rel);
  const lossCost = 0.04 + 0.2 * (1 - rel.x / PITCH_W);

  // シュート
  if (rel.x > 72 && p.role !== 'gk') {
    const xg = computeXg(m, p, p.pos);
    // xG を保持の価値と同じ尺度に直す。ミドルは他に手がない時だけ、ゴール前の好機は迷わず打つ
    const d = Math.hypot(PITCH_W - rel.x, rel.y - 34);
    const longRange = d > 18 ? 0.05 + (d - 18) * 0.008 : 0;
    const inBox = rel.x > PITCH_W - 16.5 && Math.abs(rel.y - 34) < 20.16;
    if (xg > 0.012 && d < 32) options.push({ score: xg * 5.5 + 0.12 + (inBox ? 0.07 : 0) - longRange + (m.rand() - 0.5) * 0.06, run: () => shoot(m, p, xg, false) });
  }

  // パス
  for (const q of m.players) {
    if (q.team !== side || q.id === p.id) continue;
    const qRel = toRel(side, q.pos);
    if (qRel.x > lim + 0.3 && q.role !== 'gk') {
      if (dist(q.pos, p.pos) > 3) continue;
    }
    if (q.role === 'gk' && rel.x > 40) continue;

    const d = dist(p.pos, q.pos);
    const lead = Math.min(1.1, 0.2 + d / 26);
    const leadPt: Vec = { x: q.pos.x + q.vel.x * lead, y: q.pos.y + q.vel.y * lead };
    addPass(leadPt, q, false);
    // 足元への浮き球は、地上で届かない距離か大きなサイドチェンジに限る
    if (d > 28 || (d > 20 && Math.abs(q.pos.y - p.pos.y) > 26)) addPass(leadPt, q, true);

    // 背後のスペースへのスルーパス。走り出している味方にだけ出す。
    if (q.runUntil > m.t && q.runTarget && qRel.x <= lim + 0.3) {
      addPass(q.runTarget, q, false, true);
      if (d > 14) addPass(q.runTarget, q, true, true);
    }
    // 背後への一発。カウンター時、ロング志向、相手ラインが高いときに狙う。
    const spaceBehind = PITCH_W - 7 - lim;
    const forwardRole = q.role === 'st' || q.role === 'wg' || q.role === 'iw';
    if (forwardRole && qRel.x <= lim + 0.3 && rel.x < lim - 6 && (counter || t.buildUp === 'long' || spaceBehind > 18)) {
      const depth = Math.min(spaceBehind + 2, 15);
      const pt = toAbs(side, { x: lim + depth, y: qRel.y + (34 - qRel.y) * 0.2 });
      addPass(pt, q, d > 16, true);
    }
    // サイドからのクロス(ボックス内の味方へ)
    if (rel.x > 74 && Math.abs(rel.y - 34) > 12 && qRel.x > 83 && Math.abs(qRel.y - 34) < 16) {
      addPass(q.pos, q, true, false, true);
    }
  }

  // ゴール前のエリアへのクロス。ニア、ファー、マイナスの折り返しに、最も早く着ける味方を狙う
  if (rel.x > 72 && Math.abs(rel.y - 34) > 11) {
    const near = rel.y < 34 ? -1 : 1;
    const zones: { at: Vec; lofted: boolean }[] = [
      { at: { x: 95, y: 34 + near * 4 }, lofted: true },
      { at: { x: 94, y: 34 - near * 5 }, lofted: true },
    ];
    if (rel.x > 88) zones.push({ at: { x: 89, y: 34 + near * 2 }, lofted: false });
    for (const z of zones) {
      const at = toAbs(side, z.at);
      let runner: Player | null = null;
      let best = 1e9;
      for (const q of m.players) {
        if (q.team !== side || q.id === p.id || q.role === 'gk') continue;
        if (relX(side, q.pos.x) > lim + 0.3) continue;
        const tq = dist(q.pos, at);
        if (tq < best) {
          best = tq;
          runner = q;
        }
      }
      if (runner && best < 16) addPass(at, runner, z.lofted, false, true);
    }
  }

  function addPass(point: Vec, q: Player, lofted: boolean, through = false, cross = false) {
    const pr = toRel(side, point);
    if (pr.x < 1 || pr.x > PITCH_W - 1 || pr.y < 1 || pr.y > 67) return;
    if (dist(point, p.pos) < 3.5) return;
    const safe = cross ? Math.max(0.68, passSafety(m, p.pos, point, side, lofted, q)) : passSafety(m, p.pos, point, side, lofted, q);
    let safeFinal = safe;
    if (through) {
      // 受け手が相手より先に着けるかの競争
      const tMe = dist(q.pos, point) / SPRINT;
      let race = 9;
      for (const o of m.players) {
        if (o.team === side) continue;
        race = Math.min(race, dist(o.pos, point) / SPRINT - tMe);
      }
      safeFinal = Math.min(safe, sigmoid(race * 2.6 + 0.2));
    }
    const open = clamp((nearestOpp(m, side, point) - 1) / 7, 0, 1);
    let value = threat(pr) * (0.62 + 0.38 * open);
    // 何人の相手を越えるか
    let broke = 0;
    for (const o of m.players) {
      if (o.team === side || o.role === 'gk') continue;
      const ox = relX(side, o.pos.x);
      if (ox > rel.x && ox < pr.x) broke += 1;
    }
    const forward = pr.x - rel.x;
    // ライン間を通す縦パスほど価値がある。頭越しのボールは同じ人数を越えても評価を下げる
    value += broke * (lofted && !cross ? 0.012 : 0.03) * tempoMul;
    value += (forward / 105) * (0.3 * tempoMul + 0.2 * clamp(sinceWin / 12, 0, 1));
    // 圧力を受けているときは、確実につなげる味方への逃げのパスに価値がある
    if (pressure < 4 && safe > 0.8 && !lofted) value += 0.07;
    else if (pressure < 7 && safe > 0.85 && !lofted) value += 0.03;
    // 長すぎるパスは精度も受け手の準備も落ちる
    if (!through && !cross) value -= Math.max(0, dist(p.pos, point) - 28) * 0.004;
    if (through) {
      value += 0.12;
      // 前に守備者がほぼいない場所は、ゴールまで遠くても価値が高い
      let ahead = 0;
      for (const o of m.players) {
        if (o.team !== side && o.role !== 'gk' && relX(side, o.pos.x) > pr.x - 2) ahead += 1;
      }
      if (ahead <= 1) value += 0.28;
    }
    if (cross) value += 0.2;
    if (t.focus !== 'balanced') {
      const inFocus = t.focus === 'center' ? Math.abs(pr.y - 34) < 15 : t.focus === 'left' ? pr.y < 27 : pr.y > 41;
      if (inFocus && rel.x > 35) value += 0.035;
    }
    if (lofted) {
      if (!cross && !through) value -= Math.abs(pr.y - rel.y) > 26 ? 0.08 : 0.2;
      if (t.buildUp === 'long' && rel.x < 60 && forward > 12) value += 0.13;
      if (t.buildUp === 'short' && !cross) value -= 0.09;
    }
    // 大きなサイドチェンジ。幅を取るチームほど狙う。
    if (t.width === 'wide' && Math.abs(pr.y - rel.y) > 26) value += 0.05;
    const score =
      Math.pow(safeFinal, riskPow) * value - (1 - safeFinal) * lossCost + (m.rand() - 0.5) * noise * 2;
    options.push({
      score,
      run: () => makePass(m, p, q, point, lofted, cross, through),
    });
  }

  // ドリブル
  const carryDirs = [0, 0.6, -0.6, 1.3, -1.3];
  for (const a of carryDirs) {
    const tgtRel: Vec = {
      x: clamp(rel.x + Math.cos(a) * 8, 2, PITCH_W - 2),
      y: clamp(rel.y + Math.sin(a) * 8, 2, 66),
    };
    const tgt = toAbs(side, tgtRel);
    const lane = laneOpenness(m, p, tgt);
    const open = clamp((nearestOpp(m, side, tgt) - 1) / 7, 0, 1);
    const value = threat(tgtRel) * (0.62 + 0.38 * open) - (rel.x > 70 ? 0.08 : 0.03) - (pressure < 3 ? 0.06 : 0);
    options.push({
      score: value * (0.55 + 0.45 * lane) - (1 - lane) * lossCost + (m.rand() - 0.5) * noise * 2,
      run: () => {
        p.target = tgt;
        p.urgency = 0.85;
        p.decideAt = m.t + 0.6;
      },
    });
  }

  // キープ: 圧力がなければその場で味方の動きを待つ
  if (pressure > 7) {
    options.push({
      score: hereValue * 0.5,
      run: () => {
        p.target = { ...p.pos };
        p.urgency = 0.3;
        p.decideAt = m.t + 0.45;
      },
    });
  }

  // クリア
  if (rel.x < 22 && pressure < 3.5) {
    const tgt = toAbs(side, { x: 62, y: clamp(rel.y + (m.rand() - 0.5) * 24, 6, 62) });
    options.push({ score: 0.1, run: () => clearBall(m, p, tgt) });
  }

  let best: Option | null = null;
  for (const o of options) if (!best || o.score > best.score) best = o;
  best?.run();
}

function laneOpenness(m: MatchState, p: Player, tgt: Vec) {
  let worst = 9;
  for (const o of m.players) {
    if (o.team === p.team || o.role === 'gk') continue;
    const { d } = pointToSegment(o.pos, p.pos, tgt);
    worst = Math.min(worst, d);
  }
  return clamp((worst - 1.5) / 4.5, 0, 1);
}

function makePass(m: MatchState, p: Player, q: Player, point: Vec, lofted: boolean, cross: boolean, through: boolean) {
  const stats = m.stats[p.team];
  const side = p.team;
  const d0 = dist(p.pos, point);
  const pressure = nearestOpp(m, side, p.pos);
  const skill = m.skillNow[side];
  const err = ((lofted ? 0.05 : 0.028) + (pressure < 2.5 ? 0.05 : 0) + d0 * (lofted ? 0.0009 : 0.0005)) / skill;
  const ang = (m.rand() + m.rand() - 1) * err;
  const dir = Math.atan2(point.y - p.pos.y, point.x - p.pos.x) + ang;
  // 浮き球は距離感もずれる(長いほど大きく)
  const len = lofted ? d0 * (1 + (m.rand() + m.rand() - 1) * (0.06 + d0 * 0.0015) / skill) : d0;
  const aim: Vec = { x: p.pos.x + Math.cos(dir) * len, y: p.pos.y + Math.sin(dir) * len };

  stats.passes += 1;
  const rel = relX(side, p.pos.x);
  const relTo = relX(side, aim.x);
  if (rel < 63) stats.passesOwn60 += 1;
  if (lofted) stats.longPasses += 1;
  if (cross) stats.crosses += 1;
  let broke = 0;
  for (const o of m.players) {
    if (o.team === side || o.role === 'gk') continue;
    const ox = relX(side, o.pos.x);
    if (ox > rel && ox < relTo) {
      broke += 1;
      // 頭を越された守備者は、背走に切り替えるまで出遅れる。プレスと高いラインの代償。
      // 受け手の近くで構えている守備者は置き去りにされていない。8m以上手前にいた選手だけが出遅れる
      // 浮き球は滞空中にボールを見ながら下がれるので、最終ラインの選手は出遅れない
      const backLine = o.role === 'cb' || o.role === 'fb' || o.role === 'wb';
      // 自陣ゴール前(25m以内)で構える最終ラインは、もとからゴールを背に守っているので出遅れない
      const settledBack = backLine && 105 - ox < 25;
      if (relTo - rel > 8 && relTo - ox > 8 && !(lofted && backLine) && !settledBack) {
        // 人基準の守備はカバーがいないので、剥がされた時の遅れが大きい
        const man = m.tactics[o.team].marking === 'man' ? 0.45 : 0;
        o.stunnedUntil = Math.max(o.stunnedUntil, m.t + (lofted ? 0.85 : 0.55) + man);
      }
    }
  }
  if (broke >= 3) stats.lineBreaks += 1;

  const lim = offsideLimit(m, side);
  const offside: boolean[] = [];
  for (const o of m.players) offside[o.id] = o.team === side && relX(side, o.pos.x) > lim + 0.05;

  const b = m.ball;
  b.pass = { from: p.id, to: q.id, point: aim, lofted, startX: p.pos.x, offside, cross, through };
  b.lastTouch = p.id;
  if (lofted) {
    // スペースへの浮き球は手前に落とし、弾んで転がった先で受け手が拾えるようにする
    // クロスは狙った地点の少し奥に落とし、そこを頭の高さで通過させる
    const dLand = through ? loftLandingFor(len) : cross ? len + 3 : len;
    const T = loftTime(dLand);
    kick(m, aim, dLand / T, 0.5 * 9.8 * T);
    b.z = 0.1;
  } else {
    kick(m, aim, groundPassSpeed(d0));
  }
  q.decideAt = m.t + 0.25;
  m.players.forEach((o) => {
    if (o.team === side) o.pressing = false;
  });
}

function clearBall(m: MatchState, p: Player, tgt: Vec) {
  const d = dist(p.pos, tgt);
  const T = loftTime(d);
  const b = m.ball;
  b.lastTouch = p.id;
  b.pass = null;
  kick(m, tgt, d / T, 0.5 * 9.8 * T);
  b.z = 0.1;
}

function shoot(m: MatchState, p: Player, xg: number, header: boolean) {
  const side = p.team;
  const stats = m.stats[side];
  const rel = toRel(side, p.pos);
  const goal = toAbs(side, { x: PITCH_W, y: 34 });
  const b = m.ball;

  let blocker = -1;
  let closest = 1e9;
  const shotDist = dist(p.pos, goal);
  for (const o of m.players) {
    if (o.team === side || o.role === 'gk') continue;
    const dg = dist(o.pos, goal);
    if (dg > shotDist) continue;
    const { d, t } = pointToSegment(o.pos, p.pos, goal);
    if (d < 2.2 && t * shotDist < closest) {
      closest = t * shotDist;
      blocker = o.id;
    }
  }

  const r = m.rand();
  let outcome: 'goal' | 'saved' | 'miss' | 'blocked';
  // コースに入った守備者は、近いほど当てやすい
  const blockP = blocker >= 0 ? (closest < 6 ? 0.8 : 0.58) * (1 - xg) : 0;
  // xG はブロックされる分も含めた値なので、ブロックされなかったシュートはその分だけ入りやすい
  const blocked = !header && m.rand() < blockP;
  const pGoal = Math.min(0.95, xg / (1 - (header ? 0 : blockP)));
  if (blocked) outcome = 'blocked';
  else if (r < pGoal) outcome = 'goal';
  else if (r < pGoal + 0.3 + xg * 0.4) outcome = 'saved';
  else outcome = 'miss';

  const gk = m.players.find((o) => o.team !== side && o.role === 'gk')!;
  let aim: Vec;
  let vz = 0;
  if (outcome === 'goal') {
    const gkRel = toRel(side, gk.pos);
    const y = gkRel.y > 34 ? 34 - 2.8 : 34 + 2.8;
    aim = toAbs(side, { x: PITCH_W + 2, y: y + (m.rand() - 0.5) });
    vz = 1.2;
  } else if (outcome === 'saved') {
    aim = { x: gk.pos.x, y: gk.pos.y };
    vz = 0.8;
  } else if (outcome === 'miss') {
    const sgn = m.rand() < 0.5 ? -1 : 1;
    aim = toAbs(side, { x: PITCH_W + 2, y: 34 + sgn * (GOAL_W / 2 + 0.6 + m.rand() * 4) });
    vz = 2;
  } else {
    aim = { ...m.players[blocker].pos };
  }

  const halfSpace = rel.x > 70 && Math.abs(rel.y - 34) > 7 && Math.abs(rel.y - 34) < 21;
  stats.shots += 1;
  stats.xg += xg;
  if (halfSpace) stats.halfSpaceShots += 1;
  m.shots.push({
    team: side, x: rel.x, y: rel.y, xg, outcome, minute: gameMinute(m), halfSpace, header,
  });
  if (outcome !== 'goal') addEvent(m, 'shot', `シュート (xG ${xg.toFixed(2)})`, side);

  b.lastTouch = p.id;
  b.pass = null;
  b.shot = { shooter: p.id, outcome, xg, blocker, header };
  kick(m, aim, 24, vz);
  b.z = 0.3;
  p.decideAt = m.t + 0.5;
}

/** クロスに合わせたヘディング/ボレー。シュートできなければ false。 */
export function attemptHeader(m: MatchState, p: Player, header: boolean): boolean {
  const xg = computeXg(m, p, m.ball.pos, header);
  if (xg < 0.02) return false;
  m.ball.owner = -1;
  shoot(m, p, xg, header);
  return true;
}

/** ボール保持者への守備。接触中の守備者がボールを奪う判定。 */
export function resolveTackles(m: MatchState) {
  const b = m.ball;
  if (b.owner < 0 || m.dead) return;
  const c = m.players[b.owner];
  if (m.t < c.decideAt - 2) return;
  for (const d of m.players) {
    if (d.team === c.team || d.role === 'gk' || m.t < d.stunnedUntil) continue;
    if (dist(d.pos, c.pos) > 2) continue;
    if (m.challenged !== c.id) {
      m.challenged = c.id;
      if (relX(d.team, d.pos.x) > 42) m.stats[d.team].defActionsHigh += 1;
    }
    const skillRatio = m.skillNow[d.team] / m.skillNow[c.team];
    const support = nearbyDefenders(m, c) > 1 ? 1.5 : 1;
    if (m.rand() < 0.06 * skillRatio * support) {
      const s = m.stats[d.team];
      s.tackles += 1;
      c.stunnedUntil = m.t + 0.5;
      if (m.rand() < 0.62) {
        giveBall(m, d);
        b.pass = null;
        d.decideAt = m.t + 0.3;
        onBallWon(m, d);
      } else {
        const a = m.rand() * Math.PI * 2;
        b.owner = -1;
        b.lastTouch = d.id;
        b.vel = { x: Math.cos(a) * 6, y: Math.sin(a) * 6 };
      }
      return;
    }
    if (m.rand() < 0.012) d.stunnedUntil = m.t + 0.7;
  }
}

function nearbyDefenders(m: MatchState, c: Player) {
  let n = 0;
  for (const d of m.players) if (d.team !== c.team && dist(d.pos, c.pos) < 5) n += 1;
  return n;
}

/** リスタートのボールを渡す。 */
export function restartWith(m: MatchState, p: Player) {
  giveBall(m, p);
  p.decideAt = m.t + 0.05;
}
