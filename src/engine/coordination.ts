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
  // Joint spacing: symmetric forces separate overlapping cover/support slots; individual caps bound movement.
  // Real nearest-teammate p10 is about 5m; the arrival dead zone otherwise leaves pairs much closer.
  const settled=team.filter(p=>!special(p)&&p.urgency<.9);
  const corrections=new Map(settled.map(p=>[p.id,{x:0,y:0}]));
  const gap=m.possession===side?9:10.5;
  for(let a=0;a<settled.length;a++)for(let b=a+1;b<settled.length;b++){
   const p=settled[a],q=settled[b];let dx=p.target.x-q.target.x,dy=p.target.y-q.target.y,d=Math.hypot(dx,dy);
   if(d>=gap)continue;
   if(d<.001){const pb=bases.get(p.id)!,qb=bases.get(q.id)!;dx=(pb.x-qb.x)*(side===0?1:-1);dy=(pb.y-qb.y)*(side===0?1:-1);d=Math.hypot(dx,dy)||1;}
   const push=Math.min(3.5,(gap-Math.hypot(p.target.x-q.target.x,p.target.y-q.target.y))*.5);
   const pc=corrections.get(p.id)!,qc=corrections.get(q.id)!;pc.x+=dx/d*push;pc.y+=dy/d*push;qc.x-=dx/d*push;qc.y-=dy/d*push;
  }
  for(const p of settled){const c=corrections.get(p.id)!,scale=Math.min(1,3.5/(Math.hypot(c.x,c.y)||1));p.target={x:clamp(p.target.x+c.x*scale,2,103),y:clamp(p.target.y+c.y*scale,2,66)};}

 }
}
