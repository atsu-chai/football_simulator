// 固定シードで移動を計測する。距離は圧縮された90分への換算値と実際の移動距離を併記する。
// 使い方: npx tsx scripts/movement.ts [試合数] [--check]
import tracking from '../src/data/tracking.json';
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { BASE_PLAYBACK, MATCH_SECONDS, TICK } from '../src/engine/types';
const n = Number(process.argv[2] ?? 3);
let allTicks = 0, allDistance = 0;
const perPlayer = Array.from({ length: 22 }, () => ({ distance: 0, ticks: 0 }));
let ticks = 0, distance = 0, sprint = 0, slow = 0, turns = 0, acceleration = 0, jumps = 0, motionJumps = 0, stand = 0;
for (let seed = 0; seed < n; seed++) {
  const m = createMatch({ teams: ['A', 'B'].map((name) => ({ name, short: name, color: '#888', tactics: tactic({ formation: name === 'A' ? '4-3-3' : '4-4-2' }) })) as Parameters<typeof createMatch>[0]['teams'], seed: 5000 + seed });
  const heading = new Map<number, number>();
  while (!m.finished) {
    const before = m.players.map((p) => ({ ...p.vel, tx: p.target.x, ty: p.target.y, mx: p.moveTarget?.x ?? p.target.x, my: p.moveTarget?.y ?? p.target.y }));
    step(m);
    for (const p of m.players) {
      if (p.role === 'gk') continue;
      const moved = Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y);
      allTicks++; allDistance += moved;
      perPlayer[p.id].distance += moved; perPlayer[p.id].ticks++;
    }
    if (!m.dead && !m.atHalftime) for (const p of m.players) {
      if (p.role === 'gk') continue;
      const b = before[p.id], speed = Math.hypot(p.vel.x, p.vel.y);
      ticks++; stand += speed < 0.5 ? 1 : 0; distance += speed * TICK; sprint += speed > 7 ? 1 : 0; slow += speed < 2 ? 1 : 0;
      acceleration += Math.hypot(p.vel.x - b.x, p.vel.y - b.y) / TICK;
      motionJumps += Math.hypot((p.moveTarget?.x ?? p.target.x) - b.mx, (p.moveTarget?.y ?? p.target.y) - b.my) > 5 ? 1 : 0;
      jumps += Math.hypot(p.target.x - b.tx, p.target.y - b.ty) > 5 ? 1 : 0;
      // 低速時の向きは数えず、前回の走行方向から45度以上変わった回数を数える。
      if (speed > 2) {
        const angle = Math.atan2(p.vel.y, p.vel.x), last = heading.get(p.id);
        if (last === undefined || Math.abs(Math.atan2(Math.sin(angle - last), Math.cos(angle - last))) > Math.PI / 4) { if (last !== undefined) turns++; heading.set(p.id, angle); }
      }
    }
    if (m.atHalftime) { resume(m); heading.clear(); }
  }
}
const mean = distance / (ticks * TICK);
const result = { matches: n, playback: BASE_PLAYBACK, minutesPerMatch: MATCH_SECONDS / BASE_PLAYBACK / 60, meanSpeed: mean, screenSpeed: mean * BASE_PLAYBACK, sprintPct: 100 * sprint / ticks, walkStandPct: 100 * slow / ticks, standPct: 100 * stand / ticks, turnsPerSimMinute: turns / (ticks * TICK / 60), meanAcceleration: acceleration / ticks, targetJumpsPerSimMinute: jumps / (ticks * TICK / 60), motionTargetJumpsPerSimMinute: motionJumps / (ticks * TICK / 60), kmPer90Equivalent: allDistance / (allTicks * TICK) * 5400 / 1000, kmActuallyPerMatch: allDistance / (n * 20) / 1000 };
console.log(JSON.stringify({ ...result, players: perPlayer.flatMap((p, id) => p.ticks ? [{ id, meanSpeed: p.distance / (p.ticks * TICK), kmPer90Equivalent: p.distance / (p.ticks * TICK) * 5.4 }] : []) }, null, 2));
// 粗い破綻の検知。実測への一致判定ではない。総距離の差はcompare-realで別に報告する。
// 旧来の歩行・静止50%以上という条件は、今回の実測44.6%自体を落としてしまうため置き換える。
if (process.argv.includes('--check') && (result.screenSpeed > 5 || result.meanAcceleration > 3 || result.sprintPct > 3 || Math.abs(result.meanSpeed / tracking.kinematics.meanSpeed - 1) > 0.25 || result.kmPer90Equivalent > tracking.kinematics.distanceKmPer90 * 1.4)) process.exitCode = 1;
