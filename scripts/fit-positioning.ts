/** Anonymous role/side ridge model, both halves. First five matches fit, last two evaluate. */
import {readFileSync,writeFileSync} from 'node:fs';
import type {Frame} from './behaviour';
const frames=readFileSync(process.argv[2],'utf8').trim().split('\n').map(s=>JSON.parse(s) as Frame);
const matches=[...new Set(frames.map(f=>f.match))];
const averages=new Map<string,number[]>();
const key=(f:Frame,id:number)=>`${f.match}|${f.section}|${id}`;
for(const f of frames)for(const p of f.p){const a=averages.get(key(f,p[0]))??[0,0];a[0]++;a[1]+=(f.directions?.[p[1]]??1)===1?p[4]:68-p[4];averages.set(key(f,p[0]),a);}
const baseRole=(r:string)=>r==='wb'?'fb':r==='dm'?'cm':r;
const rows:Record<string,{x:number[];y:number[];test:boolean}[]>={};
let hist:Frame[]=[],age=30;
let frameIndex=-1;
for(const f of frames){frameIndex++;const prev=hist.at(-1);if(!prev||prev.match!==f.match||prev.section!==f.section||f.t-prev.t!==1||!f.live||f.poss<0){hist=[];age=30;}else age=f.poss===prev.poss?age+1:0;
 if(!f.live||f.poss<0||[0,1].some(t=>f.p.filter(p=>p[1]===t).length!==11)){hist=[];continue;}hist.push(f);if(hist.length>3)hist.shift();if(hist.length<3)continue;
 const future=frames[frameIndex+4];
 if(!future||[frames[frameIndex+1],frames[frameIndex+2],frames[frameIndex+3],future].some((g,i)=>!g||g.match!==f.match||g.section!==f.section||g.t!==f.t+i+1||!g.live||g.poss!==f.poss||[0,1].some(t=>g.p.filter(p=>p[1]===t).length!==11)))continue;
 for(const team of [0,1]){const sign=f.directions?.[team]??1,rx=(x:number)=>sign===1?x:105-x,ry=(y:number)=>sign===1?y:68-y;
 const bx=(rx(f.b[0])-52.5)/52.5,by=(ry(f.b[1])-34)/34;
 const vx=Math.max(-10,Math.min(10,(rx(f.b[0])-rx(hist[0].b[0]))/2))/10,vy=Math.max(-10,Math.min(10,(ry(f.b[1])-ry(hist[0].b[1]))/2))/10;
 const x=[1,bx,by,bx*bx,by*by,bx*by,vx,vy,Math.exp(-age/3)];
 for(const p of f.p.filter(p=>p[1]===team&&p[2]!=='gk'&&p[2]!=='unknown')){const a=averages.get(key(f,p[0]))!,y=a[1]/a[0];const side=f.lateral?.[p[0]]??(y<29?'left':y>39?'right':'centre');const k=`${f.poss===team?'attack':'defend'}|${baseRole(p[2])}|${side}`;const target=['cb','fb','wb'].includes(p[2])?frames[frameIndex+3]:future;const q=target.p.find(q=>q[0]===p[0]);if(q)(rows[k]??=[]).push({x,y:[rx(q[3]),ry(q[4])],test:matches.indexOf(f.match)>=5});}
 }
}
function solve(a:number[][],b:number[]){const m=a.map((r,i)=>[...r,b[i]]);for(let i=0;i<b.length;i++){let pivot=i;for(let j=i+1;j<b.length;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;[m[i],m[pivot]]=[m[pivot],m[i]];const d=m[i][i];for(let k=i;k<=b.length;k++)m[i][k]/=d;for(let j=0;j<b.length;j++)if(j!==i){const c=m[j][i];for(let k=i;k<=b.length;k++)m[j][k]-=c*m[i][k];}}return m.map(r=>r[b.length]);}
function fit(rs:typeof rows[string]){const a=Array.from({length:9},(_,i)=>Array.from({length:9},(_,j)=>i===j?(i?80:.01):0)),b=[Array(9).fill(0),Array(9).fill(0)];for(const r of rs)for(let i=0;i<9;i++){for(let j=0;j<9;j++)a[i][j]+=r.x[i]*r.x[j];for(let axis=0;axis<2;axis++)b[axis][i]+=r.x[i]*r.y[axis];}return b.map(v=>solve(a,v));}
const models:Record<string,number[][]>={},validation:Record<string,unknown>={};
for(const [k,rs] of Object.entries(rows)){const train=rs.filter(r=>!r.test),test=rs.filter(r=>r.test);if(train.length<50)continue;const c=fit(train);validation[k]={train:train.length,test:test.length,trainingVelocityScale:1,scaledFeatureRmse:test.length?[0,1].map(axis=>Math.sqrt(test.reduce((s,r)=>s+(r.y[axis]-r.x.reduce((s,v,i)=>s+v*c[axis][i],0))**2,0)/Math.max(1,test.length))):null,rmse:test.length?[0,1].map(axis=>Math.sqrt(test.reduce((s,r)=>s+(r.y[axis]-r.x.reduce((s,v,i)=>s+v*c[axis][i],0))**2,0)/Math.max(1,test.length))):null};models[k]=fit(rs).map(c=>c.map(v=>+v.toFixed(6)));}
writeFileSync('src/data/positioning.json',JSON.stringify({schema:1,targetHorizonSeconds:{back:3,midfield:4,front:4},velocityScale:1,source:JSON.parse(readFileSync(process.argv[2]+'.source.json','utf8')).source,features:['1','ballXCentered/52.5','ballYCentered/34','ballX²','ballY²','ballX*ballY','ballVelocityX2s/10','ballVelocityY2s/10','exp(-secondsSinceTurnover/3)'],ridge:80,models},null,2)+'\n');
writeFileSync('docs/validation/behaviour/positioning-fit.json',JSON.stringify({runtimeVelocityApproximation:'training: 2s displacement velocity; runtime: 1s EWMA; holdout validates the regression, not the closed-loop controller',split:'first 5 matches train, last 2 holdout; shipped model refit on all 7; both halves scanned, 11v11 only; lateral identity from half-average position; dm/cm pooled; predict backs 3s and midfield/front 4s ahead during stable possession and uninterrupted play',validation},null,2)+'\n');
console.log(Object.keys(models).length,'role-side models');
