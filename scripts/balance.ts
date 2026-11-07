// 各ステージを大量に自動実行し、想定解が初期設定より有利か、試合として成立しているかを確認する。
// 使い方: npm run balance -- [試合数] [ステージ番号]
import { DEFAULT_TACTICS, tactic } from '../src/data/formations';
import { myTeamBase, Stage, STAGES } from '../src/data/stages';
import { createMatch, runToEnd } from '../src/engine/match';
import { Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 100);
const only = process.argv[3] ? Number(process.argv[3]) : 0;

function run(stage: Stage, t: Tactics) {
  let w = 0, d = 0, gf = 0, ga = 0, sf = 0, sa = 0;
  for (let i = 0; i < N; i++) {
    const m = runToEnd(createMatch({
      teams: [myTeamBase(t), stage.opponent], seed: 5000 + i,
      script: stage.script ? { side: 1, phases: stage.script } : undefined,
    }));
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    gf += m.score[0]; ga += m.score[1]; sf += m.stats[0].shots; sa += m.stats[1].shots;
  }
  return { win: (w / N) * 100, draw: (d / N) * 100, gf: gf / N, ga: ga / N, sf: sf / N, sa: sa / N };
}

const fmt = (r: ReturnType<typeof run>) =>
  `W${r.win.toFixed(0).padStart(3)} D${r.draw.toFixed(0).padStart(3)} ${r.gf.toFixed(2)}-${r.ga.toFixed(2)} S${r.sf.toFixed(1)}/${r.sa.toFixed(1)}`;

const universal: [string, Tactics][] = [
  ['gegen', tactic({ formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress' })],
  ['352press', tactic({ formation: '3-5-2', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high' })],
];

let failures = 0;
const uniWins: Record<string, number[]> = {};
for (const s of STAGES) {
  if (only && s.id !== only) continue;
  const base = run(s, DEFAULT_TACTICS);
  const sol = run(s, s.solution);
  const gap = sol.win - base.win;
  const goals = sol.gf + sol.ga;
  const ok = gap >= 20 && goals >= 2 && goals <= 5;
  if (!ok) failures++;
  const uni = universal.map(([name, t]) => {
    const r = run(s, t);
    (uniWins[name] ??= []).push(r.win);
    return `${name} ${r.win.toFixed(0)}`;
  }).join(' ');
  console.log(`${String(s.id).padStart(2)} ${ok ? 'OK ' : 'NG '} base ${fmt(base)} | sol ${fmt(sol)} | gap ${gap.toFixed(0)} | ${uni}`);
}
for (const [k, v] of Object.entries(uniWins)) {
  console.log(`万能戦術チェック ${k}: 平均勝率 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(0)}%`);
}
if (failures) {
  console.log(`基準未達: ${failures} ステージ`);
  process.exitCode = 1;
}
