/** Compare complete match state and the remaining PRNG stream on repeated seeds. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tactic} from '../src/data/formations';
import {createMatch,runToEnd} from '../src/engine/match';
import type {FormationId,TeamSetup} from '../src/engine/types';

const seeds=process.argv.length>2?process.argv.slice(2).map(Number):[9001,12345,55555];
if(seeds.some(seed=>!Number.isSafeInteger(seed)))throw Error('Seeds must be integers');
const team=(name:string,formation:FormationId):TeamSetup=>({name,short:name,color:'#888',tactics:tactic({formation})});
function run(seed:number){
 const m=runToEnd(createMatch({seed,teams:[team('A','4-2-3-1'),team('B','4-4-2')]}));
 return createHash('sha256').update(JSON.stringify({score:m.score,stats:m.stats,players:m.players,ball:m.ball,shots:m.shots,events:m.events,tactics:m.tactics,rngTail:Array.from({length:8},()=>m.rand())})).digest('hex');
}
const tests=seeds.map(seed=>{const first=run(seed),second=run(seed);return{seed,first,second,pass:first===second};});
const hash=createHash('sha256');
for(const file of readdirSync('src/engine').filter(f=>f.endsWith('.ts')&&!f.includes('.test.')&&f!=='testUtils.ts').sort())hash.update(file).update(readFileSync(`src/engine/${file}`));
for(const file of ['src/data/formations.ts','src/data/tracking.json','src/data/behaviour-response.json','src/data/positioning.json'])hash.update(file).update(readFileSync(file));
const result={engineSha256:hash.digest('hex'),method:'Full players/ball/stats/shots/events/tactics plus 8 future PRNG draws; fresh initial config on each repeat',tests};
if(process.env.RESULT_JSON)writeFileSync(process.env.RESULT_JSON,JSON.stringify(result,null,2)+'\n');
console.table(tests.map(({seed,pass})=>({seed,pass})));
if(tests.some(t=>!t.pass))process.exitCode=1;
