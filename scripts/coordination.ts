/** Shared 1 Hz tracking measurements; coordinates rotate with the attack direction. */
import type { Frame } from './behaviour';
const mean=(a:number[])=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const sd=(a:number[])=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
const role=(r:string)=>r==='iw'?'wg':r==='f9'?'st':r==='wb'?'fb':r==='dm'?'cm':r;
export function hullArea(points:number[][]):number {
 const ps=points.map(p=>[...p]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=(xs:number[][])=>{const h:number[][]=[];for(const p of xs){while(h.length>1&&cross(h.at(-2)!,h.at(-1)!,p)<=0)h.pop();h.push(p);}return h.slice(0,-1);};
 const h=[...half(ps),...half([...ps].reverse())];return Math.abs(h.reduce((s,p,i)=>{const q=h[(i+1)%h.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2;
}
export class Coordination {
 cells:Record<string,{n:number;sum:number[];square:number[]}>={};
 pairs:Record<string,number[]>={};
 pair(k:string,x:number,y:number){const a=this.pairs[k]??=[0,0,0,0,0,0];a[0]++;a[1]+=x;a[2]+=y;a[3]+=x*x;a[4]+=y*y;a[5]+=x*y;}
 feed(h:Frame[],team:number,sign:number,add:(k:string,v:number)=>void){
  const f=h.at(-1)!,phase=f.poss===team?'attack':'defend';
  const ps=f.p.filter(p=>p[1]===team&&p[2]!=='gk');
  const at=(g:Frame,id:number)=>{const p=g.p.find(p=>p[0]===id)!;return sign===1?[p[3],p[4]]:[105-p[3],68-p[4]];};
  const ball=(g:Frame)=>sign===1?g.b:[105-g.b[0],68-g.b[1]];
  const center=(g:Frame,ids=ps.map(p=>p[0]))=>[0,1].map(a=>mean(ids.map(id=>at(g,id)[a])));
  const c=center(f),b=ball(f),zone=`${Math.min(2,Math.floor(b[0]/35))}|${Math.min(2,Math.floor(b[1]/(68/3)))}`;
  // Stable role membership, including all five defenders in a three-CB system.
  // WG belongs to the front unit; inter-line figures therefore describe role units, not inferred formations.
  const units=[ps.filter(p=>['cb','fb','wb'].includes(p[2])),ps.filter(p=>['dm','cm'].includes(p[2])),ps.filter(p=>['am','wg','iw','st','f9'].includes(p[2]))];
  for(const p of ps){const v=at(f,p[0]),key=`${phase}|${zone}|${role(p[2])}`,a=this.cells[key]??={n:0,sum:[0,0,0,0],square:[0,0,0,0]};
   const values=[v[0]-b[0],v[1]-b[1],v[0]-c[0],v[1]-c[1]];a.n++;values.forEach((v,i)=>{a.sum[i]+=v;a.square[i]+=v*v;});
   add(`nearestTeammate_${phase}`,Math.min(...ps.filter(q=>q!==p).map(q=>Math.hypot(v[0]-at(f,q[0])[0],v[1]-at(f,q[0])[1]))));
   if(phase==='attack'&&['fb','wg'].includes(role(p[2])))add(`width_${role(p[2])}`,Math.abs(v[1]-34));
  }
  add(`hull_${phase}`,hullArea(ps.map(p=>at(f,p[0]))));
  if(phase==='defend'){
   add('backFlatness',sd(units[0].map(p=>at(f,p[0])[0])));
   const cx=units.map(u=>mean(u.map(p=>at(f,p[0])[0])));if(units[0].length&&units[1].length)add('gap_def_mid',cx[1]-cx[0]);if(units[1].length&&units[2].length)add('gap_mid_fwd',cx[2]-cx[1]);
   units.forEach((u,i)=>{const ys=u.map(p=>at(f,p[0])[1]).sort((a,b)=>a-b);for(let j=1;j<ys.length;j++){add(`adjacent${i}`,ys[j]-ys[j-1]);add(`adjacent${i}_n${u.length}`,ys[j]-ys[j-1]);}});
  }else{
   const carrier=ps.map(p=>at(f,p[0])).sort((a,c)=>Math.hypot(a[0]-b[0],a[1]-b[1])-Math.hypot(c[0]-b[0],c[1]-b[1]))[0];
   if(Math.hypot(carrier[0]-b[0],carrier[1]-b[1])<3){const support=ps.map(p=>at(f,p[0])).filter(p=>Math.hypot(p[0]-carrier[0],p[1]-carrier[1])>0.1&&Math.hypot(p[0]-carrier[0],p[1]-carrier[1])<=15);
    add('options15',support.length);if(support.length>1){add('supportWidth',Math.max(...support.map(p=>p[1]))-Math.min(...support.map(p=>p[1])));add('supportDepth',Math.max(...support.map(p=>p[0]))-Math.min(...support.map(p=>p[0])));}
   }
  }
  const prev=h.at(-2)!,cprev=center(prev),cv=c.map((v,i)=>v-cprev[i]);let moving=0,withCenter=0;
  for(const p of ps){const a=at(f,p[0]),z=at(prev,p[0]),v=a.map((x,i)=>x-z[i]);if(Math.hypot(...v)>.5&&Math.hypot(...cv)>.5){moving++;if(v[0]*cv[0]+v[1]*cv[1]>0)withCenter++;}}
  if(moving)add(`movingWithCentroid_${phase}`,withCenter/moving);
  units.forEach((u,i)=>{if(!u.length)return;for(let j=0;j<u.length;j++)for(let k=j+1;k<u.length;k++)for(const axis of [0,1]){const v=(id:number)=>at(f,id)[axis]-at(prev,id)[axis];this.pair(`velocity_${phase}_${i}_${axis}`,v(u[j][0]),v(u[k][0]));this.pair(`velocity_${phase}_${i}_${axis}`,v(u[k][0]),v(u[j][0]));}
   for(const seconds of [1,2,3,4]){if(!h.slice(-seconds-1).every(g=>g.poss===f.poss))continue;const old=h[h.length-1-seconds],now=center(f,u.map(p=>p[0])),before=center(old,u.map(p=>p[0]));for(const axis of [0,1])this.pair(`coupling_${phase}_${i}_${axis}_${seconds}`,ball(f)[axis]-ball(old)[axis],now[axis]-before[axis]);}
  });
  for(let lag=0;lag<=4;lag++)for(const axis of [0,1])this.pair(`centroidLag_${phase}_${axis}_${lag}`,ball(h[7-lag+1])[axis]-ball(h[7-lag])[axis],cv[axis]);
 }
 result(){
  const correlations=Object.fromEntries(Object.entries(this.pairs).map(([k,[n,x,y,xx,yy,xy]])=>[k,{n,r:(n*xx-x*x)*(n*yy-y*y)>1e-9?(n*xy-x*y)/Math.sqrt((n*xx-x*x)*(n*yy-y*y)):null}]));
  const lagSeconds:Record<string,number|null>={};
  for(const phase of ['attack','defend'])for(const axis of [0,1]){
   const samples=Array.from({length:5},(_,lag)=>({lag,r:correlations[`centroidLag_${phase}_${axis}_${lag}`]?.r})).filter(a=>a.r!==null&&a.r!==undefined).sort((a,b)=>b.r!-a.r!);
   lagSeconds[`${phase}_${axis}`]=samples[0]?.lag??null;
  }
  return {cells:Object.fromEntries(Object.entries(this.cells).map(([k,a])=>{
   const mu=a.sum.map(v=>v/a.n);
   return[k,{n:a.n,mean:mu,spread:a.square.map((v,i)=>Math.sqrt(Math.max(0,v/a.n-mu[i]**2)))}];
  })),correlations,lagSeconds};
 }

}

export function compareCoordination(sim:ReturnType<Coordination['result']>,real:ReturnType<Coordination['result']>){
 const errors=[0,0,0,0],spreads=[0,0,0,0];let weight=0,total=0,cells=0;
 for(const [k,r] of Object.entries(real.cells)){
  if(r.n<40)continue;total+=r.n;const s=sim.cells[k];if(!s||s.n<20)continue;
  cells++;weight+=r.n;for(let i=0;i<4;i++){errors[i]+=r.n*(s.mean[i]-r.mean[i])**2;spreads[i]+=r.n*(s.spread[i]-r.spread[i])**2;}
 }
 const correlationErrors:Record<string,number[]>={};
 const eligible:Record<string,number>={},covered:Record<string,number>={};
 for(const [k,r] of Object.entries(real.correlations)){const family=k.split('_')[0];if(r.n<100||r.r===null)continue;eligible[family]=(eligible[family]??0)+1;const s=sim.correlations[k];if(!s||s.n<100||s.r===null)continue;covered[family]=(covered[family]??0)+1;(correlationErrors[family]??=[]).push((s.r-r.r)**2);}
 return {correlationCoverage:Object.fromEntries(Object.entries(eligible).map(([k,n])=>[k,(covered[k]??0)/n])),cells,coverage:weight/Math.max(1,total),ballPositionRMSE:Math.sqrt((errors[0]+errors[1])/Math.max(1,weight)),centroidPositionRMSE:Math.sqrt((errors[2]+errors[3])/Math.max(1,weight)),spreadRMSE:Math.sqrt(spreads.reduce((a,b)=>a+b,0)/Math.max(1,weight)/4),correlationRMSE:Object.fromEntries(Object.entries(correlationErrors).map(([k,a])=>[k,Math.sqrt(mean(a))]))};
}
