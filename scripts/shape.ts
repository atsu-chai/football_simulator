// 局面ごとの各選手の平均位置を出す(自チーム基準: x=自陣ゴールからの距離、y=左タッチラインからの距離)。
// 使い方: npx tsx scripts/shape.ts <フォーメーション> [試合数]
import { FORMATIONS, tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { toRel } from '../src/engine/geometry';
import { FormationId } from '../src/engine/types';

const f = (process.argv[2] ?? '4-4-2') as FormationId;
const N = Number(process.argv[3] ?? 4);
const sum = { att: [] as { x: number; y: number; n: number }[], def: [] as { x: number; y: number; n: number }[] };
for (const k of ['att', 'def'] as const) sum[k] = Array.from({ length: 11 }, () => ({ x: 0, y: 0, n: 0 }));
const ballX = { att: 0, def: 0, na: 0, nd: 0 };
for (let i = 0; i < N; i++) {
  const m = createMatch({ teams: [{ name: 'A', short: 'A', color: '#fff', tactics: tactic({ formation: f }) }, { name: 'B', short: 'B', color: '#000', tactics: tactic({ formation: '4-3-3' }) }], seed: 50 + i });
  let k = 0;
  while (!m.finished) {
    step(m);
    if (m.atHalftime) resume(m);
    if (++k % 10 || m.dead) continue;
    const ph = m.possession === 0 ? 'att' : 'def';
    const b = toRel(0, m.ball.pos);
    if (ph === 'att') { ballX.att += b.x; ballX.na++; } else { ballX.def += b.x; ballX.nd++; }
    for (const p of m.players) {
      if (p.team !== 0) continue;
      const r = toRel(0, p.pos);
      const s = sum[ph][p.slot];
      s.x += r.x; s.y += r.y; s.n++;
    }
  }
}
for (const ph of ['def', 'att'] as const) {
  console.log(`== ${f} ${ph === 'def' ? '守備時' : '攻撃時'}  (平均ボール位置 x=${(ph === 'att' ? ballX.att / ballX.na : ballX.def / ballX.nd).toFixed(0)})`);
  FORMATIONS[f].forEach((sl, i) => {
    const s = sum[ph][i];
    console.log(`  ${String(i).padStart(2)} ${sl.role.padEnd(3)} x=${(s.x / s.n).toFixed(0).padStart(3)} y=${(s.y / s.n).toFixed(0).padStart(3)}`);
  });
}
