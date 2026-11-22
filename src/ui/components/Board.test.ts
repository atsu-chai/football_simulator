import { describe, expect, it } from 'vitest';
import { preview } from './Board';
import { tactic } from '../../data/formations';
import type { FormationId } from '../../engine/types';

const team = (formation: FormationId) => ({ name: 'fixture', short: 'F', color: '#888', tactics: tactic({ formation }) });
describe('tactics board formation lines', () => {
  it.each(['attack', 'defend'] as const)('keeps the 4-3-3 anchor, interiors and wingers ordered in %s', phase => {
    const ps = preview(team('4-3-3'), team('4-4-2'), phase).filter(p => p.team === 0);
    const x = (role: string) => ps.filter(p => p.role === role).reduce((s,p) => s+p.at.x,0) / ps.filter(p => p.role === role).length;
    expect(x('dm')).toBeGreaterThan(x('cb') + 2);
    expect(x('cm')).toBeGreaterThan(x('dm') + 2);
    expect(x('wg')).toBeGreaterThan(x('cm') + 2);
  });
  it.each(['attack', 'defend'] as const)('keeps the 4-2-3-1 double pivot behind the band of three in %s', phase => {
    const ps = preview(team('4-2-3-1'), team('4-4-2'), phase).filter(p => p.team === 0);
    const pivots = ps.filter(p => p.role === 'dm');
    expect(pivots).toHaveLength(2);
    for (const p of ps.filter(p => p.role === 'wg' || p.role === 'am')) expect(p.at.x).toBeGreaterThan(Math.max(...pivots.map(p => p.at.x)) + 2);
    expect(ps.find(p => p.role === 'st')!.at.x).toBeGreaterThan(ps.find(p => p.role === 'am')!.at.x + 2);
  });
  it.each(['attack', 'defend'] as const)('keeps the 3-4-2-1 shadows behind the striker in %s', phase => {
    const ps = preview(team('3-4-2-1'), team('4-4-2'), phase).filter(p => p.team === 0);
    const shadows = ps.filter(p => p.role === 'am');
    expect(shadows).toHaveLength(2);
    for (const p of shadows) expect(p.at.x).toBeLessThan(ps.find(p => p.role === 'st')!.at.x - 2);
  });
});
