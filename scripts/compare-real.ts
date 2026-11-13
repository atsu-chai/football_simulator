// 同じ定義・5Hz・GK除外で実測とシミュレーションを比較する。戦術差は同じシード群で比較する。
import { readFileSync, writeFileSync } from 'node:fs';
import real from '../src/data/tracking.json';
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { dist, toRel } from '../src/engine/geometry';
import { trackingPhase, TrackingPhase } from '../src/engine/tracking';
import { MATCH_SECONDS, Side, Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 6);
const phases: TrackingPhase[] = ['attack', 'defend', 'win', 'loss'];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
function measure(t: Tactics, n = N, both = true) {
  const sums = Object.fromEntries(phases.map((p) => [p, { n: 0, ballX: 0, values: Array<number>(10).fill(0) }])) as Record<TrackingPhase, { n: number; ballX: number; values: number[] }>;
  const bands = Array<number>(6).fill(0);
  const conditioned = Object.fromEntries(phases.map(p => [p, Array<number>(7).fill(0)])) as Record<TrackingPhase, number[]>;
  let deadDistance = 0, deadTicks = 0, totalTicks = 0;
  let samples = 0, speedSum = 0, distance = 0, pressure = 0, carriers = 0, pressers = 0, defenseSamples = 0;
  for (let seed = 0; seed < n; seed++) {
    const m = createMatch({ seed: 5000 + seed, teams: [
      { name: 'A', short: 'A', color: '#888', tactics: t },
      { name: 'B', short: 'B', color: '#888', tactics: tactic({ formation: '4-4-2' }) },
    ] });
    let tick = 0;
    while (!m.finished) {
      const wasHalf = m.atHalftime;
      if (wasHalf) resume(m);
      const deadBefore = !!m.dead;
      step(m); tick++; totalTicks++; if (deadBefore) deadTicks++;
      for (const p of m.players) if (p.role !== 'gk' && (both || p.team === 0)) { const d = dist(p.pos, p.prev); distance += d; if (deadBefore) deadDistance += d; }
      if (m.dead || m.atHalftime || tick % 2) continue;
      for (const side of (both ? [0, 1] : [0]) as Side[]) {
        const players = m.players.filter((p) => p.team === side && p.role !== 'gk');
        const positions = players.map((p) => toRel(side, p.pos));
        const xs = positions.map((p) => p.x).sort((a, b) => a - b), ys = positions.map((p) => p.y);
        const distances = players.map((p) => dist(p.pos, m.ball.pos));
        const spacing = mean(players.map((p) => Math.min(...players.filter((q) => p.id !== q.id).map((q) => dist(p.pos, q.pos)))));
        const values = [xs[0], xs[9] - xs[0], Math.max(...ys) - Math.min(...ys), mean(ys), mean(xs.slice(0, 4)), mean(xs.slice(4, 7)), mean(xs.slice(7)), distances.filter((d) => d < 10).length, distances.filter((d) => d < 20).length, spacing];
        const phase = trackingPhase(m, side), s = sums[phase]; s.n++; s.ballX += toRel(side, m.ball.pos).x;
        values.forEach((v, i) => s.values[i] += v);
        const ball = toRel(side, m.ball.pos);
        const key = `all|${phase}|${Math.min(11, Math.floor(ball.x / 105 * 12))}|${Math.min(7, Math.floor(ball.y / 68 * 8))}`;
        const cell = (real.cells as Record<string, number[]>)[key];
        if (cell) { conditioned[phase][0]++; for (let i = 1; i < 7; i++) conditioned[phase][i] += cell[i + 1] - values[i]; }
        if (m.possession !== side) { pressers += players.filter((p) => p.pressing).length; defenseSamples++; }
        for (const p of players) {
          const speed = Math.hypot(p.vel.x, p.vel.y);
          bands[real.kinematics.bands.filter((b) => speed >= b).length]++; speedSum += speed; samples++;
        }
        // 実測と同じく、保持側でボール3m以内の最寄り選手を保持者の代理にする。
        if (m.possession === side) {
          const own = m.players.filter((p) => p.team === side).sort((a, b) => dist(a.pos, m.ball.pos) - dist(b.pos, m.ball.pos));
          if (dist(own[0].pos, m.ball.pos) < 3) { pressure += Math.min(...m.players.filter((p) => p.team !== side).map((p) => dist(p.pos, own[0].pos))); carriers++; }
        }
      }
    }
  }
  for (const s of Object.values(sums)) { s.values = s.values.map((v) => v / Math.max(1, s.n)); s.ballX /= Math.max(1, s.n); }
  return { conditioned, deadShare: deadTicks / totalTicks, deadKmPer90: deadDistance / (n * (both ? 20 : 10)) * (5400 / MATCH_SECONDS) / 1000, phases: sums, meanSpeed: speedSum / samples, shares: bands.map((v) => v / samples), kmPer90: distance / (n * (both ? 20 : 10)) * (5400 / MATCH_SECONDS) / 1000, liveKmPer90: speedSum / samples * 5.4, pressure: pressure / carriers, pressers: pressers / defenseSamples };
}
const sim = measure(tactic({ formation: '4-2-3-1' }));
console.log(`実測7試合 / シミュレーション${N}試合、インプレー5Hz・GK除外。ライン=後方4人/中間3人/前方3人の平均x。`);
console.log('局面 | 指標 | 実測 | sim');
const labels = ['最深位置', '長さ', '幅', '横中心', '守備線', '中盤線', '前線', '10m人数', '20m人数', '最寄り味方間隔'];
for (const phase of phases) {
  const r = real.validation[phase].values;
  const cells = Object.entries(real.cells).filter(([key]) => key.startsWith(`all|${phase}|`));
  const ballX = cells.reduce((sum, [key, cell]) => sum + (Number(key.split('|')[2]) + 0.5) * 105 / 12 * cell[0], 0) / cells.reduce((sum, [, cell]) => sum + cell[0], 0);
  console.log(`${phase} | ボールx（実測はセル中心の概算） | ${ballX.toFixed(2)} | ${sim.phases[phase].ballX.toFixed(2)}`);
  labels.forEach((label, i) => { if (i !== 0 && i !== 3) console.log(`${phase} | ${label} | ${r[i].toFixed(2)} | ${sim.phases[phase].values[i].toFixed(2)}`); });
}
if (process.env.BEFORE_JSON) {
  const before = JSON.parse(readFileSync(process.env.BEFORE_JSON, 'utf8')).sim as ReturnType<typeof measure>;
  console.log('前後比較: 局面 | 指標 | 修正前 | 修正後');
  for (const phase of ['win', 'loss', 'attack'] as TrackingPhase[]) for (const i of [1, 2, 4, 5, 6, 7, 8, 9]) {
    console.log(`${phase} | ${labels[i]} | ${before.phases[phase].values[i].toFixed(2)} | ${sim.phases[phase].values[i].toFixed(2)}`);
  }
  console.log(`距離km/90 | ${before.kmPer90.toFixed(2)} | ${sim.kmPer90.toFixed(2)}`);
  console.log(`高速帯% | ${(before.shares[4] * 100).toFixed(2)} | ${(sim.shares[4] * 100).toFixed(2)}`);
}
console.log('同じボール12×8セルでのsim−実測（長さ/幅/横中心/守備線/中盤線/前線 m、共通セルのみ）');
for (const phase of phases) { const c = sim.conditioned[phase]; console.log(`${phase} n=${c[0]} | ${c.slice(1).map(v => (-v / c[0]).toFixed(2)).join(' | ')}`); }
console.log(`停止時間 ${(sim.deadShare * 100).toFixed(1)}% / 停止中距離 ${sim.deadKmPer90.toFixed(2)} km/90`);
console.log(`平均速度 m/s | ${real.kinematics.meanSpeed.toFixed(2)} | ${sim.meanSpeed.toFixed(2)}`);
console.log(`インプレー速度×90分 km | ${(real.kinematics.meanSpeed * 5.4).toFixed(2)} | ${sim.liveKmPer90.toFixed(2)}`);
console.log(`停止込み距離/人×5400/1200 km | ${'distanceKmPer90' in real.kinematics ? Number(real.kinematics.distanceKmPer90).toFixed(2) : '未集計'} | ${sim.kmPer90.toFixed(2)}`);
console.log(`保持者圧力距離 m | ${real.validation.pressure.values[0].toFixed(2)} | ${sim.pressure.toFixed(2)}`);
['静止<0.5', '歩行0.5–2', 'ジョグ2–4', '走行4–5.5', '高速5.5–7', 'スプリント≥7'].forEach((label, i) => console.log(`${label} % | ${(real.kinematics.shares[i] * 100).toFixed(1)} | ${(sim.shares[i] * 100).toFixed(1)}`));
console.log('\n戦術対照（同一シード群、変更チームの実位置を測定）: 設定 | 守備線 | 守備長 | 守備幅 | 攻撃幅 | プレス人数 | loss10m人数 | loss幅 | win前線');
const effects: Record<string, ReturnType<typeof measure>> = {};
for (const [label, over] of [
  ['低ライン', { lineHeight: 'deep' }], ['高ライン', { lineHeight: 'high' }],
  ['密集', { compactness: 'tight' }], ['緩い', { compactness: 'loose' }],
  ['狭い', { width: 'narrow' }], ['広い', { width: 'wide' }],
  ['即時奪回', { onLoss: 'counterpress' }], ['帰陣', { onLoss: 'regroup' }],
  ['速攻', { onWin: 'counter' }], ['保持', { onWin: 'keep' }],
  ['低プレス', { pressHeight: 'low' }], ['高プレス', { pressHeight: 'high' }],
] as [string, Partial<Tactics>][]) {
  const r = measure(tactic(over), N, false); effects[label] = r;
  const d = r.phases.defend.values;
  console.log(`${label} | ${d[4].toFixed(2)} | ${d[1].toFixed(2)} | ${d[2].toFixed(2)} | ${r.phases.attack.values[2].toFixed(2)} | ${r.pressers.toFixed(2)} | ${r.phases.loss.values[7].toFixed(2)} | ${r.phases.loss.values[2].toFixed(2)} | ${r.phases.win.values[6].toFixed(2)}`);
}
if (process.env.RESULT_JSON) writeFileSync(process.env.RESULT_JSON, JSON.stringify({ matches: N, sim, effects }, null, 2) + '\n');

if (process.argv.includes('--check')) {
  const checks = {
    即時奪回: effects['即時奪回'].phases.loss.values[7] - effects['帰陣'].phases.loss.values[7] > 0.1,
    速攻: effects['速攻'].phases.win.values[6] - effects['保持'].phases.win.values[6] > 1,
    ライン高: effects['高ライン'].phases.defend.values[4] - effects['低ライン'].phases.defend.values[4] > 5,
    密集度: effects['緩い'].phases.defend.values[1] - effects['密集'].phases.defend.values[1] > 3,
    攻撃幅: effects['広い'].phases.attack.values[2] - effects['狭い'].phases.attack.values[2] > 5,
    プレス: effects['高プレス'].pressers - effects['低プレス'].pressers > 0.2,
  };
  const motionChecks = {
    停止込み距離: Math.abs(sim.kmPer90 / real.kinematics.distanceKmPer90 - 1) < 0.15,
    高速帯: Math.abs(sim.shares[4] - real.kinematics.shares[4]) < 0.02,
    喪失後長さ: Math.abs(sim.phases.loss.values[1] - real.validation.loss.values[1]) < 4,
    喪失後幅: Math.abs(sim.phases.loss.values[2] - real.validation.loss.values[2]) < 5,
  };
  console.log('移動・切替判定', motionChecks);
  if (Object.values(motionChecks).some(v => !v)) process.exitCode = 1;
  console.log('戦術差判定', checks);
  if (Object.values(checks).some((v) => !v)) process.exitCode = 1;
}
