// ストーリーの各章が、初期設定のままでは厳しく、相手に合わせた戦術なら突破できるかを確かめる。
// 使い方: npx tsx scripts/story.ts [試合数]
import { DEFAULT_TACTICS, tactic } from '../src/data/formations';
import { MY_COLOR } from '../src/data/stages';
import { CHAPTERS, opponentSetup, StyleId } from '../src/data/story';
import { createMatch, runToEnd } from '../src/engine/match';
import { Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);
const from = Number(process.argv[3] ?? 1);
const mid = { pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' } as const;
// 各スタイルへの対策(ステージの模範解答に合わせた設定)
const ANSWER: Record<StyleId, Tactics> = {
  flat442: tactic({ formation: '3-5-2', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high' }),
  diamond: tactic({ formation: '4-4-2', width: 'wide', fullbacks: 'overlap', ...mid }),
  bus: tactic({ formation: '4-2-3-1', roles: { 7: 'iw', 9: 'iw' }, width: 'wide', onLoss: 'counterpress', ...mid }),
  counter: tactic({ formation: '4-1-2-1-2', fullbacks: 'stay', onLoss: 'counterpress', ...mid }),
  hunters: tactic({ formation: '5-4-1', buildUp: 'long', onWin: 'counter', ...mid }),
  wingbacks: tactic({ formation: '4-4-2', width: 'wide', ...mid }),
  zone4231: tactic({ formation: '4-2-3-1', roles: { 7: 'iw', 9: 'iw' }, ...mid }),
  manmark: tactic({ formation: '4-2-3-1', roles: { 10: 'f9', 7: 'iw', 9: 'iw' }, fullbacks: 'overlap', tempo: 'fast', ...mid }),
  falseNine: tactic({ formation: '4-4-2', compactness: 'tight', ...mid }),
  positional: tactic({ formation: '3-5-2', compactness: 'tight', onWin: 'counter', ...mid }),
  gegen: tactic({ formation: '5-3-2', buildUp: 'long', onWin: 'counter', ...mid }),
};

for (const c of CHAPTERS.filter((x) => x.id >= from)) {
  let ptsBase = 0, ptsAns = 0;
  const rows: string[] = [];
  for (const o of c.opponents) {
    const run = (t: Tactics) => {
      let w = 0, d = 0;
      for (let i = 0; i < N; i++) {
        const m = runToEnd(createMatch({ teams: [{ name: 'me', short: 'me', color: MY_COLOR, tactics: t, skill: c.mySkill }, opponentSetup(o)], seed: 3100 + i }));
        if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
      }
      return { w: w / N, d: d / N };
    };
    const b = run(DEFAULT_TACTICS);
    const a = run(ANSWER[o.style]);
    // cup は引き分けを PK で五分とみなす
    const val = (r: { w: number; d: number }) => (c.format === 'cup' ? r.w + r.d / 2 : r.w * 3 + r.d);
    ptsBase += c.format === 'cup' ? Math.log(val(b)) : val(b);
    ptsAns += c.format === 'cup' ? Math.log(val(a)) : val(a);
    rows.push(`  ${o.name.padEnd(14)} ${o.style.padEnd(10)} 初期 W${(b.w * 100).toFixed(0)} D${(b.d * 100).toFixed(0)} / 対策 W${(a.w * 100).toFixed(0)} D${(a.d * 100).toFixed(0)}`);
  }
  const fmt = (x: number) => (c.format === 'cup' ? `突破率 ${(Math.exp(x) * 100).toFixed(0)}%` : `期待勝ち点 ${x.toFixed(1)} / 目標 ${c.target}`);
  console.log(`第${c.id}章 ${c.league}: 初期 ${fmt(ptsBase)} | 対策 ${fmt(ptsAns)}`);
  rows.forEach((r) => console.log(r));
}
