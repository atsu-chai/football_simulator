import data from '../data/positioning.json';
import {TRACKING_MOTION,TRACKING_TACTICS,learnedShape} from './tracking';
import {clamp,toRel} from './geometry';
import type {MatchState,Player,Vec,TeamFrame} from './types';
import {FORMATIONS} from '../data/formations';
const featureCache=new WeakMap<TeamFrame,number[]>();
const models:Record<string,number[][]>=data.models;
/** Same ball state drives every slot; side identity is fixed by the formation. */
export function learnedPosition(m:MatchState,p:Player):Vec {
 const slot=FORMATIONS[m.tactics[p.team].formation][p.slot];
 const role=p.role==='iw'?'wg':p.role==='f9'?'st':p.role==='wb'?'fb':p.role==='dm'?'cm':p.role;
 const side=slot.y<.44?'left':slot.y>.56?'right':'centre',phase=m.possession===p.team?'attack':'defend';
 let modelKey=`${phase}|${role}|${side}`;
 if(phase==='attack'&&['fb','wg'].includes(role)&&side!=='centre'){
  const b=toRel(p.team,m.ball.pos),counts=data.widthShares[`${Math.min(2,Math.max(0,Math.floor(b.x/35)))}|${side}` as keyof typeof data.widthShares]??[1,1];
  const draw=Math.sin(m.possessionSince*12.9898+(side==='left'?0:78.233))*43758.5453;
  const mode=m.tactics[p.team].fullbacks==='overlap'?'fb':m.tactics[p.team].fullbacks==='invert'?'wg':draw-Math.floor(draw)<counts[0]/(counts[0]+counts[1])?'fb':'wg';
  if(models[modelKey+'|'+mode])modelKey+='|'+mode;
 }
 const c=models[modelKey]??models[`${phase}|${role}|${side}`]??models[`${phase}|${role}|centre`]??models[`${phase}|${role}|left`]!;
 const b=toRel(p.team,m.ball.pos),sign=p.team===0?1:-1;
 let features=featureCache.get(m.frames[p.team]);
 if(!features){
 const bx=(b.x-52.5)/52.5,by=(b.y-34)/34;
 const outfield=m.players.filter(q=>q.team===p.team&&q.role!=='gk');
 let cx=outfield.reduce((s,q)=>s+toRel(p.team,q.pos).x,0)/10,cy=outfield.reduce((s,q)=>s+toRel(p.team,q.pos).y,0)/10;
 const reference=learnedShape(m.tactics[p.team].formation,phase,b.x,b.y),referenceX=(reference[5]*4+reference[6]*3+reference[7]*3)/10;
 if(phase==='defend'){const scale=1+(m.tactics[p.team].compactness==='loose'?1:m.tactics[p.team].compactness==='tight'?-1:0)*TRACKING_TACTICS.length*1.5;cx=m.frames[p.team].referenceBack+(cx-m.frames[p.team].line)/scale;}
 else {const t=m.tactics[p.team],width=(1+(t.width==='wide'?1:t.width==='narrow'?-1:0)*TRACKING_TACTICS.attackingWidth)*(1+(t.compactness==='loose'?1:t.compactness==='tight'?-1:0)*TRACKING_TACTICS.defensiveWidth)*learnedAttackWidth(m,p.team);cy=34+(cy-34-(t.focus==='left'?-5:t.focus==='right'?5:0))/width;}
 const feedback=TRACKING_TACTICS.line*.5;
 cx=clamp(cx,referenceX-feedback,referenceX+feedback);cy=clamp(cy,reference[4]-feedback,reference[4]+feedback);
 features=[1,bx,by,bx*bx,by*by,bx*by,clamp(m.movementBallVel.x*sign,-10,10)/10*data.velocityScale,clamp(m.movementBallVel.y*sign,-10,10)/10*data.velocityScale,Math.exp(-Math.max(0,m.t-m.turnoverAt)/3),...['cb','cm','st'].map(r=>phase==='attack'?FORMATIONS[m.tactics[p.team].formation].filter(s=>r==='cm'?['dm','cm'].includes(s.role):s.role===r).length-(r==='st'?1:2):0),(cx-52.5)/52.5,(cy-34)/34,outfield.reduce((s,q)=>s+q.vel.x*sign,0)/100,outfield.reduce((s,q)=>s+q.vel.y*sign,0)/100];
 featureCache.set(m.frames[p.team],features);
 }
 const v=c.map(cs=>cs.reduce((s,v,i)=>s+v*features[i],0));
 // A centred slot borrows the two flanks symmetrically when absent in the sample.
 if(side==='centre'&&!models[`${phase}|${role}|centre`])v[1]=34+(b.y-34)*.18;
 if(side==='right'&&!models[`${phase}|${role}|right`])v[1]=68-v[1];
 return {x:clamp(v[0],3,102),y:clamp(v[1],3,65)};
}

const widthCache=new WeakMap<TeamFrame,number>();
/** Empirical width under pressure; no extra random draw and no tactic-dependent fit. */
export function learnedAttackWidth(m:MatchState,team:0|1):number {
 const frame=m.frames[team],cached=widthCache.get(frame);if(cached!==undefined)return cached;
 let pressure=Math.min(...m.players.filter(p=>p.team!==team&&p.role!=='gk').map(p=>Math.hypot(p.pos.x-m.ball.pos.x,p.pos.y-m.ball.pos.y)));
 if(pressure<6){
  const h=TRACKING_MOTION.response*1.5,v=m.ball.owner>=0?m.players[m.ball.owner].vel:m.movementBallVel;
  const future=Math.min(...m.players.filter(p=>p.team!==team&&p.role!=='gk').map(p=>Math.hypot(p.pos.x+p.vel.x*h-m.ball.pos.x-v.x*h,p.pos.y+p.vel.y*h-m.ball.pos.y-v.y*h)));
  pressure=Math.min(pressure,future);
 }
 const draw=Math.sin(m.possessionSince*19.19+42.42)*43758.5453,u=draw-Math.floor(draw);
 const widths=data.pressureWidth.map(a=>u<.5?a.quantiles[0]+(a.quantiles[1]-a.quantiles[0])*u*2:a.quantiles[1]+(a.quantiles[2]-a.quantiles[1])*(u-.5)*2);
 const value=pressure<3?widths[0]:pressure<6?widths[1]:widths[2];
 const scale=(pressure<3?1.05:pressure<6?1.2:1.25)*value/data.pressureWidth[2].mean;widthCache.set(frame,scale);return scale;
}
