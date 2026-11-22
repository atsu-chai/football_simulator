/** 攻撃側のオフザボールの動きを実測とシミュレーションで同じ定義で比べる(1Hz)。
 * real: node --import tsx scripts/offball.ts --real /tmp/behaviour-real.jsonl
 * sim:  node --import tsx scripts/offball.ts [試合数=12]   (SEED_START で乱数の開始値)
 * 速度は1秒間の変位。保持者(ボールから2m以内の最寄りの味方)は除く。
 */
import { createReadStream, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import type { Frame } from './behaviour';

const ROLE: Record<string, string> = { iw: 'wg', f9: 'st', wb: 'fb' };
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))] ?? 0; };

export class OffBall {
  v: Record<string, number[]> = {};
  prev: Frame | null = null;
  matches = new Set<string>();
  add(k: string, x: number) { (this.v[k] ??= []).push(x); }
  feed(f: Frame) {
    const prev = this.prev;
    this.prev = f;
    if (!prev || prev.match !== f.match || prev.section !== f.section || f.t - prev.t !== 1 || !f.live || !prev.live || f.poss < 0 || prev.poss !== f.poss) return;
    if ([f, prev].some(g => g.p.some(p => p[2] === 'unknown') || [0, 1].some((t) => g.p.filter((p) => p[1] === t).length !== 11))) return;
    if (f.p.some(p => !prev.p.some(q => q[0] === p[0] && q[1] === p[1]))) return;
    const team = f.poss;
    const keeper = f.p.find((p) => p[1] === team && p[2] === 'gk');
    if (!keeper) return;
    const sign = f.directions?.[team] ?? (keeper[3] < 52.5 ? 1 : -1);
    const rx = (x: number) => (sign === 1 ? x : 105 - x), ry = (y: number) => (sign === 1 ? y : 68 - y);
    const bx = rx(f.b[0]), by = ry(f.b[1]);
    if (bx < 0 || bx > 105 || by < 0 || by > 68) return;
    this.matches.add(f.match);
    const att = f.p.filter((p) => p[1] === team && p[2] !== 'gk').map((p) => {
      const q = prev.p.find((o) => o[0] === p[0]);
      return { role: ROLE[p[2]] ?? p[2], x: rx(p[3]), y: ry(p[4]), vx: q ? rx(p[3]) - rx(q[3]) : 0, vy: q ? ry(p[4]) - ry(q[4]) : 0, ok: !!q };
    });
    if (att.some((a) => !a.ok)) return;
    const defs = f.p.filter((p) => p[1] !== team).map((p) => rx(p[3])).sort((a, b) => b - a);
    const line = defs[1]; // 相手の後ろから2人目(GK含む)
    let carrier = -1, cd = 2;
    att.forEach((a, i) => { const d = Math.hypot(a.x - bx, a.y - by); if (d < cd) { cd = d; carrier = i; } });
    const off = att.filter((_, i) => i !== carrier);
    const zone = bx < 35 ? 'own' : bx < 70 ? 'mid' : 'final';
    this.add(`lineGap_${zone}`, line - bx); // 相手の最終ラインがボールの何m前か
    this.add(`ballX_${zone}`, bx);
    this.add(`oppBack_${zone}`, 105 - line);
    this.add(`carrier_${zone}`, carrier >= 0 ? 1 : 0);
    this.add(`lineGap_${carrier >= 0 ? 'held' : 'flight'}_${zone}`, line - bx);

    for (const a of off) {
      const sp = Math.hypot(a.vx, a.vy);
      this.add(`hi_${a.role}`, sp > 5.5 ? 1 : 0); // 高強度で動いている割合
      this.add(`speed_${a.role}`, sp);
      this.add(`fwd_${a.role}_${zone}`, a.vx);
    }
    const pb = rx(prev.b[0]);
    {
      const xs = att.map((a) => a.x);
      const len = Math.max(...xs) - Math.min(...xs);
      this.add(`len_${zone}`, len);
      this.add(`back_${zone}`, bx - Math.min(...xs)); // 最後尾がボールの何m後ろか
      this.add(`front_${zone}`, Math.max(...xs) - bx); // 最前線がボールの何m前か
    }
    this.add(`ballFwd_${zone}`, bx - pb);
    this.add(`teamFwd_${zone}`, mean(off.map((a) => a.vx)));
    this.add(`runners_${zone}`, off.filter((a) => a.vx > 4).length); // 同時に前へ走る人数
    this.add(`sprinters_${zone}`, off.filter((a) => Math.hypot(a.vx, a.vy) > 7).length);
    this.add(`still_${zone}`, off.filter((a) => Math.hypot(a.vx, a.vy) < 1).length); // ほぼ止まっている人数
    if (bx > 52.5) {
      this.add('beyondLine', off.filter((a) => a.x > line + 0.5).length);
      if (bx <= line) this.add('beyondLineBallBehind', off.filter((a) => a.x > line + 0.5).length);
      // ラインの手前5m以内からラインへ向かって走る(裏抜けの開始)
      this.add('attackLine', off.filter((a) => a.x > line - 5 && a.x <= line + 0.5 && a.vx > 4).length);
      this.add('nearLine', off.filter((a) => a.x > line - 5 && a.x <= line + 0.5).length);
    }
    if (bx > 70) {
      let pairs = 0;
      for (let i = 0; i < off.length; i++) for (let j = i + 1; j < off.length; j++) if (Math.hypot(off[i].x - off[j].x, off[i].y - off[j].y) < 5) pairs++;
      this.add('pairs5_final', pairs);
      // 保持者の前方(ゴール方向)にいる味方と、横・後ろでつなぐ味方
      this.add('ahead_final', off.filter((a) => a.x > bx + 3).length);
      this.add('support15_final', off.filter((a) => Math.hypot(a.x - bx, a.y - by) < 15).length);
    }
    // クロスが上がる位置(敵陣深く・サイド)でのボックス内
    if (bx > 83 && Math.abs(by - 34) > 13) {
      const near = Math.sign(by - 34);
      const inBox = off.filter((a) => a.x > 88.5 && Math.abs(a.y - 34) < 20.16);
      this.add('cross_box', inBox.length);
      this.add('cross_six', inBox.filter((a) => a.x > 99.5 && Math.abs(a.y - 34) < 9.16).length);
      this.add('cross_near', inBox.filter((a) => Math.sign(a.y - 34) === near && Math.abs(a.y - 34) > 3).length);
      this.add('cross_far', inBox.filter((a) => Math.sign(a.y - 34) === -near && Math.abs(a.y - 34) > 3).length);
      this.add('cross_cutback', off.filter((a) => a.x > 80 && a.x <= 94 && Math.abs(a.y - 34) < 12).length);
      this.add('cross_boxRunning', inBox.filter((a) => Math.hypot(a.vx, a.vy) > 4).length);
    }
    // サイドの敵陣でSBがWGより前(追い越し)にいる割合
    if (bx > 60 && Math.abs(by - 34) > 12) {
      const side = Math.sign(by - 34);
      const fb = att.filter((a) => a.role === 'fb' && Math.sign(a.y - 34) === side);
      const wg = att.filter((a) => a.role === 'wg' && Math.sign(a.y - 34) === side);
      if (fb.length && wg.length) this.add('fbAheadOfWg', Math.max(...fb.map((a) => a.x)) > Math.max(...wg.map((a) => a.x)) ? 1 : 0);
    }
  }
  summary() {
    const out: Record<string, string> = {};
    for (const k of Object.keys(this.v).sort()) {
      const a = this.v[k];
      out[k] = `${mean(a).toFixed(3)} (p10 ${quant(a, 0.1).toFixed(2)} p50 ${quant(a, 0.5).toFixed(2)} p90 ${quant(a, 0.9).toFixed(2)}) n=${a.length}`;
    }
    return out;
  }
  result() {
    return { matches: this.matches.size, metrics: Object.fromEntries(Object.entries(this.v).sort().map(([k, a]) => [k, {
      n: a.length, mean: mean(a), p10: quant(a, .1), p50: quant(a, .5), p90: quant(a, .9),
    }])) };
  }
}

async function main() {
  const args = process.argv.slice(2), ri = args.indexOf('--real'), o = new OffBall();
  const hash = createHash('sha256');
  for (const file of readdirSync('src/engine').filter(f => f.endsWith('.ts') && !f.includes('.test.') && f !== 'testUtils.ts').sort()) hash.update(file).update(readFileSync(`src/engine/${file}`));
  for (const file of ['src/data/formations.ts', 'src/data/tracking.json', 'src/data/behaviour-response.json', 'src/data/positioning.json']) hash.update(file).update(readFileSync(file));
  const engineSha256 = hash.digest('hex');
  if (ri >= 0) {
    for await (const line of createInterface({ input: createReadStream(args[ri + 1]), crlfDelay: Infinity })) o.feed(JSON.parse(line));
  } else {
    const n = Number(args.find(x => /^\d+$/.test(x)) ?? 12);
    for (let seed = 0; seed < n; seed++) {
      const match = createMatch({ seed: Number(process.env.SEED_START ?? 9001) + seed, teams: [
        { name: 'A', short: 'A', color: '#36c', tactics: tactic({ formation: '4-2-3-1' }) },
        { name: 'B', short: 'B', color: '#c33', tactics: tactic({ formation: '4-4-2' }) }] });
      let tick = 0, half = 1;
      while (!match.finished) {
        if (match.atHalftime) { resume(match); half++; }
        if (tick % 10 === 0) o.feed({ match: `sim-${seed}`, section: String(half), t: tick / 10, b: [match.ball.pos.x, match.ball.pos.y], live: !match.dead, poss: match.possession, p: match.players.map((p) => [p.id, p.team, p.role, p.pos.x, p.pos.y]) } as Frame);
        step(match); tick++;
      }
    }
  }
  const result = { ...o.result(), seedStart: ri < 0 ? Number(process.env.SEED_START ?? 9001) : undefined,
    engineSha256: ri < 0 ? engineSha256 : undefined };
  const checks = args.includes('--check') ? checkOffBall(result) : undefined;
  if (process.env.RESULT_JSON) writeFileSync(process.env.RESULT_JSON, JSON.stringify({ ...result, checks }, null, 2) + '\n');
  console.log(JSON.stringify(o.summary(), null, 1));
  if (checks) { console.table(checks); if (checks.some(c => !c.pass)) process.exitCode = 1; }
}
export function checkOffBall(result: ReturnType<OffBall['result']>) {
  const ref = JSON.parse(readFileSync('src/data/offball.json', 'utf8')) as { metrics: Record<string, { mean: number; p90: number }>; limits: [string, 'mean' | 'p90', number][] };
  if (result.matches < 12 || (result.metrics.teamFwd_own?.n ?? 0) < 500 || (result.metrics.cross_box?.n ?? 0) < 100) throw new Error('Off-ball checks require 12 matches, 500 own-third and 100 crossing samples');
  return ref.limits.map(([metric, stat, tolerance]) => {
    const real = ref.metrics[metric][stat], sim = result.metrics[metric]?.[stat];
    return { metric: `${metric}.${stat}`, real, sim, tolerance, pass: Number.isFinite(sim) && Math.abs(real - sim) <= tolerance };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
