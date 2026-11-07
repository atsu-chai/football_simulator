// 戦術スタイルの相性表。行のスタイルが列のスタイルと戦ったときの勝率(%)を出す。
import { tactic } from '../src/data/formations';
import { createMatch, runToEnd } from '../src/engine/match';
import { Tactics } from '../src/engine/types';
const N = Number(process.argv[2] ?? 24);
const S: [string, Tactics][] = [
  ['default ', tactic({ formation: '4-3-3' })],
  ['press   ', tactic({ formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress' })],
  ['direct  ', tactic({ formation: '4-4-2', buildUp: 'long', onWin: 'counter', tempo: 'fast', pressHeight: 'mid' })],
  ['block   ', tactic({ formation: '5-4-1', pressHeight: 'low', compactness: 'tight', lineHeight: 'normal', onWin: 'counter', buildUp: 'long', tempo: 'fast' })],
  ['possess ', tactic({ formation: '3-4-2-1', buildUp: 'short', tempo: 'slow', width: 'wide', pressHeight: 'mid', onLoss: 'counterpress' })],
];
const mk = (t: Tactics) => ({ name: 'x', short: 'x', color: '#888', tactics: t });
let goals = 0, games = 0;
console.log('         ' + S.map(([n]) => n).join(' '));
for (const [n, a] of S) {
  const row: string[] = [];
  for (const [, b] of S) {
    let w = 0, d = 0;
    for (let i = 0; i < N; i++) {
      const m = runToEnd(createMatch({ teams: [mk(a), mk(b)], seed: 9000 + i }));
      goals += m.score[0] + m.score[1]; games++;
      if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    }
    row.push(`${String(Math.round((w / N) * 100)).padStart(3)}/${String(Math.round((d / N) * 100)).padStart(2)}  `);
  }
  console.log(n, ' ', row.join(' '));
}
console.log('平均得点', (goals / games).toFixed(2));
