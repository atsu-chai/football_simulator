import { describe, expect, it } from 'vitest';
import { setPossession } from './ball';
import { learnedShape, trackingPhase } from './tracking';
import { tactic } from '../data/formations';
import { makeTestMatch } from './testUtils';
import { shapeTarget, updateFrames } from './teamShape';
import { step } from './match';
import { dist, toRel } from './geometry';

describe('実測の位置モデル', () => {
  it('再開とインプレーの保持交代を区別する', () => {
    const m = makeTestMatch();
    m.dead = null; m.t = 2.1;
    expect(trackingPhase(m, 0)).toBe('attack');
    setPossession(m, 1);
    expect(trackingPhase(m, 1)).toBe('win');
    expect(trackingPhase(m, 0)).toBe('loss');
    setPossession(m, 0, false);
    expect(trackingPhase(m, 0)).toBe('attack');
  });
  it('疎な局面とピッチの端でも有限値になり、セル境界で飛ばない', () => {
    for (const phase of ['attack', 'defend', 'win', 'loss'] as const) {
      for (let x = 0; x <= 105; x += 105 / 24) for (let y = 0; y <= 68; y += 68 / 16) {
        const a = learnedShape('5-4-1', phase, x - 0.001, y);
        const b = learnedShape('5-4-1', phase, x + 0.001, y);
        expect(a.every(Number.isFinite)).toBe(true);
        expect(a[2]).toBeGreaterThan(10);
        expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeLessThan(0.1);
      }
    }
  });
  it('編成と偽9番が実測の基準形に反映される', () => {
    const position = (formation: '4-3-3' | '3-5-2', falseNine = false) => {
      const m = makeTestMatch(tactic({ formation, roles: falseNine ? { 9: 'f9' } : {} }));
      m.dead = null; m.t = 20; m.ball.pos = { x: 55, y: 34 }; m.lastLine = [30, 30];
      updateFrames(m);
      return m.players.filter((p) => p.team === 0).map((p) => shapeTarget(m, p));
    };
    expect(dist(position('4-3-3')[1], position('3-5-2')[1])).toBeGreaterThan(5);
    expect(position('4-3-3', true)[9].x).toBeLessThan(position('4-3-3')[9].x - 5);
  });
  it('キックオフ待機中は自陣の配置とセンターサークルを保ち、キッカーがボールにいる', () => {
    const m = makeTestMatch();
    const d = m.dead!;
    for (let i = 0; i < 5; i++) step(m);
    expect(dist(m.players[d.taker].pos, d.at)).toBeLessThan(0.01);
    for (const p of m.players) {
      if (p.id === d.taker) continue;
      expect(toRel(p.team, p.pos).x).toBeLessThanOrEqual(52.5);
      expect(dist(p.pos, p.target)).toBeLessThan(0.01);
      if (p.team !== d.team) expect(dist(p.pos, d.at)).toBeGreaterThanOrEqual(9.15 - 1e-9);
    }
  });
});
