import { makeTestMatch } from './testUtils';
import { describe, expect, it } from 'vitest';
import { tactic } from '../data/formations';
import { STAGES } from '../data/stages';
import { TEAMS } from '../data/teams';
import { explain, possessionPct, ppda } from './analysis';
import { createMatch, resume, runToEnd, setTactics, step } from './match';
import { computeXg, passSafety, threat } from './onBall';
import { offsideLimit, shapeTarget, updateFrames, updateLastLines } from './teamShape';
import { toAbs, toRel } from './geometry';
import { TeamSetup } from './types';

const team = (n: string, t = tactic({})): TeamSetup => ({ name: n, short: n, color: '#111111', tactics: t });

describe('決定論', () => {
  it('同じシードなら同じ試合になる', () => {
    const run = () => {
      const m = runToEnd(createMatch({ teams: [team('A'), team('B')], seed: 42 }));
      return [m.score, m.stats[0].passes, m.stats[1].shots, m.players[3].pos];
    };
    expect(run()).toEqual(run());
  });
  it('シードが違えば試合は変わる', () => {
    const a = runToEnd(createMatch({ teams: [team('A'), team('B')], seed: 1 }));
    const b = runToEnd(createMatch({ teams: [team('A'), team('B')], seed: 2 }));
    expect(a.stats[0].passes).not.toEqual(b.stats[0].passes);
  });
});

describe('座標', () => {
  it('チーム基準座標は180度回転で元に戻る', () => {
    const v = { x: 10, y: 20 };
    expect(toAbs(1, toRel(1, v))).toEqual(v);
    expect(toRel(1, v)).toEqual({ x: 95, y: 48 });
  });
});

describe('オフサイド', () => {
  it('ボールより後ろ、自陣の選手はオフサイドにならない', () => {
    const m = makeTestMatch();
    m.ball.pos = { x: 30, y: 34 };
    updateLastLines(m);
    expect(offsideLimit(m, 0)).toBeGreaterThanOrEqual(52.5);
  });
  it('相手の最終ラインより前はオフサイド位置になる', () => {
    const m = makeTestMatch();
    for (const p of m.players) if (p.team === 1) p.pos = { x: 80 + (p.id % 5), y: 10 + p.id };
    m.ball.pos = { x: 60, y: 34 };
    updateLastLines(m);
    expect(offsideLimit(m, 0)).toBeGreaterThan(79);
  });
  it('試合全体で数字が破綻しない', () => {
    const m = runToEnd(createMatch({ teams: [team('A'), team('B')], seed: 7 }));
    expect(m.stats[0].passesDone).toBeLessThanOrEqual(m.stats[0].passes);
    expect(m.score[0] + m.score[1]).toBeLessThanOrEqual(m.stats[0].shots + m.stats[1].shots);
    for (const p of m.players) {
      expect(p.pos.x).toBeGreaterThanOrEqual(0);
      expect(p.pos.x).toBeLessThanOrEqual(105);
    }
  });
});

describe('形状', () => {
  it('高いプレスの守備ラインは低いプレスより高い', () => {
    const line = (h: 'high' | 'low') => {
      const m = makeTestMatch(tactic({ pressHeight: h }));
      m.possession = 1;
      m.ball.pos = { x: 52, y: 34 };
      updateLastLines(m);
      updateFrames(m);
      return m.frames[0].line;
    };
    expect(line('high')).toBeGreaterThan(line('low') + 15);
  });
  it('攻撃側が幅を取ると守備側の幅も広がる', () => {
    const w = (width: 'wide' | 'narrow') => {
      const m = makeTestMatch(tactic({}), tactic({ width }));
      m.possession = 1;
      updateLastLines(m);
      updateFrames(m);
      return m.frames[0].width;
    };
    expect(w('wide')).toBeGreaterThan(w('narrow'));
  });
  it('SBを内側に入れると中央へ寄る', () => {
    const y = (fullbacks: 'overlap' | 'invert') => {
      const m = makeTestMatch(tactic({ formation: '4-3-3', fullbacks }));
      m.possession = 0;
      updateLastLines(m);
      updateFrames(m);
      return Math.abs(shapeTarget(m, m.players[1]).y - 34);
    };
    expect(y('invert')).toBeLessThan(y('overlap'));
  });
  it('試合中に戦術を変えると役割が変わる', () => {
    const m = makeTestMatch(tactic({ formation: '4-3-3' }));
    setTactics(m, 0, tactic({ formation: '4-3-3', roles: { 9: 'f9' } }));
    expect(m.players[9].role).toBe('f9');
  });
});

describe('評価', () => {
  it('脅威度はゴールに近いほど高い', () => {
    expect(threat({ x: 95, y: 34 })).toBeGreaterThan(threat({ x: 60, y: 34 }));
    expect(threat({ x: 60, y: 34 })).toBeGreaterThan(threat({ x: 20, y: 34 }));
  });
  it('近いシュートほど xG が高い', () => {
    const m = makeTestMatch();
    for (const p of m.players) if (p.team === 1 && p.role !== 'gk') p.pos = { x: 40, y: 5 + p.id };
    const p = m.players[9];
    expect(computeXg(m, p, { x: 97, y: 34 })).toBeGreaterThan(computeXg(m, p, { x: 80, y: 34 }));
  });
  it('コース上に相手がいるパスは危険と判定される', () => {
    const m = makeTestMatch();
    const blocker = m.players.find((p) => p.team === 1 && p.role !== 'gk')!;
    for (const p of m.players) if (p.team === 1) p.pos = { x: 100, y: 5 };
    blocker.pos = { x: 40, y: 34 };
    const blocked = passSafety(m, { x: 30, y: 34 }, { x: 50, y: 34 }, 0, false);
    const clear = passSafety(m, { x: 30, y: 60 }, { x: 50, y: 60 }, 0, false);
    expect(blocked).toBeLessThan(clear);
  });
});

describe('指標', () => {
  it('保持率は合計100%になり、説明文が生成される', () => {
    const m = runToEnd(createMatch({ teams: [team('A'), team('B')], seed: 9 }));
    expect(possessionPct(m, 0) + possessionPct(m, 1)).toBeCloseTo(100, 5);
    expect(ppda(m, 0)).toBeGreaterThan(0);
    expect(explain(m, 0).length).toBeGreaterThan(0);
  });
});

describe('進行', () => {
  it('ハーフタイムで止まり resume で再開する', () => {
    const m = createMatch({ teams: [team('A'), team('B')], seed: 3 });
    while (!m.atHalftime) step(m);
    const t = m.t;
    step(m);
    expect(m.t).toBe(t);
    resume(m);
    step(m);
    expect(m.t).toBeGreaterThan(t);
  });
  it('スクリプトで相手の戦術が変わる', () => {
    const s = STAGES.find((x) => x.id === 12)!;
    const m = createMatch({ teams: [team('A'), s.opponent], seed: 5, script: { side: 1, phases: s.script! } });
    runToEnd(m);
    expect(m.tactics[1].formation).not.toBe(s.opponent.tactics.formation);
  });
  it('全チームが1試合走り切れる', () => {
    for (const t of TEAMS) {
      const m = runToEnd(createMatch({ teams: [team('A'), { ...team('B'), tactics: t.tactics }], seed: 11 }));
      expect(m.finished).toBe(true);
    }
  });
  it('12ステージと8チームがある', () => {
    expect(STAGES).toHaveLength(12);
    expect(TEAMS).toHaveLength(8);
  });
});


describe('敗因の診断', () => {
  it('想定解は攻略の鍵をすべて満たし、初期設定は少なくとも1つ外す', async () => {
    const { STAGE_KEYS } = await import('../data/stages');
    const { DEFAULT_TACTICS } = await import('../data/formations');
    const m = makeTestMatch();
    for (const s of STAGES) {
      const keys = STAGE_KEYS[s.id].filter((k) => k.label !== '後半に修正する');
      for (const key of keys) expect(key.check(s.solution, m), `STAGE ${s.id}: ${key.label}`).toBe(true);
      expect(STAGE_KEYS[s.id].some((key) => !key.check(DEFAULT_TACTICS, m)), `STAGE ${s.id}`).toBe(true);
    }
  });
  it('負けた試合では悪かった点が挙がる', async () => {
    const { diagnose } = await import('./diagnosis');
    const s = STAGES[4];
    const m = runToEnd(createMatch({ teams: [team('A'), s.opponent], seed: 3 }));
    const { STAGE_KEYS } = await import('../data/stages');
    const d = diagnose(m, STAGE_KEYS[s.id]);
    expect(d.bad.length).toBeGreaterThan(0);
    expect(d.bad.every((f) => f.detail.length > 0)).toBe(true);
  });
});
