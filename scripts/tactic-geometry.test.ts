import {describe,it,expect} from 'vitest';
import {matchedGeometry, type GeometryCell} from './tactic-geometry';
const cell=(n:number,line:number):GeometryCell=>({n,values:[0,0,0,0,line]});
describe('球位置を揃えた戦術差',()=>{
 it('球位置の露出が逆転して単純平均が逆になる場合も、実位置の差を測る',()=>{
  const high={'defend|2|3':cell(1000,30),'defend|9|3':cell(250,70)};
  const deep={'defend|2|3':cell(250,15),'defend|9|3':cell(1000,55)};
  expect((1000*30+250*70)/1250-(250*15+1000*55)/1250).toBeLessThan(0);
  const r=matchedGeometry(high,deep,'defend',4);expect(r.delta).toBe(15);expect(r.cells).toBe(2);expect(r.firstCoverage).toBe(.4);
 });
 it('比較できないセルを差ゼロの一致として隠さず被覆率へ記録する',()=>{
  const r=matchedGeometry({'defend|1|1':cell(100,30)},{'defend|2|1':cell(100,10)},'defend',4);
  expect(r.cells).toBe(0);expect(r.firstCoverage).toBe(0);expect(r.secondCoverage).toBe(0);
 });
});
