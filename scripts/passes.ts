// パスの種類ごとに、味方に渡った・相手に渡った・外に出た割合を数える。
// 使い方: npx tsx scripts/passes.ts [試合数]
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { dist } from '../src/engine/geometry';
import { PassInfo, Side, Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 10);
const mk = (t: Tactics, n: string) => ({ name: n, short: n, color: '#888', tactics: t });
const pairs: [Tactics, Tactics][] = [
  [tactic({ formation: '4-3-3' }), tactic({ formation: '4-4-2' })],
  [tactic({ formation: '4-4-2', buildUp: 'long' }), tactic({ formation: '4-3-3', pressHeight: 'high' })],
];
type Row = { n: number; ok: number; lost: number; out: Record<string, number>; len: number };
const rows: Record<string, Row> = {};
const ORDER = ['グラウンダー', 'グラウンダー25m超', '浮き球スルー', '縦ロング', 'サイドチェンジ', 'GKロング', 'クロス'];

for (const [a, b] of pairs) {
  for (let i = 0; i < N; i++) {
    const m = createMatch({ teams: [mk(a, 'A'), mk(b, 'B')], seed: 900 + i });
    let cur: PassInfo | null = null;
    let row: Row | null = null;
    let team: Side = 0;
    while (!m.finished) {
      step(m);
      if (m.atHalftime) resume(m);
      const p = m.ball.pass;
      if (p && p !== cur) {
        if (row) row.out['次のプレー'] = (row.out['次のプレー'] ?? 0) + 1;
        cur = p;
        const f = m.players[p.from];
        team = f.team;
        const len = dist({ x: p.startX, y: f.pos.y }, p.point);
        const cat = p.cross ? 'クロス' : !p.lofted ? (len > 25 ? 'グラウンダー25m超' : 'グラウンダー')
          : p.through ? '浮き球スルー' : f.role === 'gk' ? 'GKロング' : Math.abs(p.point.y - f.pos.y) > 26 ? 'サイドチェンジ' : '縦ロング';
        row = rows[cat] ??= { n: 0, ok: 0, lost: 0, out: {}, len: 0 };
        row.n += 1;
        row.len += len;
      }
      if (!row) continue;
      if (m.ball.shot) {
        row.out['シュートに'] = (row.out['シュートに'] ?? 0) + 1;
        row = null;
      } else if (m.ball.owner >= 0 && m.ball.pass !== cur) {
        if (m.players[m.ball.owner].team === team) row.ok += 1;
        else row.lost += 1;
        row = null;
      } else if (m.dead) {
        const k = m.dead.kind === 'throw' ? 'スローイン' : m.dead.kind === 'goalkick' ? 'ゴールキック' : m.dead.kind === 'corner' ? 'CK' : 'その他';
        row.out[k] = (row.out[k] ?? 0) + 1;
        row = null;
      }
    }
  }
}
const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(0)}%`.padStart(4);
for (const k of ORDER) {
  const r = rows[k];
  if (!r) continue;
  const outs = Object.entries(r.out).map(([o, v]) => `${o}${pct(v, r.n)}`).join(' ');
  console.log(`${k.padEnd(12)} 本数${String(r.n).padStart(5)} 平均${(r.len / r.n).toFixed(0).padStart(3)}m  成功${pct(r.ok, r.n)} 相手${pct(r.lost, r.n)}  ${outs}`);
}
