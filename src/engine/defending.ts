import { clamp, dist, relX, toAbs, toRel } from './geometry';
import { nearestOpp } from './onBall';
import { interceptPoint } from './offBall';
import { shapeTarget } from './teamShape';
import { MatchState, PITCH_W, Player, Side, TICK, Vec } from './types';

const PRESS_LIMIT = { low: 40, mid: 66, high: 106 };
const PRESS_COUNT = { low: 1, normal: 1, high: 3 };

/** 守備チーム全体の判断を1ティック分行う。 */
export function teamDefense(m: MatchState, side: Side) {
  const t = m.tactics[side];
  const ball = toRel(side, m.ball.pos);
  const opp = (1 - side) as Side;
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  const since = m.t - m.turnoverAt;
  const team = m.players.filter((p) => p.team === side);

  // ボール保持者がフリーで前を向いていれば、最終ラインは下がる。
  // 背後へのボールを出せる距離(最終ラインから40m以内)にいるフリーの保持者に対してだけ、少し下がる
  const free = carrier ? nearestOpp(m, opp, carrier.pos) > 4.5 : false;
  const inRange = carrier ? toRel(side, carrier.pos).x - m.frames[side].line < 40 : false;
  const danger = free && inRange ? 3 : -4;
  m.lineDrop[side] = clamp(m.lineDrop[side] + danger * TICK, 0, t.lineHeight === 'high' ? 3 : 4);

  // プレスする人数
  let pressers = 0;
  // 体力が落ちるとプレスの人数を維持できず、高い位置でも奪いに行けなくなる
  const energy = m.energy[side];
  const reach = energy < 0.3 ? Math.min(PRESS_LIMIT[t.pressHeight], PRESS_LIMIT.mid) : PRESS_LIMIT[t.pressHeight];
  if (ball.x < reach) pressers = Math.max(1, PRESS_COUNT[t.pressIntensity] - (energy < 0.45 ? 1 : 0) - (energy < 0.2 ? 1 : 0));
  // ゴール前では引いたチームでも、シュートコースを消しに寄せる
  if (ball.x < 32) pressers = Math.max(pressers, 1);
  const transition = since < 3;
  if (transition && t.onLoss === 'counterpress') pressers = 3;
  else if (transition && t.onLoss === 'regroup' && ball.x > 38) pressers = Math.min(pressers, 1);
  if (m.ball.owner < 0 && !m.ball.pass) pressers = Math.max(pressers, 1);

  const ranked = team
    .filter((p) => p.role !== 'gk')
    .map((p) => ({ p, d: dist(p.pos, m.ball.pos) }))
    .sort((a, b) => a.d - b.d);
  const pressSet = new Set<number>();
  for (let i = 0; i < ranked.length && pressSet.size < pressers; i++) {
    const limit = transition && t.onLoss === 'counterpress' ? 22 : 24;
    const p = ranked[i].p;
    const back = p.role === 'cb' || p.role === 'fb' || p.role === 'wb';
    // 背後へ運ばれた最終ラインは横から追い続けず、内側へ戻ってカバーを作る。
    if (back && toRel(side, p.pos).x > ball.x + 2 && ranked[i].d > 6) continue;
    if (ranked[i].d < limit || i === 0) pressSet.add(p.id);
  }

  // ゾーン内の担当を重複させない。同じ相手へ中盤が何人も吸い寄せられないようにする。
  const zoneMarks = new Map<number, Player>();
  if (t.marking === 'zone') {
    const candidates: { p: Player; o: Player; d: number }[] = [];
    for (const p of team) if (p.role !== 'gk' && !pressSet.has(p.id) && (!transition || ['cb','fb','wb'].includes(p.role))) {
      const base = shapeTarget(m, p);
      for (const o of m.players) if (o.team !== side && o.role !== 'gk' && o.id !== carrier?.id) {
        const d = dist(base, o.pos);
        if (d < (['cb','fb','wb'].includes(p.role) ? 24 : 18)) candidates.push({ p, o, d: d * 0.55 + dist(p.pos, o.pos) * 0.45 - (p.markTarget === o.id ? 2 : 0) });
      }
    }
    candidates.sort((a, b) => Number(!['cb','fb','wb'].includes(a.p.role)) - Number(!['cb','fb','wb'].includes(b.p.role)) || a.d - b.d);
    const used = new Set<number>();
    for (const { p, o } of candidates) if (!zoneMarks.has(p.id) && !used.has(o.id)) {
      zoneMarks.set(p.id, o); used.add(o.id);
    }
  }
  for (const p of team) {
    if (t.marking === 'zone' && !transition) p.markTarget = zoneMarks.get(p.id)?.id ?? -1;
    if (p.role === 'gk') {
      goalkeeper(m, p);
      continue;
    }
    p.runTarget = null;
    if (pressSet.has(p.id)) {
      p.pressing = true;
      const pt = m.ball.owner >= 0 ? m.ball.pos : interceptPoint(m, p).at;
      p.target = { ...pt };
      p.urgency = t.pressIntensity === 'low' ? 0.8 : 1;
      continue;
    }
    p.pressing = false;
    if (transition && !['cb','fb','wb'].includes(p.role)) {
      // 即時奪回は近い3人が追い、残りもボール側の出口を閉じる。帰陣は球へ個別に吸い寄せず、共通の学習ブロックへ戻る。
      const base = toRel(side, shapeTarget(m, p));
      const close = t.onLoss === 'counterpress' ? 0.5 : 0;
      p.target = toAbs(side, { x: Math.min(base.x, base.x + (ball.x - 5 - base.x) * close), y: base.y + (ball.y - base.y) * close });
      p.urgency = dist(p.pos, p.target) > 6 ? 0.94 : 0.75;
      // 切替の分岐でも通常守備と同じ帰陣条件を使う。中盤を球の前に残さない。
      if(!['st','f9','wg','iw'].includes(p.role)&&toRel(side,p.pos).x>ball.x+4){
        const r=toRel(side,p.target);r.x=Math.min(r.x,ball.x-2);p.target=toAbs(side,r);p.urgency=.95;
      }
    } else defenderMove(m, p, zoneMarks.get(p.id));
  }

  // CB同士の深さを揃える。SB/WBが相手へ出る動きまでCBの高さへ戻さない。
  const back = team.filter((p) => !pressSet.has(p.id) && p.role === 'cb');
  // ただし裏へ走る相手に付いて下がった選手は基準にしない(全員がゴール前まで下がらないように)
  if (back.length >= 2 && t.marking === 'zone') {
    const frameLine = m.frames[side].line;
    let deepest = 1e9;
    for (const p of back) {
      const x = toRel(side, p.target).x;
      if (x >= frameLine - 3) deepest = Math.min(deepest, x);
    }
    if (deepest < 1e9) {
      for (const p of back) {
        const r = toRel(side, p.target);
        if (r.x > deepest + 3) p.target = toAbs(side, { x: deepest + 3, y: r.y });
      }
    }
  }
  // 高/低ラインはCBだけでなく後方ユニット全体の保持範囲にする。
  // 高いラインも、正当に背後へ出されたパスには追従する。
  if (t.lineHeight !== 'normal') {
    const cbs = team.filter(p=>p.role==='cb');
    if(cbs.length){
      const learnedLine=cbs.reduce((sum,p)=>sum+toRel(side,shapeTarget(m,p)).x,0)/cbs.length;
      const pass=m.ball.pass;
      const releasedBehind=pass&&m.players[pass.from].team!==side&&toRel(side,pass.point).x<learnedLine+3;
      for(const p of team)if(['cb','fb','wb'].includes(p.role)&&!pressSet.has(p.id)){
        const r=toRel(side,p.target);
        if(t.lineHeight==='deep')r.x=Math.min(r.x,learnedLine+6);
        else if(!releasedBehind&&ball.x>learnedLine+.5)r.x=Math.max(r.x,learnedLine-1.5);
        p.target=toAbs(side,{x:clamp(r.x,2,PITCH_W-2),y:r.y});
      }
    }
  }

  // 相手前線から離れすぎた後方ユニットを一緒に押し上げる。
  // 急接近する球には押し上げず、低いラインを選んだ戦術も維持する。
  if (t.lineHeight === 'high' && m.movementBallVel.x * (side === 0 ? 1 : -1) > -1.5) {
    const backs = team.filter(p => ['cb','fb','wb'].includes(p.role) && !pressSet.has(p.id));
    const line = deepestOutfield(m,side);
    const threats = m.players.filter(p=>p.team!==side&&p.role!=='gk').map(p=>toRel(side,p.pos).x).filter(x=>x>=line-3);
    const cbs = backs.filter(p=>p.role==='cb');
    if(cbs.length && threats.length){
      const targetLine=cbs.reduce((s,p)=>s+toRel(side,p.target).x,0)/cbs.length;
      const shift=clamp(Math.min(...threats)-8-targetLine,0,t.pressHeight==='low'?1.5:3);
      for(const p of backs){const r=toRel(side,p.target);r.x=clamp(r.x+shift,2,PITCH_W-2);p.target=toAbs(side,r);}
    }
  }
}

function defenderMove(m: MatchState, p: Player, zoneMark?: Player) {
  const side = p.team;
  const t = m.tactics[side];
  const base = shapeTarget(m, p);
  const baseRel = toRel(side, base);
  const ball = toRel(side, m.ball.pos);

  if (t.marking === 'man' && p.markTarget >= 0) {
    const o = m.players[p.markTarget];
    // 動き出しへの反応は遅れる。走る相手ほど離される。釣り出されやすいのも弱点。
    const oRel = toRel(side, { x: o.pos.x - o.vel.x * 0.7, y: o.pos.y - o.vel.y * 0.7 });
    const dx = -1.8;
    const dy = (34 - oRel.y) * 0.04 + (ball.y - oRel.y) * 0.05;
    p.target = toAbs(side, { x: clamp(oRel.x + dx, 2, PITCH_W - 2), y: clamp(oRel.y + dy, 2, 66) });
    p.urgency = dist(p.pos, p.target) > 12 ? 0.9 : 0.72;
    return;
  }

  // ゾーン: 自分の持ち場の近くにいる相手を、ゴール側から牽制する
  const mark = zoneMark;
  const isBack = p.role === 'cb' || p.role === 'fb' || p.role === 'wb';
  let target: Vec = baseRel;
  if (mark) {
    const r = toRel(side, mark.pos);
    // ゾーンでは持ち場を大きく離れない。近くの相手に少し寄せて、パスコースを狭める程度にとどめる
    const pull = dist(p.pos, mark.pos) > 10 ? 0.7 : 0.5;
    // CBの縦の追従は小さくし、SB/WBはサイドの相手へ前後にも出られるようにする。
    const pullX = p.role === 'cb' ? 0.8 : Math.max(pull, 0.7);
    target = {
      x: baseRel.x + (isBack ? (r.x - 1.5 - baseRel.x) * pullX : (p.role === 'dm' || p.role === 'cm' ? 0 : clamp((r.x - 1.5 - baseRel.x) * pullX, -3, 3))),
      y: baseRel.y + (r.y - baseRel.y) * pull + (ball.y - r.y) * 0.05,
    };
  }

  // 担当をCBが受け持つとき、SBはタッチラインに残らず内側のパスコースをカバーする。
  // 担当の重複は作らず、実際の相手の幅に合わせてCBは最大6m、SB/WBは最大12mの範囲でカバーする。
  if (isBack && !mark) {
    const threats = m.players.filter(o => o.team !== side && o.role !== 'gk' && o.id !== m.ball.owner);
    const nearest = threats.reduce((a,b) => dist(base,a.pos)<dist(base,b.pos)?a:b);
    const r = toRel(side,nearest.pos);
    const cover = p.role === 'cb' ? 6 : 12;
    const dx = Math.min(0,r.x - 5 - baseRel.x);
    const dy = r.y + Math.sign(baseRel.y-r.y)*4 - baseRel.y;
    const scale = Math.min(1,cover/Math.max(1,Math.hypot(dx,dy)));
    target.x += dx*scale;
    target.y += dy*scale;
  }

  // 最終ラインは背後を取られない
  if (isBack) {
    // CBは深さを揃え、SB/WBは実測の一段前の持ち場からサイドの相手へ出る。
    // 全員をCBの高さへ固定すると、SBが相手のWGから10m以上離れてしまう。
    // An onside forward holding the line is not a cue to step beyond the
    // learned cover position: otherwise both players ratchet the line up.
    const ceiling = p.role === 'cb' ? baseRel.x - clamp((ball.x - 70) / 15, 0, 1) : baseRel.x + (mark ? 6 : 4);
    target.x = Math.min(target.x, ceiling);
    // 自陣深くでは、出遅れてから帰る判定を繰り返さず、先にゴール側のカバーへ戻る。
    if (ball.x < 40) target.x = Math.min(target.x, ball.x - 1.5);
    // 裏へ走り出した相手にだけ付いていく。ラインの手前に立つだけの相手や、
    // オフサイドの位置に残った相手まで追うと、ラインがゴール前まで下がり続けてしまう。
    const actualLine = deepestOutfield(m, side);
    for (const o of m.players) {
      if (o.team === side || o.role === 'gk') continue;
      const r = toRel(side, o.pos);
      const running = o.runUntil > m.t && o.runTarget !== null;
      // オフサイドの位置に残っている相手には付かず、ラインを上げて置き去りにする
      // 高いラインは走者だけに釣られず、背後へ実際に出された球に対応する。
      const releasedBehind = m.ball.pass !== null && toRel(side, m.ball.pass.point).x < actualLine + 3;
      const holdHighLine = t.lineHeight === 'high' && !releasedBehind;
      if (running && !holdHighLine && r.x > actualLine - 14 && dist(o.pos, p.pos) < 12) {
        // Tracking a run is a recovery action, never a reason to abandon
        // deeper cover. A runner timing on the line may still be in front of
        // the learned target, especially before the pass is released.
        target = { x: Math.min(target.x, Math.max(r.x - 2, 3)), y: r.y };
        break;
      }
    }
  }

  // 自分の持ち場に入ってきた保持者には寄せて奪いに行く
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  // 1人が寄せたら、残りはカバーに回る
  const someoneOnBall = carrier !== null && m.players.some(
    (q) => q.team === side && q.id !== p.id && (q.pressing || dist(q.pos, carrier.pos) < dist(p.pos, carrier.pos)) && dist(q.pos, carrier.pos) < 4,
  );
  if (carrier && carrier.team !== side && !someoneOnBall && dist(carrier.pos, p.pos) < 6 && dist(carrier.pos, base) < 10) {
    p.target = { ...carrier.pos };
    p.urgency = 0.9;
    p.pressing = true;
    return;
  }

  const rel = toRel(side, p.pos);
  // ボールより前にいる守備者と中盤は全力で帰陣する。前線の選手は自分の持ち場(カウンターの出口)まで戻る
  const forward = p.role === 'st' || p.role === 'f9' || p.role === 'wg' || p.role === 'iw';
  const behind = !forward && rel.x > ball.x + 4 && (m.t-m.turnoverAt<3 || baseRel.x<ball.x+4);
  if (behind) {
    target.x = Math.min(target.x, ball.x - 2);
  }
  p.target = toAbs(side, { x: clamp(target.x, 2, PITCH_W - 2), y: clamp(target.y, 2, 66) });
  p.urgency = behind ? 0.95 : 0.72;
}

/** そのチームで最も自陣ゴールに近いフィールドプレーヤーの位置(自チーム基準)。 */
function deepestOutfield(m: MatchState, side: Side): number {
  let x = 1e9;
  for (const p of m.players) if (p.team === side && p.role !== 'gk') x = Math.min(x, toRel(side, p.pos).x);
  return x;
}

export function goalkeeper(m: MatchState, p: Player) {
  const base = shapeTarget(m, p);
  p.pressing = false;
  const rel = toRel(p.team, m.ball.pos);
  // ボックス内のこぼれ球は GK が処理する
  if (m.ball.owner < 0 && !m.ball.shot && rel.x < 16.5 && Math.abs(rel.y - 34) < 20) {
    const speedSq = m.ball.vel.x ** 2 + m.ball.vel.y ** 2;
    const nearest = nearestOpp(m, p.team, m.ball.pos);
    if (speedSq < 90 && nearest > dist(p.pos, m.ball.pos) * 0.6) {
      p.target = interceptPoint(m, p).at;
      p.urgency = 1;
      return;
    }
  }
  // ボックス内へのスルーパスは、届くなら飛び出して処理する
  const pass = m.ball.pass;
  if (pass && m.players[pass.from].team !== p.team && !pass.cross) {
    const pt = toRel(p.team, pass.point);
    if (pt.x < 16.5 && Math.abs(pt.y - 34) < 20 && dist(p.pos, pass.point) < 14) {
      p.target = interceptPoint(m, p).at;
      p.urgency = 1;
      return;
    }
  }
  if (m.ball.shot) {
    p.target = { ...p.pos };
    p.urgency = 0.5;
    return;
  }
  p.target = base;
  p.urgency = 0.65;
}

/** マンマークの担当を決める。ポジションが近い相手から割り当てる。 */
export function assignMarks(m: MatchState, side: Side) {
  const opp = (1 - side) as Side;
  const mine = m.players.filter((p) => p.team === side && p.role !== 'gk');
  const theirs = m.players.filter((p) => p.team === opp && p.role !== 'gk');
  const used = new Set<number>();
  const pairs: { a: Player; b: Player; d: number }[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      const dx = relX(side, a.pos.x) - relX(side, b.pos.x);
      pairs.push({ a, b, d: Math.hypot(dx, a.pos.y - b.pos.y) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const done = new Set<number>();
  for (const { a, b } of pairs) {
    if (done.has(a.id) || used.has(b.id)) continue;
    a.markTarget = b.id;
    done.add(a.id);
    used.add(b.id);
  }
  m.markingDirty[side] = false;
}
