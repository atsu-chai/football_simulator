import { describe, expect, it } from 'vitest';
import { OffBall } from './offball';
import type { Frame } from './behaviour';

function frames(): Frame[] {
  return [0, 1, 2].map(t => ({ match: 'fixture', section: '1', t, live: true, poss: 0, directions: [1, -1], b: [90, 10],
    p: Array.from({ length: 22 }, (_, id) => {
      const team = id < 11 ? 0 : 1, slot = id % 11;
      const role = slot === 0 ? 'gk' : slot < 3 ? 'fb' : slot < 5 ? 'cb' : slot < 8 ? 'cm' : slot < 10 ? 'wg' : 'st';
      const x = team ? slot === 0 ? 104 : 96 : slot === 0 ? 5 : slot === 10 ? 94 + t : slot === 8 ? 90 : 60 + slot;
      return [id, team, role, x, slot === 8 ? 10 : 34] as Frame['p'][number];
    }),
  }));
}
describe('off-ball shared tracking measurement', () => {
  it('uses the second-last opponent, excludes the carrier and measures displacement at 1 Hz', () => {
    const o = new OffBall(); frames().forEach(f => o.feed(f));
    const r = o.result();
    expect(r.metrics.nearLine.mean).toBe(1);
    expect(r.metrics.cross_box.mean).toBe(1);
    expect(r.metrics.ahead_final.mean).toBe(1);
    expect(r.metrics.speed_st.mean).toBe(1);
    expect(r.metrics.beyondLineBallBehind.mean).toBe(0);
  });
  it('is invariant to pitch rotation and team identity', () => {
    const a = new OffBall(), b = new OffBall();
    frames().forEach(f => { a.feed(f); b.feed({ ...f, poss: 1, directions: [1, -1], b: [105-f.b[0], 68-f.b[1]],
      p: f.p.map(([id, team, role, x, y]) => [id, 1-team, role, 105-x, 68-y]) }); });
    expect(b.result()).toEqual(a.result());
  });
  it.each(['half', 'gap', 'dead', 'possession', 'roster', 'unknown'] as const)('excludes interrupted %s pairs', kind => {
    const o = new OffBall(), [a,b] = frames();
    if (kind === 'half') b.section = '2';
    if (kind === 'gap') b.t = 3;
    if (kind === 'dead') a.live = false;
    if (kind === 'possession') a.poss = 1;
    if (kind === 'roster') a.p.pop();
    if (kind === 'unknown') a.p[1][2] = 'unknown';
    o.feed(a); o.feed(b); expect(o.result().metrics).toEqual({});
  });
});
