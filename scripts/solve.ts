// ステージの攻略の鍵をすべて満たす戦術をランダムに作り、今のエンジンで最もよく勝つものを探す(模範解答の調整用)。
// 使い方: npx tsx scripts/solve.ts <ステージ番号> [候補数] [試合数]
import { DEFAULT_TACTICS, FORMATION_IDS, tactic } from '../src/data/formations';
import { myTeamBase, STAGE_KEYS, STAGES } from '../src/data/stages';
import { createMatch, runToEnd } from '../src/engine/match';
import { mulberry32 } from '../src/engine/geometry';
import { MatchState, Tactics } from '../src/engine/types';

const id = Number(process.argv[2]);
const K = Number(process.argv[3] ?? 30);
const N = Number(process.argv[4] ?? 40);
const s = STAGES.find((x) => x.id === id)!;
const stub = (changed: boolean) => ({ events: changed ? [{ type: 'tactic', team: 0, minute: 50 }] : [] }) as unknown as MatchState;
// 試合の出来事で決まる鍵(後半の修正など)は、事前の設定では満たせないので除く
const keys = (STAGE_KEYS[id] ?? []).filter((k) => k.check(DEFAULT_TACTICS, stub(false)) === k.check(DEFAULT_TACTICS, stub(true)));

const rnd = mulberry32(id * 977);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
function randomTactics(): Tactics {
  const f = pick(FORMATION_IDS);
  const roleSets: Record<string, Tactics['roles'][]> = {
    '4-3-3': [undefined, { 8: 'iw', 10: 'iw' }, { 9: 'f9', 8: 'iw', 10: 'iw' }],
    '4-2-3-1': [undefined, { 7: 'iw', 9: 'iw' }, { 10: 'f9', 7: 'iw', 9: 'iw' }],
  };
  return tactic({
    formation: f,
    roles: roleSets[f] ? pick(roleSets[f]) : undefined,
    buildUp: pick(['short', 'mixed', 'long'] as const),
    tempo: pick(['slow', 'normal', 'fast'] as const),
    width: pick(['narrow', 'normal', 'wide'] as const),
    fullbacks: pick(['overlap', 'invert', 'stay'] as const),
    pressHeight: pick(['mid', 'high', 'high'] as const),
    pressIntensity: pick(['normal', 'normal', 'high'] as const),
    lineHeight: pick(['normal', 'normal', 'high'] as const),
    compactness: pick(['normal', 'tight'] as const),
    onLoss: pick(['regroup', 'counterpress'] as const),
    onWin: pick(['keep', 'counter'] as const),
  });
}

function run(t: Tactics) {
  let w = 0, g = 0;
  for (let i = 0; i < N; i++) {
    const m = runToEnd(createMatch({ teams: [myTeamBase(t), s.opponent], seed: 5000 + i, script: s.script ? { side: 1, phases: s.script } : undefined }));
    if (m.score[0] > m.score[1]) w++;
    g += m.score[0] + m.score[1];
  }
  return { w: (w / N) * 100, g: g / N };
}

const base = run(DEFAULT_TACTICS);
const cands: Tactics[] = [s.solution];
while (cands.length < K) {
  const t = randomTactics();
  if (keys.every((k) => k.check(t, stub(false)))) cands.push(t);
}
const res = cands.map((t) => ({ t, ...run(t) })).sort((a, b) => b.w - a.w);
console.log(`STAGE ${id} base ${base.w.toFixed(0)}`);
for (const r of res.slice(0, 4)) {
  const { formation, roles, buildUp, tempo, width, fullbacks, pressHeight, pressIntensity, lineHeight, compactness, onLoss, onWin } = r.t;
  console.log(`  W${r.w.toFixed(0)} gap ${(r.w - base.w).toFixed(0)} g${r.g.toFixed(2)} ${JSON.stringify({ formation, roles, buildUp, tempo, width, fullbacks, pressHeight, pressIntensity, lineHeight, compactness, onLoss, onWin })}`);
}
