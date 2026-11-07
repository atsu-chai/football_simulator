// ステージごとに候補の戦術を総当たりして、シミュレーション上で効く設定を探す。
// 使い方: npx tsx scripts/search.ts <ステージ番号> [試合数]
import { myTeamBase, STAGES } from '../src/data/stages';
import { tactic } from '../src/data/formations';
import { createMatch, runToEnd } from '../src/engine/match';
import { Tactics } from '../src/engine/types';
const id = Number(process.argv[2]); const N = Number(process.argv[3] ?? 24);
const s = STAGES.find((x) => x.id === id)!;
const score = (t: Tactics) => { let w = 0, d = 0, g = 0, a = 0;
  for (let i = 0; i < N; i++) { const m = runToEnd(createMatch({ teams: [myTeamBase(t), s.opponent], seed: 7000 + i, script: s.script ? { side: 1, phases: s.script } : undefined }));
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++; g += m.score[0]; a += m.score[1]; }
  return { w: w / N, d: d / N, g: g / N, a: a / N }; };
const forms: Tactics['formation'][] = ['4-4-2','4-3-3','4-2-3-1','3-5-2','3-4-2-1','5-3-2','5-4-1','4-1-2-1-2'];
const styles: [string, Partial<Tactics>][] = [
  ['std', {}],
  ['press', { pressHeight:'high', pressIntensity:'high', lineHeight:'high' }],
  ['gegen', { pressHeight:'high', pressIntensity:'high', lineHeight:'high', onLoss:'counterpress' }],
  ['block+counter', { pressHeight:'low', compactness:'tight', onWin:'counter', buildUp:'long', tempo:'fast' }],
  ['mid+long', { buildUp:'long', onWin:'counter', tempo:'fast' }],
  ['possess wide', { buildUp:'short', width:'wide', fullbacks:'overlap', tempo:'slow' }],
  ['wide', { width:'wide', fullbacks:'overlap' }],
];
const res: [string, ReturnType<typeof score>][] = [];
for (const f of forms) for (const [n, st] of styles) res.push([`${f} ${n}`, score(tactic({ formation: f, ...st }))]);
res.sort((a, b) => (b[1].w + b[1].d * 0.3) - (a[1].w + a[1].d * 0.3));
console.log(`STAGE ${id} ${s.title}`);
for (const [n, r] of res.slice(0, 6)) console.log(n.padEnd(26), `W${(r.w*100).toFixed(0)} D${(r.d*100).toFixed(0)} ${r.g.toFixed(2)}-${r.a.toFixed(2)}`);
const w = res.map(([, r]) => r.w).sort((a, b) => a - b);
console.log('中央値勝率', (w[Math.floor(w.length/2)]*100).toFixed(0), '最低', (w[0]*100).toFixed(0));
