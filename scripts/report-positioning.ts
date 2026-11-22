/** Anonymous frame distributions and acceptance results; no raw tracking is written. */
import {readFileSync,writeFileSync} from 'node:fs';
import {compareCoordination} from './coordination';
import type {Measure} from './behaviour';
type Result=ReturnType<Measure['result']>&{baselineLabel?:string;engineSha256?:string;seedStart?:number;checks?:{pass:boolean}[];coordinationChecks?:{pass:boolean}[]};
const read=(p:string):Result=>JSON.parse(readFileSync(p,'utf8'));
const root='docs/validation/behaviour/';
const args=process.argv.slice(2);
const [real,before,...after]=args.slice(0,5).map(read);
if(!real||!before||after.length!==3)throw new Error('Usage: report-positioning.ts real.json before.json after.json seed12345.json seed55555.json');
if(new Set(after.map(r=>r.engineSha256)).size!==1)throw new Error('Final engine snapshots differ');
const results=[real,before,...after],fmt=(v:number|undefined)=>v===undefined?'—':v.toFixed(3);
const lines=['フレーム単位の位置取り検証','',
 `修正前は${before.baselineLabel??'50851ce'}。同じ計測器を使用。修正後はseed 9001 / 12345 / 55555開始。試合数・エンジンSHAは下表。1Hz・8秒連続インプレー・既知保持・安定名簿の窓。新指標は9〜11人/チーム、旧指標は11対11。GK除外、攻撃方向へ座標を正規化。平均のほかp10/p50/p90を保存する。`, '',
 '| 対象 | 試合数 | 旧 / 新指標の窓 | SHA256 |', '|---|---:|---:|---|',
 ...results.map((r,i)=>`| ${['実測','修正前','修正後','12345','55555'][i]} | ${r.matches} | ${r.moments} / ${r.coordinationSampling.moments} | ${r.engineSha256??'入力出典はsrc/data/behaviour.json'} |`), '',
 '分布の比較','',
 '各セルは平均 / p10 / p50 / p90。全体人数・組数はゼロのフレームも含む。役割別ahead/behind人数は当該役割が存在するフレームに条件付け、該当者ゼロも含む。roleNearは役割の選手1人あたりの比率。roleBall/roleCentroidはm。ahead/behindは球から25m超の人数。FB–WGは瞬間の同じサイドのペア。outermostは左右ごとに最外側の1人を数える。', '',
 '| 指標 | 実測 | 修正前 | 修正後 | 12345 | 55555 |', '|---|---:|---:|---:|---:|---:|'];
for(const k of Object.keys(real.metrics).sort()){
 lines.push(`| ${k} | ${results.map(r=>{const v=r.metrics[k];return v?[v.mean,v.p10,v.p50,v.p90].map(fmt).join(' / '):'—';}).join(' | ')} |`);
}
const comparisons=[before,...after].map(r=>compareCoordination(r.coordination,real.coordination));
lines.push('', '球の縦区画を揃えた20m人数', '',
 '| 対象 | 実人数 | 同じ球区画露出での実測参照 | 差 |', '|---|---:|---:|---:|');
for(const [i,r] of [before,...after].entries()){
 const weights=[0,1,2].map(j=>r.metrics[`near20zone${j}`].n),expected=weights.reduce((s,n,j)=>s+n*real.metrics[`near20zone${j}`].mean,0)/weights.reduce((s,n)=>s+n,0);
 lines.push(`| ${['修正前','修正後','12345','55555'][i]} | ${fmt(r.metrics.near20.mean)} | ${fmt(expected)} | ${fmt(r.metrics.near20.mean-expected)} |`);
}
lines.push('', '役割別の条件付き位置RMSE', '',
 '実測40標本以上、sim20標本以上の共通セル（局面×球の縦3区画×横3レーン×役割）を実測露出で重み付け。球相対 / チーム重心相対、単位m。実測自身の誤差は定義上0。位置の全分布の一致を意味しない。', '',
 '| 局面 / 役割 | 修正前 | 修正後 | 12345 | 55555 |','|---|---:|---:|---:|---:|');
for(const k of Object.keys(comparisons[0].roleErrors).sort())lines.push(`| ${k.replace('|',' / ')} | ${comparisons.map(c=>{const r=c.roleErrors[k];return r?`${fmt(r.ballRMSE)} / ${fmt(r.centroidRMSE)}`:'—';}).join(' | ')} |`);
lines.push('', '判定','', '| seed開始 | 行動・フレーム指標 | 連動・役割誤差 |', '|---|---:|---:|');
for(const r of after)lines.push(`| ${r.seedStart} | ${r.checks?.filter(c=>c.pass).length}/${r.checks?.length} | ${r.coordinationChecks?.filter(c=>c.pass).length}/${r.coordinationChecks?.length} |`);
lines.push('', '旧18判定・従来の連動判定の許容幅は維持。追加指標の幅はsrc/data/positioning-limits.json。幅p90と球相対人数は、実測とsimの戦術・布陣・球位置の露出差を含む工学的な許容幅であり、信頼区間ではない。特に球より25m後ろの人数と攻撃幅の上裾は、判定内でも実測との残差を確認する。', '',
 '出典：Bassek, Rein, Weber & Memmert (2025), DFL / IDSSE, CC BY 4.0。https://doi.org/10.6084/m9.figshare.28196177 / https://doi.org/10.1038/s41597-025-04505-y 。生XML・選手名・元の選手IDは収録しない。');
if(args[5]&&args[6]){
 type Audit={matches:number;measured:Record<string,number>;distanceBins:Record<string,{n:number;xg:number;conversion:number;meanDistance:number;headerShare:number}>;diagnostics?:Record<string,number>};
 const audits=args.slice(5,7).map(p=>JSON.parse(readFileSync(p,'utf8')) as Audit);
 lines.push('', 'シュートの再校正', '',
  '前後ともaudit.ts 36（3組×36=108試合）。beforeは停止弾の安全策を適用済み。目安は今回のユーザー指定・audit.tsの参考範囲であり、DFL位置トラッキングからシュート結果を推定したものではない。', '',
  '| 項目 | 修正前 | 修正後 |','|---|---:|---:|');
 for(const k of Object.keys(audits[0].measured))lines.push(`| ${k} | ${fmt(audits[0].measured[k])} | ${fmt(audits[1].measured[k])} |`);
 lines.push('', '距離別のxGと観測変換率', '',
  '同じ固定シード群での閉ループ校正結果。nは試投数。観測変換率は有限標本のためxGと一致しない。別の未知試合での検証値ではない。', '',
  '| 距離 m | n | 平均距離 m | 平均xG | 観測得点率 | ヘディング比率 |','|---|---:|---:|---:|---:|---:|');
 for(const k of ['0–8','8–12','12–16.5','16.5–20','20–25','25+']){
  const b=audits[1].distanceBins[k];if(b)lines.push(`| ${k} | ${b.n} | ${fmt(b.meanDistance)} | ${fmt(b.xg)} | ${fmt(b.conversion)} | ${fmt(b.headerShare)} |`);
 }
 lines.push('',`停止診断：${JSON.stringify(audits[1].diagnostics)}。完全停止はインプレー中の全22人と球の座標が同じtickを連続計測。未解決時間は同じshotオブジェクトが残った時間。`);
}
writeFileSync(root+'metrics.md',lines.join('\n')+'\n');
writeFileSync(root+'positioning-report.json',JSON.stringify({comparisons,engineSha256:after[0].engineSha256,seedStarts:after.map(r=>r.seedStart)},null,2)+'\n');
