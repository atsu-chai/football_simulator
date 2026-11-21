import {describe,expect,it} from 'vitest';
import {teamDefense} from './defending';
import {coordinateUnits} from './coordination';
import {shapeTarget,updateFrames} from './teamShape';
import {makeTestMatch} from './testUtils';
import {learnedPosition} from './positioning';
import {tactic} from '../data/formations';
import {toRel} from './geometry';
describe('shared positioning and cover',()=>{
 it('retains lateral slot identity when the ball crosses the pitch',()=>{
  const m=makeTestMatch();m.dead=null;m.possession=0;m.t=30;
  for(const y of [1,34,67]){m.ball.pos={x:50,y};updateFrames(m);
   expect(learnedPosition(m,m.players[1]).y).toBeLessThan(learnedPosition(m,m.players[4]).y);
   expect(learnedPosition(m,m.players[2]).y).toBeLessThan(learnedPosition(m,m.players[3]).y);
  }
 });
 it.each([0,20])('covers a pressing fullback with the closest remaining slot, preserving the presser target (y=%s)',(pressY)=>{
  const m=makeTestMatch(tactic({formation:'4-4-2'}));m.dead=null;m.t=30;m.possession=1;m.ball.owner=21;m.ball.pos={x:50,y:10};
  updateFrames(m);for(const p of m.players){p.target=shapeTarget(m,p);p.pressing=false;p.runTarget=null;}
  const fb=m.players[1],cb=m.players[2],far=m.players[3];const before={...cb.target},farBefore={...far.target};
  fb.pressing=true;fb.target={x:fb.target.x+12,y:pressY};const pressTarget={...fb.target};
  coordinateUnits(m);
  expect(cb.target.y).toBeLessThan(before.y);expect(far.target.x).toBeCloseTo(farBefore.x);expect(fb.target).toEqual(pressTarget);
 });
 it('keeps learned targets finite for every formation and role at pitch corners',()=>{
  for(const formation of ['4-3-3','4-2-3-1','3-5-2','5-4-1'] as const){const m=makeTestMatch(tactic({formation}));m.dead=null;m.t=30;
   for(const x of [0,105])for(const y of [0,68])for(const possession of [0,1] as const){m.possession=possession;m.ball.pos={x,y};updateFrames(m);
    for(const p of m.players){const r=toRel(p.team,shapeTarget(m,p));expect(Number.isFinite(r.x+r.y)).toBe(true);expect(r.x).toBeGreaterThanOrEqual(2);expect(r.y).toBeGreaterThanOrEqual(1.5);}
   }
  }
 });
 it('CBが中央の相手を担当したら、担当のないSBも内側のパスコースへ絞る',()=>{
  const m=makeTestMatch();m.dead=null;m.t=30;m.possession=1;m.ball.owner=21;m.ball.pos={x:65,y:34};
  for(const p of m.players)if(p.team===1)p.pos={x:100,y:34};
  m.players[21].pos={...m.ball.pos};m.players[18].pos={x:38,y:32};m.players[20].pos={x:38,y:36};
  m.players[5].pos={x:64,y:34};updateFrames(m);
  const fb=m.players[1],base=shapeTarget(m,fb);
  teamDefense(m,0);
  expect(fb.pressing).toBe(false);expect(fb.markTarget).toBe(-1);
  expect(fb.target.y).toBeGreaterThan(base.y+4);expect(Math.hypot(fb.target.x-base.x,fb.target.y-base.y)).toBeLessThanOrEqual(12.001);
 });

 it('深いビルドアップでCBが実測の左右幅を保ち、中央へ約10m幅に潰れない',()=>{
  const m=makeTestMatch();m.dead=null;m.t=30;m.possession=0;m.ball.pos={x:20,y:34};m.lastLine=[30,30];updateFrames(m);
  const left=shapeTarget(m,m.players[2]),right=shapeTarget(m,m.players[3]);
  expect(right.y-left.y).toBeGreaterThan(25);expect(left.y).toBeLessThan(24);expect(right.y).toBeGreaterThan(44);
 });

 it('同じカバー点へ重なった通常のSBとCBを、両側へ分ける',()=>{
  const m=makeTestMatch();m.dead=null;m.t=30;m.possession=1;m.ball.pos={x:50,y:34};m.lastLine=[30,30];updateFrames(m);
  for(const p of m.players){p.target=shapeTarget(m,p);p.pressing=false;p.runTarget=null;p.urgency=.72;}
  const a=m.players[1],b=m.players[2];a.target={x:30,y:25};b.target={x:30,y:25};
  coordinateUnits(m);expect(Math.hypot(a.target.x-b.target.x,a.target.y-b.target.y)).toBeGreaterThan(6.5);
  expect(a.target.y).toBeLessThan(b.target.y);
 });

 it('担当のないSBが、既に寄せている保持者をカバー担当へ重複させない',()=>{
  const m=makeTestMatch();m.dead=null;m.t=30;m.possession=1;m.ball.owner=21;m.ball.pos={x:50,y:5};
  for(const p of m.players)if(p.team===1&&p.role!=='gk')p.pos={x:100,y:60};
  m.players[21].pos={...m.ball.pos};m.players[8].pos={x:51,y:5};updateFrames(m);
  const fb=m.players[1],base=shapeTarget(m,fb);teamDefense(m,0);
  expect(fb.pressing).toBe(false);expect(fb.markTarget).toBe(-1);expect(fb.target.y).toBeGreaterThan(base.y+1);
 });

 it('喪失後の帰陣では中盤を球へ個別に寄せず、共有の基準位置へ戻す',()=>{
  const m=makeTestMatch(tactic({onLoss:'regroup'}));m.dead=null;m.t=30;m.turnoverAt=29;m.possession=1;m.ball.owner=21;m.ball.pos={x:50,y:10};
  for(const p of m.players)if(p.team===0)p.pos={x:80,y:55};
  m.players[8].pos={x:52,y:10};m.players[5].pos={x:40,y:55};m.players[21].pos={...m.ball.pos};updateFrames(m);
  const midfielder=m.players[5],base=shapeTarget(m,midfielder);teamDefense(m,0);
  expect(midfielder.pressing).toBe(false);expect(midfielder.target).toEqual(base);
 });

 it('喪失直後も、球より前に残った中盤へ通常守備と同じ帰陣を適用する',()=>{
  const m=makeTestMatch(tactic({onLoss:'regroup'}));m.dead=null;m.t=30;m.turnoverAt=29;m.possession=1;m.ball.owner=21;m.ball.pos={x:35,y:10};
  for(const p of m.players)if(p.team===0)p.pos={x:80,y:55};
  m.players[8].pos={x:36,y:10};m.players[21].pos={...m.ball.pos};updateFrames(m);teamDefense(m,0);
  expect(m.players[5].pressing).toBe(false);expect(m.players[5].target.x).toBeLessThanOrEqual(33);expect(m.players[5].urgency).toBe(.95);
 });

 it.each(['deep','high'] as const)('ライン%sはSB/WBを含めた後方ユニットの保持範囲になる',(lineHeight)=>{
  const m=makeTestMatch(tactic({lineHeight}));m.dead=null;m.t=30;m.possession=1;m.ball.pos={x:65,y:34};m.ball.owner=21;m.lastLine=[30,30];
  for(const p of m.players)if(p.team===1&&p.role!=='gk')p.pos={x:lineHeight==='high'?35:70,y:34};
  m.players[21].pos={...m.ball.pos};updateFrames(m);
  for(const p of m.players)if(p.team===0)p.pos=shapeTarget(m,p);
  const cbs=m.players.filter(p=>p.team===0&&p.role==='cb');
  const line=cbs.reduce((s,p)=>s+shapeTarget(m,p).x,0)/cbs.length;
  teamDefense(m,0);
  for(const p of m.players)if(p.team===0&&['cb','fb','wb'].includes(p.role)&&!p.pressing){
    if(lineHeight==='high')expect(p.target.x).toBeGreaterThanOrEqual(line-1.501);
    else expect(p.target.x).toBeLessThanOrEqual(line+6.001);
  }
 });

});
