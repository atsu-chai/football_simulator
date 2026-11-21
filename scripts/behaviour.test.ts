import { describe, expect, it } from 'vitest';
import { Measure, type Frame } from './behaviour';

function sequence(mirror = false): Frame[] {
  return Array.from({length:20},(_,t)=>({
    match:'fixture',section:'firstHalf',t,live:true,poss:1,
    b:mirror?[105-(40-t),34]:[40-t,34],
    p:Array.from({length:22},(_,i)=>{
      const team=i<11?0:1,slot=i%11,role=slot===0?'gk':slot<5?'cb':'cm';
      const x=slot===0?(team===0?5:100):team===0?20+slot-1.5*t:60+slot-1.5*t;
      return [i,team,role,mirror?105-x:x,34+slot%3*5] as Frame['p'][number];
    }),
  }));
}
describe('連続した行動の共通計測',()=>{
  it('8秒窓で変位を測り、180度反転でも結果が変わらない',()=>{
    const a=new Measure(),b=new Measure();sequence().forEach(f=>a.feed(f));sequence(true).forEach(f=>b.feed(f));
    const r=a.result();expect(r.moments).toBe(12);expect(r.metrics.displacement8.p50).toBe(12);
    expect(r.metrics.alignment.mean).toBe(1);expect(b.result().metrics).toEqual(r.metrics);
  });
  it.each([[3, '2to4'], [5, '4to6'], [7, '6plus']] as const)('球の接近%sm/sを層別し、各ラインの戻り速度をm/sで測る', (speed, band) => {
    const m = new Measure();
    sequence().forEach(f => { f.b = [100 - speed * f.t, 34]; m.feed(f); });
    const r = m.result().metrics;
    for (const line of [0, 1, 2]) expect(r[`drop${line}_${band}`].p50).toBe(1.5);
    expect(r[`ballApproach_${band}`].mean).toBe(speed);
  });
  it('停止・欠損フレーム・ハーフを跨ぐ軌跡を混ぜない',()=>{
    const a=new Measure();const fs=sequence();fs[7].live=false;fs.forEach(f=>a.feed(f));expect(a.result().moments).toBe(4);
    const b=new Measure();sequence().filter(f=>f.t!==7).forEach(f=>b.feed(f));expect(b.result().moments).toBe(4);
    const c=new Measure();sequence().forEach(f=>c.feed({...f,section:f.t<10?'firstHalf':'secondHalf'}));expect(c.result().moments).toBe(4);
  });
  it('交代選手のIDを前任者の軌跡に結合しない',()=>{
    const m=new Measure();sequence().forEach(f=>{if(f.t>=10)f.p[1][0]=100;m.feed(f);});
    expect(m.result().moments).toBe(4);
  });
});
