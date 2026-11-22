import { clamp, dist, pointToSegment, toAbs, toRel } from './geometry';
import { BOUNCE_KEEP, BOUNCE_VZ, GROUND_DECEL } from './ball';
import { threat, nearestOpp } from './onBall';
import { offsideLimit, oppLineX, shapeTarget } from './teamShape';
import { MatchState, PITCH_W, Player, TICK, Vec } from './types';

const RUN_ROLES = new Set(['st', 'wg', 'iw', 'am', 'wb', 'fb', 'cm']);

/** 攻撃側の味方(ボール保持者以外)の動き。 */
export function attackerMove(m: MatchState, p: Player) {
  const side = p.team;
  const t = m.tactics[side];
  const base = shapeTarget(m, p);
  p.pressing = false;
  if (p.role === 'gk') {
    p.target = base;
    p.urgency = 0.6;
    return;
  }

  const sinceWin = m.t - m.turnoverAt;
  const counter = t.onWin === 'counter' && sinceWin < 6;
  const carrier = m.ball.owner >= 0 ? m.players[m.ball.owner] : null;
  // パスの移動中は、次にボールを持つ受け手を基準にサポートする
  const pass = m.ball.pass;
  const hub = carrier ?? (pass && m.players[pass.from].team === side ? m.players[pass.to] : null);
  const rel = toRel(side, p.pos);
  // 相手ラインの押し上げを0.8秒先まで読んで合わせる(反応してから戻るとパスの間にオフサイドに残る)
  const lim = Math.min(offsideLimit(m, side), anticipatedLimit(m, side));

  // 奪取直後も学習位置を基準にする。保持の支援は4mの固定偏差とし、毎tick「現在位置−3m」へ後退し続けない。
  if (sinceWin < 3) {
    const b = toRel(side, base);
    const forward = p.role === 'st' || p.role === 'wg' || p.role === 'iw' || p.role === 'am';
    if(counter&&forward&&carrier&&carrier.team===side){
      if(p.runTarget&&p.runUntil>m.t){const r=toRel(side,p.runTarget);p.target=toAbs(side,{x:Math.min(r.x,lim+.3),y:r.y});p.urgency=1;return;}
      const space=PITCH_W-7-lim,nearLine=rel.x>lim-9&&rel.x<=lim+.3;
      if(space>6&&nearLine&&nearestOpp(m,side,carrier.pos)>3.5){
        // Start the same onside-to-behind-line run used in settled play now,
        // rather than waiting three seconds while clamping every runner back
        // to the line. Passing still checks the receiver's position at kick.
        p.runTarget=toAbs(side,{x:lim+Math.min(space,16),y:clamp(rel.y+(34-rel.y)*.25,4,64)});
        p.runUntil=m.turnoverAt+3;const r=toRel(side,p.runTarget);p.target=toAbs(side,{x:Math.min(r.x,lim+.3),y:r.y});p.urgency=1;return;
      }
    }
    p.runTarget = null; p.runUntil = 0; p.spot = null;
    const outlet = p.role === 'st' && !counter;
    p.target = toAbs(side, { x: Math.min(lim - 0.5, outlet ? Math.max(b.x, lim - 1) : counter && forward ? b.x + 12 : !counter && forward ? b.x - 4 : b.x), y: b.y });
    p.urgency = counter && forward ? 1 : 0.78;
    return;
  }

  // サイドの深い位置にボールが入ったら、ゴール前へ飛び込む
  // ニア・ファー・PK地点・マイナスの折り返しに分かれる(実測のクロス局面: ボックス内1.8人、手前1.9人)
  // パスの移動中も受け手を基準にし、ボールがサイドの深い位置へ運ばれる前から走り込む
  if (hub && hub.team === side && hub.id !== p.id) {
    const cr = toRel(side, pass && !carrier ? pass.point : hub.pos);
    if (cr.x > 70 && Math.abs(cr.y - 34) > 12) {
      const spot = crossSpot(m, p, hub, cr, lim);
      if (spot) {
        p.spot = null;
        p.runTarget = spot;
        p.runUntil = m.t + .8;
        p.target = spot;
        p.urgency = 1;
        return;
      }
    }
  }

  // 走り出している選手。ラインを越えてもパスが出なければ走り抜けず、すぐオンサイドへ戻る
  // (パスはライン手前の走者にしか出ない。実測でボールより後ろなのにラインの裏に残る選手は0.12人)。
  const passToMe = pass && pass.to === p.id;
  if (p.runTarget && p.runUntil > m.t && !(rel.x > lim + 1.5 && !passToMe)) {
    // パスが出るまではライン上を斜めに走ってタイミングを合わせ、出た瞬間に裏へ抜ける
    // (パスの目標は runTarget のまま。受け手になれば上の受け手処理が裏へ走らせる)。
    const r = toRel(side, p.runTarget);
    p.target = toAbs(side, { x: Math.min(r.x, lim + 0.3), y: r.y });
    p.urgency = 1;
    return;
  }
  p.runTarget = null;
  if (!passToMe && rel.x > lim + 0.3 && toRel(side, m.ball.pos).x < lim) {
    p.spot = null;
    p.target = toAbs(side, { x: lim - 1.5, y: rel.y });
    p.urgency = 0.92;
    return;
  }

  // 裏抜け: 味方が前を向けているとき、最終ラインの背後にスペースがあれば走る
  if (carrier && carrier.team === side && RUN_ROLES.has(p.role) && (counter || t.buildUp==='long' || toRel(side,carrier.pos).x>=35)) {
    const space = PITCH_W - 7 - oppLineX(m, side);
    const carrierFree = nearestOpp(m, side, carrier.pos) > 3.5;
    const nearLine = rel.x > lim - 9 && rel.x <= lim;
    const rate = (counter ? 0.9 : 0.55) * (p.role === 'st' || p.role === 'wg' || p.role === 'iw' ? 1 : 0.5);
    if (space > 6 && carrierFree && nearLine && m.rand() < rate * TICK) {
      const depth = Math.min(space, 16);
      const tgtRel = { x: lim + depth, y: clamp(rel.y + (34 - rel.y) * 0.25, 4, 64) };
      p.runTarget = toAbs(side, tgtRel);
      p.runUntil = m.t + 2.6;
      p.target = toAbs(side, { x: Math.min(tgtRel.x, lim + 0.3), y: tgtRel.y });
      p.urgency = 1;
      return;
    }
  }

  // 同じサイドのウイングが敵陣で持ったら、SBが外を追い越す(実測でSBがWGより前に出る割合16%)
  if (carrier && carrier.team === side && (p.role === 'fb' || p.role === 'wb') && t.fullbacks !== 'invert'
    && ['wg', 'iw', 'am', 'cm'].includes(carrier.role)) {
    const cr = toRel(side, carrier.pos);
    const sameSide = Math.sign(cr.y - 34) === Math.sign(rel.y - 34) && Math.abs(cr.y - 34) > 10;
    const rate = t.fullbacks === 'overlap' ? 1.8 : p.role === 'wb' ? 1.2 : 0.9;
    if (sameSide && cr.x > 55 && cr.x < 90 && rel.x < cr.x + 2 && dist(p.pos, carrier.pos) < 32 && m.rand() < rate * TICK) {
      const outside = Math.sign(cr.y - 34);
      p.runTarget = toAbs(side, { x: Math.min(lim - 0.5, cr.x + 14, PITCH_W - 6), y: clamp(34 + outside * Math.max(Math.abs(cr.y - 34) + 5, 26), 3, 65) });
      p.runUntil = m.t + 4.5;
      p.target = p.runTarget;
      p.urgency = 1;
      return;
    }
  }

  // カウンター: 前線が一気に駆け上がる
  if (counter && rel.x < lim - 2 && p.role !== 'cb' && p.role !== 'dm') {
    const baseRel = toRel(side, base);
    p.target = toAbs(side, { x: Math.min(lim - 0.5, baseRel.x + 16), y: baseRel.y });
    p.urgency = 0.95;
    return;
  }

  // 敵陣では、CFと逆サイドのウイングは相手の最終ライン上で待ち、裏を狙える位置を保つ
  // (実測でライン手前5m以内に1.8人、ボールより前に1.6人)
  if (hub && hub.team === side && holdsLine(p, hub)) {
    const b = toRel(side, base);
    p.spot = null;
    p.target = toAbs(side, { x: Math.min(lim - .5, Math.max(b.x, lim - (p.role === 'st' ? .5 : 1.5))), y: b.y });
    p.urgency = dist(p.pos, p.target) > 5 ? 0.92 : 0.7;
    return;
  }

  // ボール保持者の近くの数人は、短いパスを受けられる角度を作りに寄る
  if (hub && hub.team === side && hub.id !== p.id && isSupporter(m, p, hub)) {
    if (m.t >= p.nextSpotAt || !p.spot || p.spotOwner !== hub.id) {
      p.nextSpotAt = m.t + 1.2 + m.rand() * 0.4;
      const at = findSupportSpot(m, p, hub, base, lim);
      // 保持者からの相対位置で覚え、保持者が運んでも角度を保って付いていく
      p.spot = { x: at.x - hub.pos.x, y: at.y - hub.pos.y };
      p.spotOwner = hub.id;
    }
    const tgt = toRel(side, { x: hub.pos.x + p.spot.x, y: hub.pos.y + p.spot.y });
    const anchor=toRel(side,base);
    const deviation=Math.hypot(tgt.x-anchor.x,tgt.y-anchor.y);
    const scale=Math.min(1,8.5/Math.max(1,deviation));
    tgt.x=anchor.x+(tgt.x-anchor.x)*scale;tgt.y=anchor.y+(tgt.y-anchor.y)*scale;
    // 中盤が毎回保持者の後方へ下がらず、前進するチームの接続点を保つ。
    const supportFloor = p.role === 'dm' || p.role === 'cm' ? Math.min(toRel(side, base).x - 2, lim - 1) : 2;
    p.target = toAbs(side, { x: clamp(tgt.x, supportFloor, Math.min(lim - 0.4, PITCH_W - 3)), y: clamp(tgt.y, 2, 66) });
    p.urgency = 0.65;
    return;
  }

  // 空いている場所を探して受ける
  const ballDist = dist(p.pos, m.ball.pos);
  if (ballDist < 32 && p.role !== 'cb') {
    if (m.t >= p.nextSpotAt || !p.spot || p.spotOwner !== -1) {
      p.nextSpotAt = m.t + 1.2 + m.rand() * 0.4;
      p.spot = findOpenSpot(m, p, base, lim);
      p.spotOwner = -1;
    }
    if (p.spot) {
      p.target = p.spot;
      p.urgency = 0.72;
      return;
    }
  }
  p.spot = null;
  p.target = base;
  p.urgency = dist(p.pos, base) > 9 ? 0.75 : 0.5;
}

/** 相手の後ろから2人目の0.8秒後の位置で決まるオフサイドライン(自チーム基準のx)。 */
function anticipatedLimit(m: MatchState, side: Player['team']): number {
  const xs: number[] = [];
  for (const o of m.players) if (o.team !== side) xs.push(toRel(side, { x: o.pos.x + o.vel.x * 0.8, y: o.pos.y }).x);
  xs.sort((a, b) => b - a);
  return Math.max(xs[1], toRel(side, m.ball.pos).x, PITCH_W / 2);
}

function holdsLine(p: Player, carrier: Player): boolean {
  const side = p.team;
  const cr = toRel(side, carrier.pos);
  // CFは自陣の組み立てから相手の最終ラインを押し下げる(実測で自陣保持時の最前線はボールの37m前)
  if (p.role === 'st') return true;
  if (cr.x < 45) return false;
  if (p.role !== 'wg' && p.role !== 'iw') return false;
  // Central final-third possession needs both wide outlets high enough to
  // threaten the line; neither is the near-side short support in this case.
  if (cr.x > 70 && Math.abs(cr.y - 34) <= 6) return true;
  // ボールと逆サイドのウイング
  const rel = toRel(side, p.pos);
  return Math.sign(rel.y - 34) !== Math.sign(cr.y - 34) && Math.abs(cr.y - 34) > 6;
}

/** クロス局面の役割分担。ゴールに近い順にニア・ファー・PK地点・マイナスへ入る。 */
function crossSpot(m: MatchState, p: Player, carrier: Player, cr: Vec, lim: number): Vec | null {
  const side = p.team;
  const near = Math.sign(cr.y - 34);
  const eligible = (q: Player) => q.team === side && q.id !== carrier.id
    && ['st', 'f9', 'am', 'iw', 'wg', 'cm'].includes(q.role)
    // ボールサイドのウイングは保持者の近くでサポートに残る
    && !((q.role === 'wg' || q.role === 'iw') && Math.sign(toRel(side, q.pos).y - 34) === near && dist(q.pos, carrier.pos) < 15);
  if (!eligible(p)) return null;
  const goal = toAbs(side, { x: PITCH_W, y: 34 });
  const pri = (q: Player) => dist(q.pos, goal) + (q.role === 'cm' ? 12 : 0);
  const order = m.players.filter(eligible).sort((a, b) => pri(a) - pri(b));
  const rank = order.indexOf(p);
  const spots = [
    { x: 99, y: 34 + near * 3 },   // ニア
    { x: 97, y: 34 - near * 6 },   // ファー
    { x: 93, y: 34 - near * 1 },   // PK地点付近
    { x: 86, y: 34 + near * 5 },   // マイナスの折り返し
  ];
  if (rank < 0 || rank >= spots.length) return null;
  const s = spots[rank];
  // ボールが入る前はオフサイドラインを越えない
  return toAbs(side, { x: Math.min(s.x, lim - 0.3), y: s.y });
}

const SUPPORTERS = 2;

/** 保持者に近い順で上位の味方か。GK と、前線で相手の最終ラインを押し下げる CF は除く。 */
const HOLDERS = new Set(['gk', 'st', 'wg', 'iw', 'wb']);

/** 幅と深さを作る選手(ウイング、CF、WB)は、すぐ近くにいる時しか寄らない。 */
function isSupporter(m: MatchState, p: Player, carrier: Player): boolean {
  // CF は最終ラインを押し下げる役。下がって受けるのは偽9番の仕事
  if (p.role === 'gk' || p.role === 'st' || p.role === 'am') return false;
  const d = dist(p.pos, carrier.pos);
  if (d > 25 || (HOLDERS.has(p.role) && d > 13)) return false;
  let closer = 0;
  for (const q of m.players) {
    if (q.team !== p.team || q.id === p.id || q.id === carrier.id || q.role === 'gk' || q.role === 'st') continue;
    if (HOLDERS.has(q.role) && dist(q.pos, carrier.pos) > 13) continue;
    if (dist(q.pos, carrier.pos) < d) closer += 1;
  }
  return closer < SUPPORTERS;
}

/** 保持者の周り10〜15mで、相手から離れていてパスコースが通る場所。後ろや横も候補に入れる。 */
function findSupportSpot(m: MatchState, p: Player, carrier: Player, base: Vec, lim: number): Vec {
  const side = p.team;
  const c = toRel(side, carrier.pos);
  let best = base;
  let bestScore = -1e9;
  for (const r of [10, 15]) {
    for (let k = -5; k <= 6; k++) {
      const a = (k / 12) * Math.PI * 2;
      const cand: Vec = {
        x: clamp(c.x + Math.cos(a) * r, 2, Math.min(lim - 0.4, PITCH_W - 3)),
        y: clamp(c.y + Math.sin(a) * r, 2, 66),
      };
      const abs = toAbs(side, cand);
      const open = Math.min(nearestOpp(m, side, abs), 8);
      let lane = 8;
      for (const o of m.players) {
        if (o.team === side) continue;
        lane = Math.min(lane, pointToSegment(o.pos, carrier.pos, abs).d);
      }
      // 味方と同じ場所に重ならない
      let crowd = 0;
      for (const q of m.players) {
        if (q.team === side && q.id !== p.id && q.id !== carrier.id && dist(q.pos, abs) < 9) crowd += 1;
      }
      const score = open * 0.5 + Math.min(lane, 6) * 0.7 + threat(cand) * 2.5 - crowd * 3
        - dist(abs, p.pos) * 0.1 - dist(abs, base) * 0.1 - dist(abs, p.target) * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = abs;
      }
    }
  }
  return best;
}

function findOpenSpot(m: MatchState, p: Player, base: Vec, lim: number): Vec {
  const side = p.team;
  const baseRel = toRel(side, base);
  const ballPos = m.ball.pos;
  let best = base;
  let bestScore = -1e9;
  for (let i = -1; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    // 幅と深さを作る選手は、持ち場から大きく離れない
    const r = i < 0 ? 0 : HOLDERS.has(p.role) ? 3.5 : 8.5;
    const c: Vec = {
      x: clamp(baseRel.x + Math.cos(a) * r, 2, Math.min(lim - 0.4, PITCH_W - 3)),
      y: clamp(baseRel.y + Math.sin(a) * r, 2, 66),
    };
    const abs = toAbs(side, c);
    const open = Math.min(nearestOpp(m, side, abs), 8);
    let lane = 8;
    for (const o of m.players) {
      if (o.team === side) continue;
      lane = Math.min(lane, pointToSegment(o.pos, ballPos, abs).d);
    }
    const score = open * 0.5 + Math.min(lane, 6) * 0.6 + threat(c) * 7 - dist(abs, base) * 0.08 - dist(abs, p.target) * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = abs;
    }
  }
  return best;
}

/** 動いているボールを最も早く捕まえられる地点。 */
export function interceptPoint(m: MatchState, p: Player): { at: Vec; time: number } {
  const b = m.ball;
  const speed = 7.6;
  let pos = { ...b.pos };
  let vel = { ...b.vel };
  let z = b.z;
  let vz = b.vz;
  const dt = 0.2;
  for (let t = 0; t < 3.4; t += dt) {
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
    if (z > 0 || vz > 0) {
      z += vz * dt;
      vz -= 9.8 * dt;
      if (z <= 0) {
        z = 0;
        vz = Math.abs(vz) > 2.5 ? -vz * BOUNCE_VZ : 0;
        vel = { x: vel.x * BOUNCE_KEEP, y: vel.y * BOUNCE_KEEP };
      }
    } else {
      const sp = Math.hypot(vel.x, vel.y);
      if (sp > 0) {
        const ns = Math.max(0, sp - GROUND_DECEL * dt);
        vel = { x: (vel.x * ns) / sp, y: (vel.y * ns) / sp };
      }
    }
    if (z > 2) continue;
    if (dist(p.pos, pos) / speed + 0.1 <= t) return { at: pos, time: t };
  }
  return { at: pos, time: dist(p.pos, pos) / speed + 0.5 };
}
