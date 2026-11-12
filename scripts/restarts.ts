// セットプレーの再開時に、選手が持ち場に戻れているかを計測する。
// 使い方: npx tsx scripts/restarts.ts [試合数]
import { DEFAULT_TACTICS, tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { dist } from '../src/engine/geometry';

const N = Number(process.argv[2] ?? 6);
const away = tactic({ formation: '4-4-2' });
const by: Record<string, { n: number; wait: number; taker: number; off: number; far: number }> = {};
let deadTicks = 0, ticks = 0, goals = 0;
for (let i = 0; i < N; i++) {
  const m = createMatch({ teams: [{ name: 'A', short: 'A', tactics: DEFAULT_TACTICS, skill: 1 }, { name: 'B', short: 'B', tactics: away, skill: 1 }], seed: 7000 + i } as never);
  let start = -1;
  while (!m.finished) {
    if (m.atHalftime) resume(m);
    const d = m.dead;
    if (d && start < 0) start = m.t;
    let snap: (() => void) | null = null;
    if (d) {
      deadTicks++;
      // 再開直前の状態を記録しておき、このステップで再開したら採用する
      const others = m.players.filter((p) => p.id !== d.taker && p.role !== 'gk');
      const offs = others.map((p) => dist(p.pos, p.target));
      const wait = m.t - start, taker = dist(m.players[d.taker].pos, d.at);
      snap = () => {
        const r = (by[d.kind] ??= { n: 0, wait: 0, taker: 0, off: 0, far: 0 });
        r.n++; r.wait += wait; r.taker += taker;
        r.off += offs.reduce((a, b) => a + b, 0) / offs.length; r.far += offs.filter((x) => x > 5).length;
      };
    }
    ticks++;
    step(m);
    if (d && m.dead !== d) { snap!(); start = -1; }
  }
  goals += m.score[0] + m.score[1];
}
console.log(`dead ${(deadTicks / ticks * 100).toFixed(1)}%  goals/match ${(goals / N).toFixed(2)}`);
for (const [k, r] of Object.entries(by)) console.log(`${k.padEnd(9)} n${String(r.n).padStart(4)}  wait ${(r.wait / r.n).toFixed(1)}s  taker-to-ball ${(r.taker / r.n).toFixed(1)}m  mean-off ${(r.off / r.n).toFixed(1)}m  >5m ${(r.far / r.n).toFixed(1)}人`);
