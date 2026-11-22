// ブラウザーが使えない環境でも、450フレーム・全座標・Canvas呼出しを検査する。
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(process.argv[2] ?? 'docs/validation/behaviour/compare.html', 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
let draws = 0;
const ctx = new Proxy({}, { get: (_target, key) => key === 'fillText' ? () => draws++ : () => {}, set: () => true });
const elements = new Map();
const sandbox = {
  document: { getElementById: (id) => {
    if (!elements.has(id)) elements.set(id, { value: id === 'speed' ? '1' : '', getContext: () => ctx });
    return elements.get(id);
  } },
  performance: { now: () => 0 }, requestAnimationFrame: () => {},
};
vm.createContext(sandbox);
vm.runInContext(js, sandbox);
const validation = vm.runInContext(`(() => {
  if (R.frames.length !== 450 || S.frames.length !== 450 || R.meta.length !== 22 || S.meta.length !== 22) throw Error('clip dimensions');
  for (const clip of [R, S]) for (const f of clip.frames) {
    if (!f.b || f.p.length !== 22 || [...f.b, ...f.p.flat()].some(x => !Number.isFinite(x))) throw Error('missing positions');
  }
  for (const clip of [R, S]) {
    const keeper = clip.meta.findIndex(p => p.team === 1 && p.role === 'gk');
    if (keeper < 0 || clip.frames.reduce((sum, f) => sum + f.p[keeper][0], 0) / clip.frames.length > 52.5) throw Error('attack direction');
  }
  let simLongestIdenticalLiveFrames=1, run=1, simIdenticalLivePairs=0;
  for(let i=1;i<S.frames.length;i++){
    const a=S.frames[i-1],b=S.frames[i];
    const identical=a.live&&b.live&&JSON.stringify([a.b,a.p])===JSON.stringify([b.b,b.p]);
    run=identical?run+1:1;
    if(identical)simIdenticalLivePairs++;
    simLongestIdenticalLiveFrames=Math.max(simLongestIdenticalLiveFrames,run);
  }
  if(simIdenticalLivePairs)throw Error('frozen live simulation: '+simLongestIdenticalLiveFrames+' identical frames');
  for (const t of [0, 8, 30, 60, 89.8]) seek(t);
  return { realFrames: R.frames.length, simFrames: S.frames.length, realPlayers: R.meta.length, simPlayers: S.meta.length, simLongestIdenticalLiveFrames, simIdenticalLivePairs, sampledTimes: [0, 8, 30, 60, 89.8] };
})()`, sandbox);
writeFileSync('docs/validation/behaviour/page-check.json', JSON.stringify({ ...validation, drawnLabels: draws, note: 'Canvas calls executed with a mock context; browser visual inspection unavailable.' }, null, 2) + '\n');
console.log(validation);
