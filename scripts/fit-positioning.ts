/** Anonymous role/side ridge model, both halves. First five matches fit, last two evaluate. */
import {readFileSync,writeFileSync} from 'node:fs';
import type {Frame} from './behaviour';
const frames=readFileSync(process.argv[2],'utf8').trim().split('\n').map(s=>JSON.parse(s) as Frame);
const matches=[...new Set(frames.map(f=>f.match))];
const reference=JSON.parse(readFileSync('src/data/behaviour.json','utf8'));
if(JSON.stringify(reference.inputs)!==JSON.stringify(JSON.parse(readFileSync(process.argv[2]+'.source.json','utf8')).inputs))throw new Error('Regenerate behaviour reference for this tracking input before fitting');
const blockBounds=Object.fromEntries(['attack','defend'].map(phase=>{const roles=Object.entries(reference.metrics).filter(([k])=>k.startsWith(`roleCentroidX_${phase}_`)).map(([,v])=>v as {p10:number;p90:number});return [phase,[Math.min(...roles.map(v=>v.p10)),Math.max(...roles.map(v=>v.p90))]];}));
const frontTail=Object.fromEntries(['attack','defend'].map(phase=>[phase,reference.metrics[`roleCentroidX_${phase}_st`].p99]));
const defendDensity=[0,1,2].map(i=>{const a=reference.metrics[`near20zone${i}`];return {n:a.n,mean:a.mean};});
const pressureBins=Array.from({length:3},()=>({n:0,sum:0,values:[] as number[]}));
for(const f of frames)if(f.live&&f.poss>=0&&f.p.length===22){
 const own=f.p.filter(p=>p[1]===f.poss&&p[2]!=='gk'),opp=f.p.filter(p=>p[1]!==f.poss&&p[2]!=='gk');
 if(own.length!==10||!opp.length)continue;

 const pressure=Math.min(...opp.map(p=>Math.hypot(p[3]-f.b[0],p[4]-f.b[1]))),i=pressure<3?0:pressure<6?1:2;
 const width=Math.max(...own.map(p=>p[4]))-Math.min(...own.map(p=>p[4]));pressureBins[i].n++;pressureBins[i].sum+=width;pressureBins[i].values.push(width);
}
const pressureWidth=pressureBins.map(a=>{a.values.sort((a,b)=>a-b);return {n:a.n,mean:a.sum/a.n,quantiles:[.1,.5,.9].map(q=>a.values[Math.floor((a.n-1)*q)])};});
const averages=new Map<string,number[]>();
const key=(f:Frame,id:number)=>`${f.match}|${f.section}|${id}`;
for(const f of frames)for(const p of f.p){const a=averages.get(key(f,p[0]))??[0,0];a[0]++;a[1]+=(f.directions?.[p[1]]??1)===1?p[4]:68-p[4];averages.set(key(f,p[0]),a);}
const baseRole=(r:string)=>r==='wb'?'fb':r==='dm'?'cm':r;
const rows:Record<string,{x:number[];y:number[];test:boolean}[]>={};
const widthShares:Record<string,number[]>={};
const flankSamples:Record<string,number[]>={attack:[],defend:[]};
let hist:Frame[]=[],age=30;
let frameIndex=-1;
for(const f of frames){frameIndex++;const prev=hist.at(-1);if(!prev||prev.match!==f.match||prev.section!==f.section||f.t-prev.t!==1||!f.live||f.poss<0){hist=[];age=30;}else age=f.poss===prev.poss?age+1:0;
 if(!f.live||f.poss<0||[0,1].some(t=>f.p.filter(p=>p[1]===t).length!==11)){hist=[];continue;}hist.push(f);if(hist.length>3)hist.shift();if(hist.length<3)continue;
 const future=frames[frameIndex+4];
 if(!future||[frames[frameIndex+1],frames[frameIndex+2],frames[frameIndex+3],future].some((g,i)=>!g||g.match!==f.match||g.section!==f.section||g.t!==f.t+i+1||!g.live||g.poss!==f.poss||[0,1].some(t=>g.p.filter(p=>p[1]===t).length!==11)))continue;
 for(const team of [0,1]){const sign=f.directions?.[team]??1,rx=(x:number)=>sign===1?x:105-x,ry=(y:number)=>sign===1?y:68-y;
 const bx=(rx(f.b[0])-52.5)/52.5,by=(ry(f.b[1])-34)/34;
 const vx=Math.max(-10,Math.min(10,(rx(f.b[0])-rx(hist[0].b[0]))/2))/10,vy=Math.max(-10,Math.min(10,(ry(f.b[1])-ry(hist[0].b[1]))/2))/10;
 const roster=f.p.filter(p=>p[1]===team);
 const fixedSide=(p:Frame['p'][number])=>f.lateral?.[p[0]]??(()=>{const a=averages.get(key(f,p[0]))!;return a[1]/a[0]<29?'left':a[1]/a[0]>39?'right':'centre';})();
 for(const fb of roster.filter(p=>baseRole(p[2])==='fb'))for(const wg of roster.filter(p=>baseRole(p[2])==='wg'))if(fixedSide(fb)===fixedSide(wg))flankSamples[f.poss===team?'attack':'defend'].push(Math.hypot(fb[3]-wg[3],fb[4]-wg[4]));

 const outfield=roster.filter(p=>p[2]!=='gk'),cx=outfield.reduce((s,p)=>s+rx(p[3]),0)/10,cy=outfield.reduce((s,p)=>s+ry(p[4]),0)/10;
 const oldfield=hist[0].p.filter(p=>p[1]===team&&p[2]!=='gk'),cvx=(cx-oldfield.reduce((s,p)=>s+rx(p[3]),0)/10)/2,cvy=(cy-oldfield.reduce((s,p)=>s+ry(p[4]),0)/10)/2;
 const x=[1,bx,by,bx*bx,by*by,bx*by,vx,vy,Math.exp(-age/3),...['cb','cm','st'].map(r=>f.poss===team?roster.filter(p=>r==='cm'?['dm','cm'].includes(p[2]):p[2]===r).length-(r==='st'?1:2):0),(cx-52.5)/52.5,(cy-34)/34,cvx/10,cvy/10];
 for(const p of f.p.filter(p=>p[1]===team&&p[2]!=='gk'&&p[2]!=='unknown')){const a=averages.get(key(f,p[0]))!,y=a[1]/a[0];const side=f.lateral?.[p[0]]??(y<29?'left':y>39?'right':'centre');const k=`${f.poss===team?'attack':'defend'}|${baseRole(p[2])}|${side}`;const target=f.poss!==team?frames[frameIndex+2]:['cb','fb','wb'].includes(p[2])?frames[frameIndex+3]:future;const q=target.p.find(q=>q[0]===p[0]);if(q){const row={x,y:[rx(q[3]),ry(q[4])],test:matches.indexOf(f.match)>=5};(rows[k]??=[]).push(row);
 if(f.poss===team&&['fb','wg'].includes(baseRole(p[2]))&&side!=='centre'){
  const flank=roster.filter(z=>['fb','wg'].includes(baseRole(z[2]))&&(f.lateral?.[z[0]]??(()=>{const a=averages.get(key(f,z[0]))!;return a[1]/a[0]<29?'left':a[1]/a[0]>39?'right':'centre';})())===side);
  if(flank.some(z=>baseRole(z[2])==='fb')&&flank.some(z=>baseRole(z[2])==='wg')){
   const direction=side==='left'?-1:1;const outer=flank.reduce((a,z)=>ry(a[4])*direction>ry(z[4])*direction?a:z);const holder=baseRole(outer[2]);
   (rows[k+'|'+holder]??=[]).push(row);
   if(baseRole(p[2])==='fb'){const a=widthShares[`${Math.min(2,Math.floor(rx(f.b[0])/35))}|${side}`]??=[0,0];a[holder==='fb'?0:1]++;}
  }
 }
 }}
 }
}
function solve(a:number[][],b:number[]){const m=a.map((r,i)=>[...r,b[i]]);for(let i=0;i<b.length;i++){let pivot=i;for(let j=i+1;j<b.length;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;[m[i],m[pivot]]=[m[pivot],m[i]];const d=m[i][i];for(let k=i;k<=b.length;k++)m[i][k]/=d;for(let j=0;j<b.length;j++)if(j!==i){const c=m[j][i];for(let k=i;k<=b.length;k++)m[j][k]-=c*m[i][k];}}return m.map(r=>r[b.length]);}
function fit(rs:typeof rows[string]){const a=Array.from({length:16},(_,i)=>Array.from({length:16},(_,j)=>i===j?(i?80:.01):0)),b=[Array(16).fill(0),Array(16).fill(0)];for(const r of rs)for(let i=0;i<16;i++){for(let j=0;j<16;j++)a[i][j]+=r.x[i]*r.x[j];for(let axis=0;axis<2;axis++)b[axis][i]+=r.x[i]*r.y[axis];}return b.map(v=>solve(a,v));}
const flankGap=Object.fromEntries(Object.entries(flankSamples).map(([k,a])=>{a.sort((a,b)=>a-b);return [k,{n:a.length,p25:a[Math.floor((a.length-1)*.25)],p50:a[Math.floor((a.length-1)*.5)]}];}));
const models:Record<string,number[][]>={},validation:Record<string,unknown>={};
for(const [k,rs] of Object.entries(rows)){const train=rs.filter(r=>!r.test),test=rs.filter(r=>r.test);if(train.length<50)continue;const c=fit(train);validation[k]={train:train.length,test:test.length,trainingVelocityScale:1,scaledFeatureRmse:test.length?[0,1].map(axis=>Math.sqrt(test.reduce((s,r)=>s+(r.y[axis]-r.x.reduce((s,v,i)=>s+v*c[axis][i],0))**2,0)/Math.max(1,test.length))):null,rmse:test.length?[0,1].map(axis=>Math.sqrt(test.reduce((s,r)=>s+(r.y[axis]-r.x.reduce((s,v,i)=>s+v*c[axis][i],0))**2,0)/Math.max(1,test.length))):null};models[k]=fit(rs).map(c=>c.map(v=>+v.toFixed(6)));}
writeFileSync('src/data/positioning.json',JSON.stringify({schema:1,targetHorizonSeconds:{attackBack:3,attackMidfield:4,attackFront:4,defend:2},velocityScale:1,source:JSON.parse(readFileSync(process.argv[2]+'.source.json','utf8')).source,features:['1','ballXCentered/52.5','ballYCentered/34','ballX²','ballY²','ballX*ballY','ballVelocityX2s/10','ballVelocityY2s/10','exp(-secondsSinceTurnover/3)','CBcount-2','CMcount-2','STcount-1','teamCentroidXCentered/52.5','teamCentroidYCentered/34','teamCentroidVelocityX2s/10','teamCentroidVelocityY2s/10'],ridge:80,flankGap,blockBounds,frontTail,defendDensity,pressureWidth,widthShares,models},null,2)+'\n');
writeFileSync('docs/validation/behaviour/positioning-fit.json',JSON.stringify({runtimeVelocityApproximation:'ball: training 2s displacement, runtime 1s EWMA; team centroid: training 2s displacement, runtime mean current player velocity; holdout validates the predictor, not the closed-loop controller',split:'first 5 matches train, last 2 holdout; shipped model refit on all 7; both halves scanned, 11v11 only; lateral identity from half-average position; dm/cm pooled; predict attack backs 3s, attack midfield/front 4s, defence 2s ahead during stable possession and uninterrupted play',validation},null,2)+'\n');
console.log(Object.keys(models).length,'role-side models');
