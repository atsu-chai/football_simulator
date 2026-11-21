/** Regenerate the before/after report from saved, anonymous benchmark summaries. */
import { readFileSync, writeFileSync } from 'node:fs';
import { compareCoordination, type Coordination } from './coordination';

type Metric = { n: number; mean: number; p10: number; p50: number; p90: number; p99: number };
type Check = { metric: string; real?: number; sim: number; tolerance: number; pass: boolean };
type Result = {
  matches: number; moments: number; engineSha256?: string;
  metrics: Record<string, Metric>;
  coordination: ReturnType<Coordination['result']>;
  checks?: Check[]; coordinationChecks?: Check[];
};
const root = 'docs/validation/behaviour/';
const read = (path: string): Result => JSON.parse(readFileSync(path, 'utf8'));
const real = read('src/data/behaviour.json');
const equal = read(`${root}coordination-real-11v11.json`);
const before = read(process.argv[2] ?? `${root}coordination-before.json`);
const after = read(process.argv[3] ?? `${root}coordination-after.json`);
const alternate = read(process.argv[4] ?? `${root}coordination-alternate.json`);
if (after.engineSha256 !== alternate.engineSha256) throw new Error('Seed groups use different engine snapshots');
const comparisons = [before, after, alternate].map(s => compareCoordination(s.coordination, real.coordination));
const equalComparisons = [before, after, alternate].map(s => compareCoordination(s.coordination, equal.coordination));
const format = (value: number | undefined) => value === undefined ? '—' : value.toFixed(3);
const lines = [
  '全指標の前後比較', '',
  '修正前は42aaae0。前後とも9001〜9060、別seedは12345〜12404の各60試合。旧18判定は11対11。新指標の主参照は7試合・14ハーフ（人数不足も含む）。全員11対11の参照は別列・別比較として併記する。RMS誤差の実測列0は自己比較の定義値。許容差は信頼区間ではない。', '',
  '| 指標 | 実測・全対象 | 実測・11対11 | 修正前 | 修正後 | 別seed | 許容差 | 後/別判定 |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
];
for (const [i, c] of (after.checks ?? []).entries()) {
  const [key, stat] = c.metric.split('.') as [string, keyof Omit<Metric, 'n'>];
  const other = alternate.checks?.[i];
  lines.push(`| ${c.metric} | ${format(real.metrics[key]?.[stat])} | ${format(equal.metrics[key]?.[stat])} | ${format(before.metrics[key]?.[stat])} | ${format(c.sim)} | ${format(other?.sim)} | ±${format(c.tolerance)} | ${c.pass ? 'OK' : 'NG'}/${other?.pass ? 'OK' : 'NG'} |`);
}
function errorValue(comparison: ReturnType<typeof compareCoordination>, key: string) {
  if (key === 'coverage') return comparison.coverage;
  if (key.endsWith('CorrelationCoverage')) return comparison.correlationCoverage[key.replace('CorrelationCoverage', '')];
  if (key.endsWith('CorrelationRMSE')) return comparison.correlationRMSE[key.replace('CorrelationRMSE', '')];
  return comparison[key as 'ballPositionRMSE' | 'centroidPositionRMSE' | 'spreadRMSE'];
}
for (const [i, c] of (after.coordinationChecks ?? []).entries()) {
  const isCoverage = c.metric.includes('Coverage') || c.metric === 'coverage';
  const other = alternate.coordinationChecks?.[i];
  lines.push(`| ${c.metric} | ${isCoverage ? '1' : '0'} | ${isCoverage ? '1' : '0'} | ${format(errorValue(comparisons[0], c.metric))} | ${format(c.sim)} | ${format(other?.sim)} | ${isCoverage ? '≥' : '≤'}${format(c.tolerance)} | ${c.pass ? 'OK' : 'NG'}/${other?.pass ? 'OK' : 'NG'} |`);
}
function roleErrors(sim: Result) {
  const groups: Record<string, { n: number; cells: number; squared: number[] }> = {};
  for (const [key, reference] of Object.entries(real.coordination.cells)) {
    const sample = sim.coordination.cells[key];
    if (reference.n < 40 || !sample || sample.n < 20) continue;
    const parts = key.split('|'), group = `${parts[0]}|${parts[3]}`;
    const row = groups[group] ??= { n: 0, cells: 0, squared: [0, 0, 0, 0] };
    row.n += reference.n; row.cells++;
    for (let axis = 0; axis < 4; axis++) row.squared[axis] += reference.n * (sample.mean[axis] - reference.mean[axis]) ** 2;
  }
  return Object.fromEntries(Object.entries(groups).map(([key, g]) => [key, {
    referenceExposure: g.n, cells: g.cells,
    ballRMSE: Math.sqrt((g.squared[0] + g.squared[1]) / g.n),
    centroidRMSE: Math.sqrt((g.squared[2] + g.squared[3]) / g.n),
  }]));
}
const roles = [before, after, alternate].map(roleErrors);
lines.push('', '11対11だけの実測参照に対する誤差', '',
  '| 指標 | 修正前 | 修正後 | 別seed |', '|---|---:|---:|---:|');
for (const c of after.coordinationChecks ?? []) {
  if (c.metric.includes('Coverage') || c.metric === 'coverage') continue;
  lines.push(`| ${c.metric} | ${equalComparisons.map(v => format(errorValue(v,c.metric))).join(' | ')} |`);
}
lines.push('', '役割別の条件付き位置誤差', '',
  '球の区画ごとの実測平均との差を、実測露出数で重み付けした2次元RMSE（m）。全体RMSEが通っていても、特定の役割の誤差が小さいとは限らない。戦術・布陣の混合が実測と同じではないので、役割別の値に全体用の許容差をそのまま適用して合否を主張しない。', '',
  '| 局面/役割 | 球相対・前 | 球相対・後 | 球相対・別 | 重心相対・前 | 重心相対・後 | 重心相対・別 |',
  '|---|---:|---:|---:|---:|---:|---:|');
for (const key of Object.keys(roles[0]).sort()) {
  lines.push(`| ${key.replace('|',' / ')} | ${roles.map(r => format(r[key]?.ballRMSE)).join(' | ')} | ${roles.map(r => format(r[key]?.centroidRMSE)).join(' | ')} |`);
}
lines.push('', 'ユニット相関の全観測値', '',
  'キーのunit 0/1/2は後方/中盤/前線、axis 0/1は縦/横、末尾は変位窓の秒数。centroidLagは末尾が遅らせた秒数。rはPearson相関。個別の相関ごとではなく、相関群のRMS誤差と被覆率を判定する。', '',
  '| 相関 | 実測・全対象 | 実測・11対11 | 修正前 | 修正後 | 別seed |', '|---|---:|---:|---:|---:|---:|');
for(const key of Object.keys(real.coordination.correlations).sort()) {
  const r=(v:Result)=>format(v.coordination.correlations[key]?.r??undefined);
  lines.push(`| ${key} | ${[real,equal,before,after,alternate].map(r).join(' | ')} |`);
}
lines.push('', '重心の最大相関ラグ（秒）', '',
  '| 攻守/軸 | 実測・全対象 | 実測・11対11 | 修正前 | 修正後 | 別seed |', '|---|---:|---:|---:|---:|---:|');
for(const key of Object.keys(real.coordination.lagSeconds).sort()) {
  lines.push(`| ${key} | ${[real,equal,before,after,alternate].map(v=>format(v.coordination.lagSeconds[key]??undefined)).join(' | ')} |`);
}
lines.push('', '誤差集計の全データ、11対11のみの比較、エンジンSHA256は `coordination-report.json`。生の匿名集計と全チェックは `coordination-{before,after,alternate}.json`。', '');
writeFileSync(`${root}metrics.md`, lines.join('\n'));
writeFileSync(`${root}coordination-report.json`, JSON.stringify({
  engineSha256: after.engineSha256,
  comparisons: { before: comparisons[0], after: comparisons[1], alternate: comparisons[2] },
  equalStrengthComparisons: { before: equalComparisons[0], after: equalComparisons[1], alternate: equalComparisons[2] },
  roleErrors: { before: roles[0], after: roles[1], alternate: roles[2] },
  checkCounts: { old: 18, new: (after.checks?.length ?? 0) - 18 + (after.coordinationChecks?.length ?? 0) },
}, null, 2) + '\n');
console.log({ engineSha256: after.engineSha256, metrics: `${root}metrics.md` });
