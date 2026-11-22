import { describe, expect, it } from 'vitest';
import { makeTestMatch } from './testUtils';
import { decideOnBall, computeXg, shoot } from './onBall';
import { stepBall } from './ball';
import { toAbs } from './geometry';
import { updateLastLines } from './teamShape';
import type { Side } from './types';

function scenario(side: Side = 0, x = 75) {
  const m = makeTestMatch();
  m.dead = null;
  for (const p of m.players) p.pos = toAbs(side, { x: 35, y: 3 + p.id });
  const p = m.players.find(p => p.team === side && p.role === 'st')!;
  p.pos = toAbs(side, { x, y: 34 });
  const gk = m.players.find(p => p.team !== side && p.role === 'gk')!;
  gk.pos = toAbs(side, { x: 100, y: 34 });
  m.ball.pos = { ...p.pos };
  m.ball.owner = p.id;
  m.possession = side;
  return { m, p };
}

describe('シュートの選択・結果・飛距離', () => {
  it.each(([0, 1] as Side[]).flatMap(side => [false,true].flatMap(header => [6,11,20,30,32].map(distance => ({ side,header,distance })))))('$distance mのゴール判定弾がラインを越える（side $side, header $header）', ({side,header,distance}) => {
    const { m, p } = scenario(side, 105-distance);
    m.rand = () => 0;
    m.ball.z = header ? 1.8 : 0;
    shoot(m, p, .05, header);
    for (let i = 0; i < 100 && m.ball.shot; i++) stepBall(m);
    expect(m.score[side]).toBe(1);
  });
  it('鋭角のゴール判定弾もゴール平面でポスト内を通過する', () => {
    const { m, p } = scenario(0,98);p.pos.y=60;m.ball.pos={...p.pos};m.rand=()=>0;
    shoot(m,p,.05,false);
    for(let i=0;i<100&&m.ball.shot;i++)stepBall(m);
    expect(m.score[0]).toBe(1);
  });
  it('30mのセーブ判定弾がGKへ届いて解決する', () => {
    const { m, p } = scenario();
    m.rand = () => .2;
    shoot(m, p, .05, false);
    for (let i = 0; i < 100 && m.ball.shot; i++) stepBall(m);
    expect(m.stats[0].onTarget).toBe(1);
    expect(m.ball.shot).toBeNull();
  });
  it.each(['blocked','saved'] as const)('速い%s弾の接触をtick間ですり抜けない', outcome => {
    const {m,p}=scenario();m.rand=()=>0;shoot(m,p,.05,false);
    const defender=m.players.find(q=>q.team===1&&q.role===(outcome==='saved'?'gk':'cb'))!;
    defender.pos={x:outcome==='saved'?100:90,y:34};
    m.ball.pos={x:defender.pos.x-1.3,y:34+(outcome==='saved'?2.4:1.5)};
    m.ball.vel={x:26,y:0};m.ball.shot!.outcome=outcome;m.ball.shot!.blocker=defender.id;
    stepBall(m);
    expect(m.ball.shot).toBeNull();
    if(outcome==='saved')expect(m.stats[0].onTarget).toBe(1);
    else expect(m.stats[0].corners).toBe(1);
  });
  it.each(['goal','saved','blocked','miss'] as const)('停止した%s弾をこぼれ球へ戻す（goal記録だけmissにする）', outcome => {
    const { m, p } = scenario();
    m.rand = () => 0;
    shoot(m, p, .05, false);
    m.ball.shot!.outcome=outcome;m.shots[0].outcome=outcome;
    m.ball.vel = { x: 0, y: 0 }; m.ball.z = 0; m.ball.vz = 0;
    stepBall(m);
    expect(m.ball.shot).toBeNull();
    expect(m.shots[0].outcome).toBe(outcome==='goal'?'miss':outcome);
    expect(m.score[0]).toBe(0);
  });
  it('30mの投機的シュートより、ボックスのフリーな味方を使う', () => {
    const { m, p } = scenario();
    const q = m.players.find(q => q.team === 0 && q.id !== p.id && q.role !== 'gk')!;
    q.pos = { x: 89, y: 40 };
    m.players.find(q => q.team === 1 && q.role !== 'gk')!.pos = { x: 96, y: 65 };
    updateLastLines(m);
    m.rand = () => .5;
    decideOnBall(m, p);
    expect(m.stats[0].shots).toBe(0);
    expect(m.ball.pass?.to).toBe(q.id);
  });
  it('無圧の11mのxGは一律倍率で70%に飽和しない', () => {
    const { m, p } = scenario(0, 94);
    expect(computeXg(m, p, p.pos)).toBeGreaterThan(.12);
    expect(computeXg(m, p, p.pos)).toBeLessThan(.3);
    expect(computeXg(m, p, { x: 80, y: 34 })).toBeLessThan(.06);
  });
  it('クロスが受け手の頭の高さへ届き、頭上を越えて直接ゴールへ流れない', () => {
    const {m,p}=scenario(0,75);p.pos.y=3;m.ball.pos={...p.pos};
    const q=m.players.find(q=>q.team===0&&q.id!==p.id&&q.role!=='gk')!;q.pos={x:95,y:34};
    m.players.find(q=>q.team===1&&q.role!=='gk')!.pos={x:96,y:65};updateLastLines(m);
    m.rand=()=>.5;decideOnBall(m,p);
    expect(m.ball.pass?.cross).toBe(true);
    q.pos={...m.ball.pass!.point};
    for(let i=0;i<80&&m.ball.pass;i++)stepBall(m);
    expect(m.shots.some(s=>s.header)).toBe(true);
  });
});
