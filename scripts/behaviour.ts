/** 1Hz・両ハーフ・連続インプレーの同一定義で行動を比較する。
 * real: --real /tmp/behaviour-real.jsonl --write-reference
 * sim: [試合数=24] [--check]。RESULT_JSONで結果を保存。
 * 一瞬の最近傍/方向/変位の分布を測り、平均的な形だけでは合格しない。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { tactic } from '../src/data/formations';
import { createMatch, resume, step } from '../src/engine/match';
import coordinationLimits from '../src/data/coordination-limits.json';
import positioningLimits from '../src/data/positioning-limits.json';
import { Coordination, compareCoordination } from './coordination';
import { learnedShape } from '../src/engine/tracking';

type P = [number, number, string, number, number]; // 匿名ID,team,role,x,y
export type Frame = { match: string; section: string; t: number; b: number[]; live: boolean; poss: number; directions?: number[]; lateral?: Record<number,string>; p: P[] };
const mean = (a: number[]) => a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const quant = (a: number[], q: number) => a[Math.min(a.length-1, Math.floor((a.length-1)*q))] ?? 0;
const forward = (r: string) => ['st','wg','iw','f9'].includes(r);
const distance = (p: number[],q: number[]) => Math.hypot(p[0]-q[0],p[1]-q[1]);
const round = (x: number) => +x.toFixed(4);
export class Measure {
  coordination = new Coordination();
  coordinationHistory: Frame[] = [];
  coordinationSections = new Set<string>();
  coordinationMoments = 0;
  reducedStrengthMoments = 0;
  feedCoordination(f: Frame) {
    const prev=this.coordinationHistory.at(-1);
    if(!prev||prev.match!==f.match||prev.section!==f.section||f.t-prev.t!==1)this.coordinationHistory=[];
    if(!f.live||f.poss<0||f.b[0]<0||f.b[0]>105||f.b[1]<0||f.b[1]>68||f.p.some(p=>p[2]==='unknown')||[0,1].some(t=>{const ps=f.p.filter(p=>p[1]===t);return ps.length<9||ps.length>11||!ps.some(p=>p[2]==='gk');})){this.coordinationHistory=[];return;}
    const h=this.coordinationHistory;h.push(f);if(h.length>9)h.shift();
    if(h.length<9||h.some(g=>g.p.length!==f.p.length||f.p.some(p=>!g.p.some(q=>q[0]===p[0]))))return;
    this.coordinationMoments++;if(f.p.length<22)this.reducedStrengthMoments++;
    this.coordinationSections.add(`${f.match}|${f.section}`);
    for(const team of [0,1]){
      const keeper=f.p.find(p=>p[1]===team&&p[2]==='gk')!;
      this.coordination.feed(h,team,f.directions?.[team]??(keeper[3]<52.5?1:-1),(k,v)=>this.add(k,v));
    }
  }
  values: Record<string, number[]> = {};
  history: Frame[] = [];
  matches = new Set<string>();
  moments = 0;
  sections = new Set<string>();
  currentMatch = '';
  matchSums: Record<string, Record<string, [number, number]>> = {};
  add(k: string,v: number) {
    (this.values[k] ??= []).push(v);
    const sums = this.matchSums[this.currentMatch] ??= {}, a = sums[k] ??= [0, 0]; a[0]++; a[1] += v;
  }
  feed(f: Frame) {
    this.currentMatch = f.match;
    this.feedCoordination(f);
    const prev = this.history.at(-1);
    if (!prev || prev.match !== f.match || prev.section !== f.section || f.t-prev.t !== 1 || !f.live || f.poss < 0 || f.p.length !== 22 || f.p.some(p=>p[2]==='unknown')) this.history=[];
    if (!f.live || f.poss < 0 || [0,1].some(t=>f.p.filter(p=>p[1]===t).length!==11) || f.b[0]<0 || f.b[0]>105 || f.b[1]<0 || f.b[1]>68) { this.history=[]; return; }
    this.history.push(f); if (this.history.length>9) this.history.shift();
    if (this.history.length<9) return;
    const h=this.history, old=h[0], last=h[7], four=h[4];
    if (f.p.some(p=>!h.every(g=>g.p.some(q=>q[0]===p[0])))) return;
    this.matches.add(f.match); this.sections.add(`${f.match}|${f.section}`); this.moments++;
    for (const team of [0,1]) {
      const ps=f.p.filter(p=>p[1]===team && p[2]!=='gk');
      const opp=f.p.filter(p=>p[1]!==team && p[2]!=='gk');
      if (ps.length!==10 || opp.length!==10) continue;
      const keeper=f.p.find(p=>p[1]===team && p[2]==='gk'); if (!keeper) continue;
      const sign=f.directions?.[team] ?? (keeper[3]<52.5?1:-1), rx=(x:number)=>sign===1?x:105-x;
      const bx=rx(f.b[0]), defending=f.poss!==team;
      const position=(g:Frame,p:P)=> {const q=g.p.find(q=>q[0]===p[0])!;return [q[3],q[4]];};
      const center=(g:Frame)=>[mean(ps.map(p=>position(g,p)[0])),mean(ps.map(p=>position(g,p)[1]))];
      const c=center(f),c0=center(old);
      this.add('blockSweep8',distance(c,c0));
      const velocities:number[][]=[];
      for(const p of ps) {
        const at=[p[3],p[4]], before=position(old,p), v0=position(last,p), v=[at[0]-v0[0],at[1]-v0[1]];
        this.add('displacement8',distance(at,before));
        this.add('relativeDisplacement8',Math.hypot((at[0]-c[0])-(before[0]-c0[0]),(at[1]-c[1])-(before[1]-c0[1])));
        if(Math.hypot(...v)>1) velocities.push(v);
        if(defending) { const nearest=Math.min(...opp.map(q=>distance(at,[q[3],q[4]])));this.add('nearestOpponent',nearest);this.add(`nearest_${p[2]}`,nearest); }
      }
      // 平行移動の強さ: >1m/s の全ペアのcos。負値も捨てない。
      for(let i=0;i<velocities.length;i++) for(let j=i+1;j<velocities.length;j++) {
        const a=velocities[i],b=velocities[j];this.add('alignment',(a[0]*b[0]+a[1]*b[1])/Math.hypot(...a)/Math.hypot(...b));
      }
      if(defending) {
        this.add('defendBallX',bx);
        this.add(`near20zone${Math.min(2,Math.floor(bx/35))}`,ps.filter(p=>distance([p[3],p[4]],f.b)<20).length);
        const xs=ps.map(p=>rx(p[3])).sort((a,b)=>a-b);
        this.add('depthSpread',Math.sqrt(mean(xs.map(x=>(x-mean(xs))**2))));
        this.add('near10',ps.filter(p=>distance([p[3],p[4]],f.b)<10).length);
        this.add('near20',ps.filter(p=>distance([p[3],p[4]],f.b)<20).length);
        if(bx<=40) {
          this.add('stranded',ps.filter(p=>!forward(p[2]) && rx(p[3])>bx+5).length);
          this.add(h.slice(5).every(g=>g.poss===f.poss)?'strandedSettled':'strandedTransition',ps.filter(p=>!forward(p[2]) && rx(p[3])>bx+5).length);
          for(const r of ['cb','fb','wb','dm','cm','am']) this.add(`stranded_${r}`,ps.filter(p=>p[2]===r && rx(p[3])>bx+5).length);
          this.add('deepDepthSpread',Math.sqrt(mean(xs.map(x=>(x-mean(xs))**2))));
        }
        // 4秒間同じ相手保持。球の前進速度で層別し、順序統計のラインの戻り速度を比較。
        if(h.slice(4).every(g=>g.poss===f.poss)) {
          const bv=(rx(f.b[0])-rx(four.b[0]))/4;
          const before=ps.map(p=>rx(position(four,p)[0])).sort((a,b)=>a-b);
          const base=learnedShape('4-4-2','defend',bx, sign===1?f.b[1]:68-f.b[1]);
          if(bv < -2 && bx>=15 && bx<=80) {
            const groups=[[0,4],[4,7],[7,10]];
            const band = -bv < 4 ? '2to4' : -bv < 6 ? '4to6' : '6plus';
            groups.forEach(([a,b],i)=>{
              const speed=(mean(before.slice(a,b))-mean(xs.slice(a,b)))/4;
              this.add(`drop${i}`,speed); this.add(`drop${i}_${band}`,speed);
              this.add(`lag${i}`,mean(xs.slice(a,b))-base[5+i]);
            });
            this.add(`ballApproach_${band}`,-bv);
            this.add('ballApproach',-bv);
          }
          this.add('backLineError',mean(xs.slice(0,4))-base[5]);
        }
      }
    }
    this.add('ballDisplacement1',distance(f.b,last.b));
    const v=[f.b[0]-last.b[0],f.b[1]-last.b[1]], prior=h[6];
    const w=[last.b[0]-prior.b[0],last.b[1]-prior.b[1]];
    if(Math.hypot(...v)>2 && Math.hypot(...w)>2) this.add('ballReversal', +(v[0]*w[0]+v[1]*w[1]<0));
  }
  result() {
    return { coordinationSampling:{sections:this.coordinationSections.size,moments:this.coordinationMoments,reducedStrengthMoments:this.reducedStrengthMoments},coordination:this.coordination.result(), matches:this.matches.size, sections:this.sections.size, moments:this.moments, metrics:Object.fromEntries(Object.entries(this.values).map(([k,v])=>{v.sort((a,b)=>a-b);return [k,{n:v.length,mean:round(mean(v)),p10:round(quant(v,.1)),p50:round(quant(v,.5)),p90:round(quant(v,.9)),p99:round(quant(v,.99)), matchMean95: (()=>{
      const ms=Object.values(this.matchSums).flatMap(s=>s[k]?[s[k][1]/s[k][0]]:[]), mu=mean(ms);
      const se=Math.sqrt(mean(ms.map(x=>(x-mu)**2))/Math.max(1,ms.length-1));
      return [round(mu-2.45*se),round(mu+2.45*se)];
    })()}];})) };
  }
}
async function main() {
const args=process.argv.slice(2), realIndex=args.indexOf('--real'), summaryIndex=args.indexOf('--summary'), m=new Measure();
const saved=summaryIndex>=0?JSON.parse(readFileSync(args[summaryIndex+1],'utf8')) as ReturnType<Measure['result']>&{seedStart:number;engineSha256:string}:undefined;
// 実行開始時のコードを記録する（長い検証中にファイルが変わっても後の版と混同しない）。
const engineHash=createHash('sha256');
const engineFiles=readdirSync('src/engine').filter(f=>f.endsWith('.ts')&&!f.includes('.test.')&&f!=='testUtils.ts').sort();
for(const file of engineFiles) engineHash.update(file).update(readFileSync(`src/engine/${file}`));
for(const file of ['src/data/formations.ts','src/data/tracking.json','src/data/behaviour-response.json','src/data/positioning.json']) engineHash.update(file).update(readFileSync(file));
const engineSha256=engineHash.digest('hex');
if(realIndex>=0) {
  for await (const line of createInterface({input:createReadStream(args[realIndex+1]),crlfDelay:Infinity})) { const f:Frame=JSON.parse(line); if(args.includes('--equal-strength')&&[0,1].some(t=>f.p.filter(p=>p[1]===t).length!==11))continue; m.feed(f); }
} else if(!saved) {
  const n=Number(args.find(x=>/^\d+$/.test(x))??24);
  for(let seed=0;seed<n;seed++) {
    const match=createMatch({seed:Number(process.env.SEED_START ?? 9001)+seed,teams:[{name:'A',short:'A',color:'#36c',tactics:tactic({formation:'4-2-3-1'})},{name:'B',short:'B',color:'#c33',tactics:tactic({formation:'4-4-2'})}]});
    let tick=0,half=1;
    while(!match.finished) {
      if(match.atHalftime){resume(match); half++;m.history=[];}
      if(tick%10===0) m.feed({match:`sim-${seed}`,section:`${half}`,t:tick/10,b:[match.ball.pos.x,match.ball.pos.y],live:!match.dead,poss:match.possession,p:match.players.map(p=>[p.id,p.team,p.role,p.pos.x,p.pos.y])});
      step(match);tick++;
    }
  }
}
const reference=JSON.parse(readFileSync('src/data/behaviour.json','utf8'));
const observations=saved??m.result();
const comparison=realIndex<0?compareCoordination(observations.coordination,reference.coordination):undefined;
const result={...observations,comparison,seedStart:realIndex>=0?undefined:saved?.seedStart??Number(process.env.SEED_START??9001),engineSha256:realIndex>=0?undefined:saved?.engineSha256??engineSha256};
if(args.includes('--write-reference')) {
  const source=JSON.parse(readFileSync(args[realIndex+1]+'.source.json','utf8'));
  writeFileSync('src/data/behaviour.json',JSON.stringify({schema:2,hz:1,window:8,coordinationMethod:'All 7 matches and 14 halves; stable anonymous roster and known possession over uninterrupted 8s; 9–11 players per team including GK; reduced-strength moments explicitly counted. Role units CB/FB/WB, DM/CM, AM/WG/ST; these are role groups, not inferred tactical lines. x/y attack-normalized; conditional cells phase x thirds x lanes, role WB=FB and DM=CM. Velocity Pearson pairs symmetrized. Correlation and cell coverage checked separately. See coordination-limits.json for engineering tolerances.',method:'11v11; both halves; uninterrupted in-play and known possession over entire 8s; stable anonymous roster; GK excluded; coordinates x=52.5+rawX, y=34+rawY (same as tracking.json); attack direction normalized by half-average GK position; each second, overlapping windows; drop=ranked 4/3/3 line velocity over 4s at ball approach >2m/s, same possession, ball 15–80m. No causal lag inference. matchMean95 is a conservative match-cluster mean +/-2.45SE, not independent-window uncertainty.',...source,...result},null,2)+'\n');
}
if(process.env.RESULT_JSON) writeFileSync(process.env.RESULT_JSON,JSON.stringify(result,null,2)+'\n');
console.log(`${result.matches} matches / ${result.moments} uninterrupted 8s moments`);
if(comparison) console.log('Coordination errors',comparison);
console.table(Object.entries(result.metrics).map(([metric,v])=>({metric,n:v.n,mean:v.mean,p10:v.p10,p50:v.p50,p90:v.p90,p99:v.p99})));
if(args.includes('--check')) {
 const ref=JSON.parse(readFileSync('src/data/behaviour.json','utf8')).metrics as typeof result.metrics;
 // 許容差は先に固定。分布の中央値・裾・帰陣・接近を別々に検査する。
 const limits: [string,'mean'|'p10'|'p50'|'p90',number][]=[['stranded','mean',.55],['displacement8','p50',2.5],['displacement8','p90',4],['alignment','mean',.12],['nearestOpponent','p50',1.5],['depthSpread','p50',2],['near10','mean',.6],['near20','mean',1.2],['drop0','mean',.7],['drop1','mean',.7],['drop2','mean',.7],['blockSweep8','p90',4],['ballReversal','mean',.12],['stranded','p90',2],['nearestOpponent','p90',2],['depthSpread','p10',2],['depthSpread','p90',3],['relativeDisplacement8','p50',2]];
 if(result.moments<5000 || result.matches<12) throw new Error('行動判定には12試合・5000窓以上が必要です');
 limits.push(...positioningLimits.metrics as [string,'mean'|'p10'|'p50'|'p90',number][]);
 limits.push(...coordinationLimits.metrics as [string,'mean'|'p10'|'p50'|'p90',number][]);
 const checks=limits.map(([k,s,t])=>({metric:`${k}.${s}`,real:ref[k][s],sim:result.metrics[k][s],tolerance:t,pass:Math.abs(ref[k][s]-result.metrics[k][s])<=t}));
 const zoneExposure=[0,1,2].map(i=>result.metrics[`near20zone${i}`].n);
 const expectedNear20=zoneExposure.reduce((s,n,i)=>s+n*ref[`near20zone${i}`].mean,0)/zoneExposure.reduce((s,n)=>s+n,0);
 const densityBias=result.metrics.near20.mean-expectedNear20;
 checks.push({metric:'near20BallZoneBias.mean',real:0,sim:densityBias,tolerance:.5,pass:Math.abs(densityBias)<=.5});
 console.table(checks);
 const coordinationChecks = comparison ? [
 ...Object.entries(positioningLimits.attackRoleBallRMSE).flatMap(([role,t])=>{const e=comparison.roleErrors[`attack|${role}`];return [{metric:`attack_${role}_ballRMSE`,sim:e?.ballRMSE,tolerance:t,pass:!!e&&e.ballRMSE<=t},{metric:`attack_${role}_centroidRMSE`,sim:e?.centroidRMSE,tolerance:positioningLimits.attackRoleCentroidRMSE,pass:!!e&&e.centroidRMSE<=positioningLimits.attackRoleCentroidRMSE}];}),
 ...Object.entries(coordinationLimits.errors).map(([k,t])=>({metric:k,sim:comparison[k as keyof typeof coordinationLimits.errors],tolerance:t,pass:comparison[k as keyof typeof coordinationLimits.errors]<=t})),
 ...Object.entries(coordinationLimits.correlationRMSE).map(([k,t])=>({metric:`${k}CorrelationRMSE`,sim:comparison.correlationRMSE[k],tolerance:t,pass:comparison.correlationRMSE[k]<=t})),
 ...Object.entries(comparison.correlationCoverage).map(([k,v])=>({metric:`${k}CorrelationCoverage`,sim:v,tolerance:coordinationLimits.minimumCoverage,pass:v>=coordinationLimits.minimumCoverage})),
 {metric:'coverage',sim:comparison.coverage,tolerance:coordinationLimits.minimumCoverage,pass:comparison.coverage>=coordinationLimits.minimumCoverage}
 ] : [];
 console.table(coordinationChecks);
 if(process.env.RESULT_JSON)writeFileSync(process.env.RESULT_JSON,JSON.stringify({...result,checks,coordinationChecks},null,2)+'\n');
 if(checks.some(c=>!c.pass)||coordinationChecks.some(c=>!c.pass))process.exitCode=1;
}

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
