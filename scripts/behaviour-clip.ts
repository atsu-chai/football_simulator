/** 匿名の実測クリップに、同じ停止割合に最も近い90秒を並べる。動きの良し悪しで区間を選ばない。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_TACTICS, tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
type ClipFrame = { b: number[]; live: number; poss: number; p: number[][] };
const real = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { meta: unknown[]; frames: ClipFrame[] };
const m = createMatch({ teams: [
  { name: 'A', short: 'A', color: '#36c', tactics: DEFAULT_TACTICS, skill: 1 },
  { name: 'B', short: 'B', color: '#c33', tactics: tactic({ formation: '4-4-2' }), skill: 1 },
], seed: 9002 });
const all: ClipFrame[] = [], resets: number[] = [];
let tick = 0, resetAt = -1, score = '0-0';
while (!m.finished) {
  if (m.atHalftime) { resume(m); resetAt = tick; }
  if (m.score.join('-') !== score) { score = m.score.join('-'); resetAt = tick; }
  if (tick % 2 === 0) {
    all.push({ b: [+m.ball.pos.x.toFixed(2), +m.ball.pos.y.toFixed(2)], live: m.dead ? 0 : 1, poss: m.possession + 1,
      p: m.players.map(p => [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2)]) });
    resets.push(resetAt);
  }
  step(m); tick++;
}
const target = real.frames.reduce((sum, f) => sum + f.live, 0);
let start = -1, best = Infinity;
for (let i = 600; i + 450 <= all.length; i++) {
  if (resets[i + 449] >= i * 2) continue;
  const difference = Math.abs(all.slice(i, i + 450).reduce((sum, f) => sum + f.live, 0) - target);
  if (difference < best) { best = difference; start = i; }
}
if (start < 0) throw new Error('配置リセットを跨がない90秒がありません');
const sim = { seed: 9002, startSeconds: start / 5, hz: 5, selection: 'closest live-frame share after 120s; no goal/halftime resets; earliest tie',
  meta: m.players.map(p => ({ team: p.team + 1, role: p.role })), frames: all.slice(start, start + 450) };
const template = readFileSync('scripts/behaviour-compare.html', 'utf8');
const page = template.replace('/*REAL_DATA*/null', JSON.stringify(real)).replace('/*SIM_DATA*/null', JSON.stringify(sim))
  .replace('{{SIM_RANGE}}', `${sim.startSeconds.toFixed(1)}〜${(sim.startSeconds + 90).toFixed(1)}`)
  .replace('{{LIVE_SHARES}}', `インプレー割合：実測 ${(target / 450 * 100).toFixed(1)}%、sim ${(sim.frames.reduce((s, f) => s + f.live, 0) / 450 * 100).toFixed(1)}%`);
writeFileSync(process.argv[3] ?? 'docs/validation/behaviour/compare.html', page);
console.log({ realLiveFrames: target, simLiveFrames: sim.frames.reduce((s, f) => s + f.live, 0), startSeconds: sim.startSeconds });
