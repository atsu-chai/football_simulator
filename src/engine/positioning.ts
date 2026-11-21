import data from '../data/positioning.json';
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
 const c=models[`${phase}|${role}|${side}`]??models[`${phase}|${role}|centre`]??models[`${phase}|${role}|left`]!;
 const b=toRel(p.team,m.ball.pos),sign=p.team===0?1:-1;
 let features=featureCache.get(m.frames[p.team]);
 if(!features){
 const bx=(b.x-52.5)/52.5,by=(b.y-34)/34;
 features=[1,bx,by,bx*bx,by*by,bx*by,clamp(m.movementBallVel.x*sign,-10,10)/10*data.velocityScale,clamp(m.movementBallVel.y*sign,-10,10)/10*data.velocityScale,Math.exp(-Math.max(0,m.t-m.turnoverAt)/3)];
 featureCache.set(m.frames[p.team],features);
 }
 const v=c.map(cs=>cs.reduce((s,v,i)=>s+v*features[i],0));
 // A centred slot borrows the two flanks symmetrically when absent in the sample.
 if(side==='centre'&&!models[`${phase}|${role}|centre`])v[1]=34+(b.y-34)*.18;
 if(side==='right'&&!models[`${phase}|${role}|right`])v[1]=68-v[1];
 return {x:clamp(v[0],3,102),y:clamp(v[1],3,65)};
}
