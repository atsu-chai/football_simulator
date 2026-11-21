/** 実測の各ラインの次の1秒速度を回帰。先頭5試合で学習、末尾2試合で外部検証。 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { learnedShape } from '../src/engine/tracking';
import type { Frame } from './behaviour';
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const datasets:Record<string,{x:number[];y:number;test:boolean}[]>={};
const roleCells:Record<string,number[]>={};
let hist:Frame[]=[];const matches=new Set<string>();
for await(const line of createInterface({input:createReadStream(process.argv[2]),crlfDelay:Infinity})) {
 const f:Frame=JSON.parse(line),prev=hist.at(-1);
 if(!prev||prev.match!==f.match||prev.section!==f.section||f.t-prev.t!==1||!f.live||f.poss<0)hist=[];
 if(!f.live||f.poss<0||[0,1].some(t=>f.p.filter(p=>p[1]===t).length!==11)) {hist=[];continue;}
 hist.push(f);if(hist.length>4)hist.shift();if(hist.length<4||hist.some(g=>g.poss!==f.poss))continue;
 matches.add(f.match);
 for(const team of [0,1]) {
  const keeper=f.p.find(p=>p[1]===team&&p[2]==='gk');if(!keeper)continue;
  const sign=f.directions?.[team] ?? (keeper[3]<52.5?1:-1),rx=(x:number)=>sign===1?x:105-x;
  const lines=hist.map(g=>g.p.filter(p=>p[1]===team&&p[2]!=='gk').map(p=>rx(p[3])).sort((a,b)=>a-b));
  if(lines.some(xs=>xs.length!==10))continue;
  const current=hist[2],bx=rx(current.b[0]);
  const phase=f.poss===team?'attack':'defend';
  const xs=lines[2];
  for(const p of current.p.filter(p=>p[1]===team&&p[2]!=='gk')) {
    const key=`${phase}|${Math.max(0,Math.min(5,Math.floor(bx/105*6)))}|${p[2]}`;
    const c=roleCells[key]??=[0,0];c[0]++;c[1]+=(rx(p[3])-xs[0])/Math.max(1,xs[9]-xs[0]);
  }
  const base=learnedShape('4-4-2',phase,bx,sign===1?current.b[1]:68-current.b[1]);
  [[0,4],[4,7],[7,10]].forEach(([a,b],i)=>{
   const l=lines.map(xs=>mean(xs.slice(a,b)));
   const x=[1,base[5+i]-l[2],Math.max(-12,Math.min(12,(rx(current.b[0])-rx(hist[0].b[0]))/2)),l[2]-l[1]];
   (datasets[`${phase}${i}`]??=[]).push({x,y:l[3]-l[2],test:matches.size>5});
  });
 }
}
function solve(a:number[][],b:number[]) {
 const mat=a.map((r,i)=>[...r,b[i]]);
 for(let i=0;i<b.length;i++) {
  let pivot=i;for(let j=i+1;j<b.length;j++)if(Math.abs(mat[j][i])>Math.abs(mat[pivot][i]))pivot=j;
  [mat[i],mat[pivot]]=[mat[pivot],mat[i]];
  const d=mat[i][i];for(let k=i;k<=b.length;k++)mat[i][k]/=d;
  for(let j=0;j<b.length;j++)if(j!==i){const c=mat[j][i];for(let k=i;k<=b.length;k++)mat[j][k]-=c*mat[i][k];}
 } return mat.map(r=>r[b.length]);
}
const result=Object.fromEntries(Object.entries(datasets).map(([k,rows])=>{
 const a=Array.from({length:4},()=>Array(4).fill(0)),b=Array(4).fill(0);
 for(const r of rows.filter(r=>!r.test))for(let i=0;i<4;i++){b[i]+=r.x[i]*r.y;for(let j=0;j<4;j++)a[i][j]+=r.x[i]*r.x[j];}
 const coefficients=solve(a,b),test=rows.filter(r=>r.test);
 const rmse=Math.sqrt(mean(test.map(r=>(r.y-r.x.reduce((s,x,i)=>s+x*coefficients[i],0))**2)));
 return[k,{n:rows.length,testN:test.length,coefficients,rmse,persistenceRmse:Math.sqrt(mean(test.map(r=>(r.y-r.x[3])**2)))}];
}));
writeFileSync('docs/validation/behaviour/response-fit.json',JSON.stringify({features:['intercept','shapeError','ballVelocity2s','previousLineVelocity1s'],split:'sorted input files: first 5 train, last 2 holdout',result},null,2)+'\n');console.log(result);

writeFileSync('src/data/behaviour-response.json',JSON.stringify({source:JSON.parse(readFileSync(process.argv[2]+'.source.json','utf8')).source,split:'first 5 matches train, last 2 holdout; role profiles use all 7 matches',ballSpeedLimit:Math.round(JSON.parse(readFileSync('src/data/behaviour.json','utf8')).metrics.ballDisplacement1.p90*10)/10,features:['intercept','shapeError','ballVelocity2s','previousLineVelocity1s'],response:result,roleCells:Object.fromEntries(Object.entries(roleCells).map(([k,[n,s]])=>[k,[n,s/n]]))},null,2)+'\n');
