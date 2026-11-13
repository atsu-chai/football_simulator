// ストーリーの各章が、初期設定のままでは厳しく、相手に合わせた戦術なら突破できるかを確かめる。
// 使い方: npx tsx scripts/story.ts [試合数] [開始章] [終了章]
import { writeFileSync } from 'node:fs';
import { DEFAULT_TACTICS } from '../src/data/formations';
import { MY_COLOR, STAGES } from '../src/data/stages';
import { CHAPTERS, opponentSetup, StyleId, STYLE_STAGE } from '../src/data/story';
import { createMatch, runToEnd } from '../src/engine/match';
import { Tactics } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? CHAPTERS.length);
// ステージで検証した攻略戦術を使い、検証専用の対策が古いまま残るのを防ぐ。
const answer = (style: StyleId) => STAGES.find((s) => s.id === STYLE_STAGE[style])!.solution;

const results = [];
for (const c of CHAPTERS.filter((x) => x.id >= from && x.id <= to)) {
  const opponents = c.opponents.filter((o) => !process.env.STORY_STYLE || o.style === process.env.STORY_STYLE);
  if (!opponents.length) continue;
  let ptsBase = 0, ptsAns = 0;
  let distBase = [1], distAns = [1];
  // 各対戦の観測分布を独立と仮定して勝ち点を畳み込む。実測のシーズン突破率ではない。
  const advance = (dist: number[], r: { w: number; d: number }) => {
    const next = Array<number>(dist.length + 3).fill(0);
    dist.forEach((p, points) => {
      next[points] += p * (1 - r.w - r.d);
      next[points + 1] += p * r.d;
      next[points + 3] += p * r.w;
    });
    return next;
  };
  const rows: string[] = [];
  for (const o of opponents) {
    const run = (t: Tactics) => {
      let w = 0, d = 0;
      for (let i = 0; i < N; i++) {
        const m = runToEnd(createMatch({ teams: [{ name: 'me', short: 'me', color: MY_COLOR, tactics: t, skill: c.mySkill }, opponentSetup(o)], seed: 3100 + i }));
        if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
      }
      return { w: w / N, d: d / N };
    };
    const b = run(DEFAULT_TACTICS);
    const a = run(answer(o.style));
    distBase = advance(distBase, b);
    distAns = advance(distAns, a);
    // cup は引き分けを PK で五分とみなす
    const val = (r: { w: number; d: number }) => (c.format === 'cup' ? r.w + r.d / 2 : r.w * 3 + r.d);
    ptsBase += c.format === 'cup' ? Math.log(val(b)) : val(b);
    ptsAns += c.format === 'cup' ? Math.log(val(a)) : val(a);
    rows.push(`  ${o.name.padEnd(14)} ${o.style.padEnd(10)} 初期 W${(b.w * 100).toFixed(0)} D${(b.d * 100).toFixed(0)} / 対策 W${(a.w * 100).toFixed(0)} D${(a.d * 100).toFixed(0)}`);
  }
  const fmt = (x: number) => (c.format === 'cup' ? `突破率 ${(Math.exp(x) * 100).toFixed(0)}%` : `期待勝ち点 ${x.toFixed(1)} / 目標 ${c.target}`);
  const clear = (points: number, dist: number[]) => c.format === 'cup'
    ? Math.exp(points) : dist.slice(c.target!).reduce((sum, p) => sum + p, 0);
  console.log(`第${c.id}章 ${c.league}: 初期 ${fmt(ptsBase)} | 対策 ${fmt(ptsAns)}`);
  if (!process.env.STORY_STYLE) console.log(`  章突破率(独立分布による推計): 初期 ${(100 * clear(ptsBase, distBase)).toFixed(1)}% / 対策 ${(100 * clear(ptsAns, distAns)).toFixed(1)}%`);
  rows.forEach((r) => console.log(r));
  results.push({ chapter: c.id, league: c.league, target: c.target, base: clear(ptsBase, distBase), answer: clear(ptsAns, distAns), ptsBase, ptsAns, distBase, distAns });
}

if (process.env.RESULT_JSON) writeFileSync(process.env.RESULT_JSON, JSON.stringify({ matches: N, results }, null, 2) + '\n');
