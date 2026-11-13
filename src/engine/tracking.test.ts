import { describe, expect, it } from 'vitest';
import { freeKick, setPossession } from './ball';
import { learnedShape, trackingPhase } from './tracking';
import { tactic } from '../data/formations';
import { makeTestMatch } from './testUtils';
import { shapeTarget, updateFrames } from './teamShape';
import { step } from './match';
import { attackerMove } from './offBall';
import { teamDefense } from './defending';
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
  it('奪取直後は古い裏抜けを破棄し、速攻だけ前方の出口を作る', () => {
    const target = (onWin: 'keep' | 'counter') => {
      const m = makeTestMatch(tactic({ onWin }));
      m.dead = null; m.t = 20; m.turnoverAt = 19;
      m.ball.pos = { x: 45, y: 34 }; m.lastLine = [30, 20];
      const p = m.players[10];
      p.runTarget = { x: 98, y: 34 }; p.runUntil = 25;
      updateFrames(m); attackerMove(m, p);
      expect(p.runTarget).toBeNull();
      return p.target.x;
    };
    expect(target('counter')).toBeGreaterThan(target('keep') + 5);
  });
  it('喪失後は近い選手が即時奪回し、遠いCBをボールより前へ釣り出さない', () => {
    const count = (onLoss: 'regroup' | 'counterpress') => {
      const m = makeTestMatch(tactic({ onLoss }));
      m.dead = null; m.t = 20; m.turnoverAt = 19; m.possession = 1;
      m.ball.pos = { x: 65, y: 34 }; m.ball.owner = 21;
      m.players[21].pos = { ...m.ball.pos };
      for (const [i, y] of [[7, 30], [8, 34], [9, 38]]) m.players[i].pos = { x: 60, y };
      updateFrames(m); teamDefense(m, 0);
      expect(m.players[2].target.x).toBeLessThan(m.ball.pos.x);
      return m.players.filter(p => p.team === 0 && p.pressing).length;
    };
    expect(count('counterpress')).toBeGreaterThan(count('regroup'));
  });
  it('再開の準備時間を確保し、キッカーが歩いて到着しても再開できる', () => {
    const m = makeTestMatch(); m.dead = null; m.t = 20;
    freeKick(m, 0, { x: 50, y: 34 });
    const d = m.dead!;
    expect(d.until - m.t).toBeGreaterThanOrEqual(16);
    for (let i = 0; i < 240 && m.dead === d; i++) step(m);
    expect(m.dead).not.toBe(d);
    expect(dist(m.players[d.taker].pos, d.at)).toBeLessThan(1);
    expect(m.t).toBeLessThan(d.maxUntil);
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
