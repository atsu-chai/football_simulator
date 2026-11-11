// 試合の数字を、欧州主要リーグの平均的な値と並べて比べる。
// 目安の値は 2018〜2024 年ごろの主要リーグ(Opta / FBref 系の公開集計)の典型値で、厳密な出典値ではない。
// 使い方: npx tsx scripts/audit.ts [試合数]
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import { Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 12);
const mk = (t: Tactics, n: string) => ({ name: n, short: n, color: '#888', tactics: t });
const pairs: [Tactics, Tactics][] = [
  [tactic({ formation: '4-3-3' }), tactic({ formation: '4-4-2' })],
  [tactic({ formation: '4-2-3-1', pressHeight: 'high' }), tactic({ formation: '5-4-1', pressHeight: 'low' })],
  [tactic({ formation: '3-5-2', buildUp: 'long' }), tactic({ formation: '4-3-3', pressHeight: 'high', onLoss: 'counterpress' })],
];
const acc: Record<string, number[]> = {};
const add = (k: string, v: number) => (acc[k] ??= []).push(v);

for (const [a, b] of pairs) {
  for (let i = 0; i < N; i++) {
    const m = createMatch({ teams: [mk(a, 'A'), mk(b, 'B')], seed: 5000 + i });
    while (!m.finished) { step(m); if (m.atHalftime) resume(m); }
    const s = m.stats;
    const team = (f: (k: 0 | 1) => number) => (f(0) + f(1)) / 2;
    add('得点(両チーム合計)', m.score[0] + m.score[1]);
    add('シュート(1チーム)', team((k) => s[k].shots));
    add('枠内シュート(1チーム)', team((k) => s[k].onTarget));
    add('パス(1チーム)', team((k) => s[k].passes));
    add('パス成功率%', (100 * (s[0].passesDone + s[1].passesDone)) / (s[0].passes + s[1].passes));
    add('クロス(1チーム)', team((k) => s[k].crosses));
    add('CK(1チーム)', team((k) => s[k].corners));
    add('オフサイド(1チーム)', team((k) => s[k].offsides));
    for (const sh of m.shots) {
      const d = Math.hypot(105 - sh.x, sh.y - 34);
      const inBox = sh.x > 105 - 16.5 && Math.abs(sh.y - 34) < 20.16;
      add('シュート距離(m)', d);
      add('ボックス外からのシュート%', inBox ? 0 : 100);
      add('25m以上からのシュート%', d >= 25 ? 100 : 0);
      add('シュートあたり xG', sh.xg);
      add('決定率%', sh.outcome === 'goal' ? 100 : 0);
      add('ブロック率%', sh.outcome === 'blocked' ? 100 : 0);
      add('ヘディング%', sh.header ? 100 : 0);
      if (!inBox) add('ボックス外シュートの決定率%', sh.outcome === 'goal' ? 100 : 0);
      else add('ボックス内シュートの決定率%', sh.outcome === 'goal' ? 100 : 0);
    }
  }
}
const REAL: Record<string, string> = {
  '得点(両チーム合計)': '2.6〜2.9',
  'シュート(1チーム)': '12〜13',
  '枠内シュート(1チーム)': '4〜4.5',
  'パス(1チーム)': '420〜480',
  'パス成功率%': '80〜84',
  'クロス(1チーム)': '14〜18',
  'CK(1チーム)': '4.5〜5.5',
  'オフサイド(1チーム)': '1.5〜2',
  'シュート距離(m)': '16〜17',
  'ボックス外からのシュート%': '33〜38',
  '25m以上からのシュート%': '8〜12',
  'シュートあたり xG': '0.10〜0.11',
  '決定率%': '10〜11',
  'ブロック率%': '24〜28',
  'ヘディング%': '13〜17',
  'ボックス外シュートの決定率%': '3〜4',
  'ボックス内シュートの決定率%': '13〜15',
};
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log('項目'.padEnd(22), 'シミュ', '  現実の目安');
for (const k of Object.keys(REAL)) console.log(k.padEnd(22), (acc[k] ? mean(acc[k]).toFixed(acc[k] && mean(acc[k]) < 1 ? 3 : 1) : '-').padStart(6), '  ', REAL[k]);
