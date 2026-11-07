// 試合の動きが現実のサッカーに近いかを数値で確かめる。
// 使い方: npx tsx scripts/realism.ts [試合数]
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { dist, relX } from '../src/engine/geometry';
import { MatchState, Side, Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 10);
const mk = (t: Tactics, n: string) => ({ name: n, short: n, color: '#888', tactics: t });
const pairs: [Tactics, Tactics][] = [
  [tactic({ formation: '4-3-3' }), tactic({ formation: '4-4-2' })],
  [tactic({ formation: '4-2-3-1', pressHeight: 'high', pressIntensity: 'high' }), tactic({ formation: '5-4-1', pressHeight: 'low' })],
];

const acc: Record<string, number[]> = {};
const add = (k: string, v: number) => (acc[k] ??= []).push(v);
const sd = (xs: number[]) => { const a = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - a) ** 2, 0) / xs.length); };

function sampleShape(m: MatchState) {
  for (const side of [0, 1] as Side[]) {
    const out = m.players.filter((p) => p.team === side && p.role !== 'gk');
    const xs = out.map((p) => relX(side, p.pos.x));
    const ys = out.map((p) => p.pos.y);
    const def = m.possession !== side;
    const tag = def ? '守備' : '攻撃';
    add(`${tag}: チームの縦幅(m)`, Math.max(...xs) - Math.min(...xs));
    add(`${tag}: チームの横幅(m)`, Math.max(...ys) - Math.min(...ys));
    if (def) {
      const back = out.filter((p) => p.role === 'cb' || p.role === 'fb' || p.role === 'wb').map((p) => relX(side, p.pos.x));
      add('守備: 最終ラインの凸凹(標準偏差m)', sd(back));
    }
    add(`${tag}: ボール15m以内の人数`, out.filter((p) => dist(p.pos, m.ball.pos) < 15).length);
  }
}

for (const [a, b] of pairs) {
  for (let i = 0; i < N; i++) {
    const m = createMatch({ teams: [mk(a, 'A'), mk(b, 'B')], seed: 400 + i });
    let pass: unknown = null;
    let k = 0;
    while (!m.finished) {
      const prevPass = m.ball.pass;
      step(m);
      if (m.atHalftime) resume(m);
      const p = m.ball.pass;
      if (p && p !== prevPass && p !== pass) {
        pass = p;
        const from = m.players[p.from];
        const len = dist({ x: p.startX, y: from.pos.y }, p.point);
        const fwd = relX(from.team, p.point.x) - relX(from.team, p.startX);
        add('パス: 平均距離(m)', len);
        add('パス: 浮き球の割合(%)', p.lofted ? 100 : 0);
        if (p.lofted) add(`浮き球の内訳: ${p.cross ? 'クロス' : p.through ? 'スルー' : from.role === 'gk' ? 'GK' : 'その他'}(%)`, 100);
        if (p.lofted) for (const k of ['クロス', 'スルー', 'GK', 'その他']) if (k !== (p.cross ? 'クロス' : p.through ? 'スルー' : from.role === 'gk' ? 'GK' : 'その他')) add(`浮き球の内訳: ${k}(%)`, 0);
        add('パス: 前方(+10m以上)の割合(%)', fwd > 10 ? 100 : 0);
        add('パス: 後方(-3m以下)の割合(%)', fwd < -3 ? 100 : 0);
      }
      if (++k % 20 === 0 && !m.dead) sampleShape(m);
      if (k % 10 === 0 && m.ball.owner >= 0 && !m.dead) {
        const c = m.players[m.ball.owner];
        const ds = m.players.filter((q) => q.team === c.team && q.id !== c.id && q.role !== 'gk').map((q) => dist(q.pos, c.pos)).sort((x, y) => x - y);
        add('保持者: 最も近い味方まで(m)', ds[0]);
        add('保持者: 3番目に近い味方まで(m)', ds[2]);
      }
    }
    const s = m.stats;
    add('試合: 1チームのパス数', (s[0].passes + s[1].passes) / 2);
    add('試合: パス成功率(%)', ((s[0].passesDone + s[1].passesDone) / Math.max(1, s[0].passes + s[1].passes)) * 100);
    add('試合: 合計得点', m.score[0] + m.score[1]);
    add('試合: 1チームのシュート', (s[0].shots + s[1].shots) / 2);
    add('試合: 1チームのクロス', (s[0].crosses + s[1].crosses) / 2);
  }
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
for (const [k, v] of Object.entries(acc).sort()) console.log(k.padEnd(28), mean(v).toFixed(1));
