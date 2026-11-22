import positioning from '../data/positioning.json';
import {FORMATIONS} from '../data/formations';
import {clamp,dist,toAbs,toRel} from './geometry';
import {shapeTarget} from './teamShape';
import type {MatchState,Player,Side} from './types';
/** Resolve individual choices together, before any player moves. */
export function coordinateUnits(m:MatchState){
 for(const side of [0,1] as Side[]){
  const slots=FORMATIONS[m.tactics[side].formation];
  const team=m.players.filter(p=>p.team===side&&p.role!=='gk');
  const unit=(p:Player)=>m.possession!==side&&['cb','fb','wb'].includes(p.role)?0:slots[p.slot].x<.2?0:slots[p.slot].x<.7?1:2;
  const bases=new Map(team.map(p=>[p.id,toRel(side,shapeTarget(m,p))]));
  const special=(p:Player)=>p.id===m.ball.owner||p.pressing||p.runTarget!==null||m.ball.pass?.to===p.id;
  for(const i of [0,1,2]){
   const members=team.filter(p=>unit(p)===i),settled=members.filter(p=>!special(p));
   if(!settled.length)continue;
   // Local marking/receiving is a bounded deviation from a shared lateral shift.
   const shift=settled.reduce((s,p)=>s+clamp(toRel(side,p.target).y-bases.get(p.id)!.y,-6,6),0)/settled.length;
   const departures=members.filter(special);
   for(const p of settled){const base=bases.get(p.id)!,target=toRel(side,p.target);
    target.y=base.y+shift*.05+clamp(target.y-base.y,-16,16)*.95;
    // The closest remaining slot covers the space a pressing/running teammate leaves.
    for(const q of departures){const vacancy=bases.get(q.id)!;
     const cover=settled.reduce((a,b)=>dist(bases.get(a.id)!,vacancy)<dist(bases.get(b.id)!,vacancy)?a:b);
     if(cover!==p)continue;
     target.y+=clamp((vacancy.y-base.y)*.2,-2.5,2.5);
     target.x+=clamp((vacancy.x-base.x)*.12,-2,0);
    }
    p.target=toAbs(side,{x:clamp(target.x,2,103),y:clamp(target.y,2,66)});
   }
  }
  // The measured role-centroid envelope moves with the shared learned block.
  // Runs remain possible, but cannot leave an isolated forward by the goalkeeper.
  const center=[...bases.values()].reduce((s,p)=>s+p.x,0)/team.length;
  const phase=m.possession===side?'attack':'defend',bounds=[...positioning.blockBounds[phase]];
  if(phase==='attack'&&m.tactics[side].onWin==='counter'&&m.t-m.turnoverAt<6)bounds[1]=positioning.frontTail.attack;
  const compact={tight:.85,normal:1,loose:1.15}[m.tactics[side].compactness];
  const ball=toRel(side,m.ball.pos);
  const crossingAttack=phase==='attack'&&ball.x>74&&Math.abs(ball.y-34)>12;
  for(const p of team)if(p.id!==m.ball.owner&&!p.pressing&&m.ball.pass?.to!==p.id){
   // A genuine box run from an advanced wide ball needs the measured striker
   // tail, rather than the ordinary p90 envelope that stopped runners at 85m.
   const front=crossingAttack&&['st','f9','am','wg','iw'].includes(p.role);
   const upper=front?positioning.frontTail.attack:bounds[1];
   const r=toRel(side,p.target);r.x=clamp(r.x,center+bounds[0]*compact,center+upper*compact);
   p.target=toAbs(side,{x:clamp(r.x,2,103),y:r.y});
  }
  // A learned cover budget leaves only the needed slots near the ball. Project
  // excess ordinary cover along its existing depth lane, with normal movement
  // and a 6m cap; preserve pressers, receivers and the goal-side back line.
  if(m.possession!==side){
   const ball=toRel(side,m.ball.pos),u=clamp(ball.x/35-.5,0,2),i=Math.floor(u),f=u-i;
   const expected=positioning.defendDensity[i].mean*(1-f)+positioning.defendDensity[Math.min(2,i+1)].mean*f;
   const actual=team.filter(p=>dist(p.pos,m.ball.pos)<20).length,planned=team.filter(p=>dist(p.target,m.ball.pos)<20).length;
   let excess=Math.max(0,Math.max(actual,planned)-Math.floor(expected-.75));
   const candidates=team.filter(p=>!special(p)&&dist(p.pos,m.ball.pos)<22).sort((a,b)=>dist(b.pos,m.ball.pos)-dist(a.pos,m.ball.pos));
   for(const p of candidates){
    if(excess<=0)break;const r=toRel(side,p.target),dx=r.x-ball.x,dy=r.y-ball.y;
    if(Math.hypot(dx,dy)>=22)continue;
    if(['cb','fb','wb'].includes(p.role)){
     const direction=Math.sign(dy)||Math.sign(bases.get(p.id)!.y-34)||1;
     const edge=ball.y+direction*Math.sqrt(Math.max(0,22*22-dx*dx));
     if(edge<2||edge>66)continue;r.y+=clamp(edge-r.y,-6,6);
    }else{
     const direction=Math.sign(dx)||-1,edge=ball.x+direction*Math.sqrt(Math.max(0,22*22-dy*dy));
     if(edge<2||edge>103)continue;r.x+=clamp(edge-r.x,-6,6);
    }
    p.target=toAbs(side,r);excess--;
   }
  }

  // Joint spacing: symmetric forces separate overlapping cover/support slots; individual caps bound movement.
  // Real nearest-teammate p10 is about 5m; the arrival dead zone otherwise leaves pairs much closer.
  const settled=team.filter(p=>!special(p));
  const corrections=new Map(settled.map(p=>[p.id,{x:0,y:0}]));
  const gap=m.possession===side?8.5:9.5;
  for(let a=0;a<settled.length;a++)for(let b=a+1;b<settled.length;b++){
   const p=settled[a],q=settled[b];
   const back=(r:string)=>r==='fb'||r==='wb',wing=(r:string)=>r==='wg'||r==='iw';
   const flank=(back(p.role)&&wing(q.role)||back(q.role)&&wing(p.role))&&((slots[p.slot].y<.5)===(slots[q.slot].y<.5));
   const pairGap=flank?positioning.flankGap[m.possession===side?'attack':'defend'].p25:gap;
   let dx=p.target.x-q.target.x,dy=p.target.y-q.target.y,d=Math.hypot(dx,dy);
   if(d>=pairGap)continue;
   if(d<.001){const pb=bases.get(p.id)!,qb=bases.get(q.id)!;dx=(pb.x-qb.x)*(side===0?1:-1);dy=(pb.y-qb.y)*(side===0?1:-1);d=Math.hypot(dx,dy)||1;}
   const push=Math.min(3.8,(pairGap-Math.hypot(p.target.x-q.target.x,p.target.y-q.target.y))*.5);
   const pc=corrections.get(p.id)!,qc=corrections.get(q.id)!;pc.x+=dx/d*push;pc.y+=dy/d*push;qc.x-=dx/d*push;qc.y-=dy/d*push;
  }
  const spacing=new Map([...corrections].map(([id,v])=>[id,{...v}]));
  // Target spacing alone misses players arriving from opposite directions.
  // The real nearest-neighbour p10/p50 bracket this 7m anticipation distance.
  // Repel actual close neighbours as well; the ball carrier and active receiver retain priority.
  for(const p of settled)for(const q of team){
   if(p===q)continue;const dx=p.pos.x-q.pos.x,dy=p.pos.y-q.pos.y,d=Math.hypot(dx,dy);
   if(d<.01||d>=6)continue;
   const c=corrections.get(p.id)!;c.x+=dx/d*(6-d);c.y+=dy/d*(6-d);
  }
  for(const p of settled){const c=corrections.get(p.id)!,s=spacing.get(p.id)!,n=Math.hypot(s.x,s.y),scale=Math.min(1,3.8/(n||1));const dx=c.x-s.x,dy=c.y-s.y,budget=Math.max(0,3.8-n),physical=Math.min(1,budget/(Math.hypot(dx,dy)||1));p.target={x:clamp(p.target.x+s.x*scale+dx*physical,2,103),y:clamp(p.target.y+s.y*scale+dy*physical,2,66)};}


 }
}
