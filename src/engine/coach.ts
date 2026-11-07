import { dist, relX, toRel } from './geometry';
import { addEvent } from './events';
import { oppLineX } from './teamShape';
import { CoachHint, MatchState, Side } from './types';

type Cond = (m: MatchState, me: Side) => boolean;

const shareOfPossession = (m: MatchState, me: Side) => {
  const a = m.stats[me].possessionTicks;
  const b = m.stats[(1 - me) as Side].possessionTicks;
  return a / Math.max(1, a + b);
};

const countNearBall = (m: MatchState, side: Side, r: number) =>
  m.players.filter((p) => p.team === side && p.role !== 'gk' && dist(p.pos, m.ball.pos) < r).length;

/** 局面の検出条件。ステージのヒントはこのキーを `when` で指定する。 */
export const CONDITIONS: Record<string, Cond> = {
  overload: (m, me) =>
    m.possession === me && countNearBall(m, me, 16) - countNearBall(m, (1 - me) as Side, 16) >= 2,
  underload: (m, me) =>
    m.possession !== me && countNearBall(m, (1 - me) as Side, 16) - countNearBall(m, me, 16) >= 2,
  oppHighLine: (m, me) => m.possession === me && m.lastLine[(1 - me) as Side] > 45,
  oppDeepBlock: (m, me) =>
    m.possession === me && m.t > 40 && m.lastLine[(1 - me) as Side] < 24 && shareOfPossession(m, me) > 0.5,
  beingPressed: (m, me) => m.stats[me].turnoversOwnHalf >= 3,
  sterile: (m, me) => m.t > 120 && shareOfPossession(m, me) > 0.55 && m.stats[me].shots <= 2,
  concedingCounters: (m, me) => m.stats[(1 - me) as Side].counters >= 3,
  concededShots: (m, me) => m.stats[(1 - me) as Side].shots >= 6 && m.stats[me].shots < 4,
  oppManMark: (m, me) => m.tactics[(1 - me) as Side].marking === 'man',
  centerCrowded: (m, me) => {
    if (m.possession !== me) return false;
    const r = toRel(me, m.ball.pos);
    if (r.x < 45 || Math.abs(r.y - 34) > 12) return false;
    const opp = (1 - me) as Side;
    const center = m.players.filter((p) => p.team === opp && Math.abs(p.pos.y - 34) < 15 && p.role !== 'gk').length;
    return center >= 7;
  },
  wingFree: (m, me) => {
    if (m.possession !== me) return false;
    const opp = (1 - me) as Side;
    return m.players.some(
      (p) =>
        p.team === me &&
        Math.abs(p.pos.y - 34) > 20 &&
        relX(me, p.pos.x) > 60 &&
        !m.players.some((o) => o.team === opp && dist(o.pos, p.pos) < 9),
    );
  },
  behindLineRunner: (m, me) => {
    const lim = oppLineX(m, me);
    return m.possession === me && m.players.some((p) => p.team === me && relX(me, p.pos.x) > lim && p.runUntil > m.t);
  },
  halfTime2: (m) => m.half === 2 && m.t < 500,
  always: () => true,
  trailing: (m, me) => m.score[me] < m.score[(1 - me) as Side],
  leading: (m, me) => m.score[me] > m.score[(1 - me) as Side],
};

const GENERIC: CoachHint[] = [
  { id: 'overload', when: 'overload', text: 'ボール周辺で数的優位。フリーの味方を探し、相手が寄る前に逆へ展開しよう。', overlay: 'numbers' },
  { id: 'underload', when: 'underload', text: 'ボール周辺で相手に数で負けている。中盤の人数かコンパクトさを見直そう。', overlay: 'numbers' },
  { id: 'oppHighLine', when: 'oppHighLine', text: '相手の最終ラインが高い。背後のスペースへの一発が効く場面。', overlay: 'lines' },
  { id: 'oppDeepBlock', when: 'oppDeepBlock', text: '相手は深く構えている。背後にスペースはないので、幅とハーフスペースで崩そう。', overlay: 'lanes' },
  { id: 'beingPressed', when: 'beingPressed', text: '自陣で何度も奪われている。ビルドアップを長くしてプレスの頭を越えよう。', key: true, overlay: 'passes' },
  { id: 'sterile', when: 'sterile', text: 'ボールは持てているのに崩せていない。テンポを上げるか、幅を広げよう。', key: true, overlay: 'space' },
  { id: 'concedingCounters', when: 'concedingCounters', text: '切り替えでカウンターを受けている。SBを残すか、即時奪回で止めよう。', key: true, overlay: 'lines' },
  { id: 'concededShots', when: 'concededShots', text: 'シュートを打たれ続けている。守備ブロックの位置と人数を見直そう。', key: true, overlay: 'numbers' },
  { id: 'wingFree', when: 'wingFree', text: '逆サイドの味方がフリー。サイドチェンジの好機。', overlay: 'space' },
  { id: 'centerCrowded', when: 'centerCrowded', text: '中央が密集している。幅を使って相手を横に広げよう。', overlay: 'lanes' },
];

export function runCoach(m: MatchState) {
  const me = m.cfg.coachSide;
  if (me === undefined || m.t < m.coachNextAt || m.dead) return;
  const list = [...(m.cfg.coachHints ?? []), ...GENERIC];
  for (const h of list) {
    if (m.firedHints.has(h.id)) continue;
    const cond = CONDITIONS[h.when];
    if (!cond || !cond(m, me)) continue;
    m.firedHints.add(h.id);
    m.coachNextAt = m.t + 28;
    addEvent(m, 'coach', h.text, undefined, { key: h.key, overlay: h.overlay });
    return;
  }
  m.coachNextAt = m.t + 2;
}
