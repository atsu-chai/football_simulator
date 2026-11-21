import {describe,it,expect} from 'vitest';
import {Coordination,compareCoordination,hullArea} from './coordination';
import type {Frame} from './behaviour';
function sequence():Frame[]{return Array.from({length:16},(_,t)=>({match:'synthetic',section:'firstHalf',t,live:true,poss:0,directions:[1,-1],b:[40+t*t*.08,25+t*t*.02],p:Array.from({length:22},(_,id)=>{const team=id<11?0:1,slot=id%11;return [id,team,slot===0?'gk':slot<5?'cb':slot<8?'cm':'st',15+slot*3+t*t*.04,5+slot*5+t*t*.01];})}));}
describe('coordination measurements',()=>{
 it('measures convex hull area independent of point order and interior points',()=>{expect(hullArea([[0,0],[4,3],[4,0],[0,3],[1,1]])).toBe(12);expect(hullArea([[1,1],[2,2],[3,3]])).toBe(0);});
 it('measures Pearson coupling and preserves all metrics under 180 degree rotation',()=>{
  const a=new Coordination(),b=new Coordination(),fs=sequence();
  for(let i=8;i<fs.length;i++){
   const h=fs.slice(i-8,i+1);a.feed(h,0,1,()=>{});
   const rotated=h.map(f=>({...f,b:[105-f.b[0],68-f.b[1]],p:f.p.map(p=>[p[0],p[1],p[2],105-p[3],68-p[4]] as Frame['p'][number])}));
   b.feed(rotated,0,-1,()=>{});
  }
  const r=a.result();expect(r.correlations.coupling_attack_0_0_4.r).toBeCloseTo(1);
  expect(r.correlations.velocity_attack_0_1.r).toBeCloseTo(1);
  for(const k of Object.keys(r.cells))r.cells[k].mean.forEach((v,i)=>expect(b.result().cells[k].mean[i]).toBeCloseTo(v));
 });
 it('does not hide a missing conditional zone behind a small error',()=>{const a=new Coordination();a.cells={'attack|0|0|cb':{n:100,sum:[100,100,100,100],square:[100,100,100,100]}};const r=compareCoordination(new Coordination().result(),a.result());expect(r.coverage).toBe(0);});
 it('is invariant to arbitrary roster ordering for unequal player velocities',()=>{
  const a=new Coordination(),b=new Coordination(),fs=sequence();
  for(const f of fs)for(const p of f.p){p[3]+=(p[0]%11)*.001*f.t*f.t;p[4]+=(p[0]%11)*.002*f.t*f.t;}
  for(let i=8;i<fs.length;i++){const h=fs.slice(i-8,i+1);a.feed(h,0,1,()=>{});b.feed(h.map(f=>({...f,p:[f.p[0],f.p[3],f.p[1],f.p[4],f.p[2],...f.p.slice(5)]})),0,1,()=>{});}
  for(const [k,v] of Object.entries(a.result().correlations))if(k.startsWith('velocity'))expect(b.result().correlations[k].r).toBeCloseTo(v.r!,10);
 });
 it('reports missing correlation coverage instead of a favorable empty score',()=>{
  const a=new Coordination();for(let i=0;i<100;i++)a.pair('coupling_attack_0_0_1',i,i);
  expect(compareCoordination(new Coordination().result(),a.result()).correlationCoverage.coupling).toBe(0);
 });
 it('reports constant-velocity Pearson correlation as undefined',()=>{const a=new Coordination();for(let i=0;i<5;i++)a.pair('constant',1,1);expect(a.result().correlations.constant.r).toBeNull();});
});
