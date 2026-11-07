import { dist, relX } from '../engine/geometry';
import { passSafety } from '../engine/onBall';
import { MatchState, OverlayId, PITCH_H, PITCH_W, Side, Vec } from '../engine/types';
import { sx, sy, View } from './pitch';

export const OVERLAY_INFO: Record<OverlayId, { label: string; desc: string }> = {
  numbers: { label: '数的関係', desc: 'ボール周辺の人数を比べ、どこで優位か示す' },
  lines: { label: '守備ライン', desc: '各チームの最終ラインとチームの縦幅' },
  passes: { label: 'パスコース', desc: '保持者から出せるコース。緑ほど安全' },
  space: { label: 'スペース支配', desc: '両チームのどちらが先に着ける場所か' },
  lanes: { label: '5レーン', desc: 'ピッチを縦に5分割。同じレーンに2人並ばないのが基本' },
};

function poly(ctx: CanvasRenderingContext2D, v: View, pts: Vec[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = sx(v, p.x, p.y);
    const y = sy(v, p.x, p.y);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
}

function drawLanes(ctx: CanvasRenderingContext2D, v: View) {
  const ys = [13.84, 24.84, 43.16, 54.16];
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,.4)';
  ctx.lineWidth = 1;
  for (const y of ys) {
    poly(ctx, v, [{ x: 0, y }, { x: PITCH_W, y }]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,214,102,.1)';
  for (const [a, b] of [[13.84, 24.84], [43.16, 54.16]]) {
    poly(ctx, v, [{ x: 70, y: a }, { x: PITCH_W, y: a }, { x: PITCH_W, y: b }, { x: 70, y: b }]);
    ctx.fill();
  }
}

function drawLines(ctx: CanvasRenderingContext2D, v: View, m: MatchState) {
  for (const side of [0, 1] as Side[]) {
    const color = m.cfg.teams[side].color;
    const xs = m.players.filter((p) => p.team === side && p.role !== 'gk').map((p) => relX(side, p.pos.x));
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const toX = (r: number) => (side === 0 ? r : PITCH_W - r);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    poly(ctx, v, [{ x: toX(lo), y: 0 }, { x: toX(hi), y: 0 }, { x: toX(hi), y: PITCH_H }, { x: toX(lo), y: PITCH_H }]);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    poly(ctx, v, [{ x: toX(lo), y: 0 }, { x: toX(lo), y: PITCH_H }]);
    ctx.stroke();
  }
}

function drawSpace(ctx: CanvasRenderingContext2D, v: View, m: MatchState) {
  const nx = 28;
  const ny = 18;
  const cw = PITCH_W / nx;
  const ch = PITCH_H / ny;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const c = { x: (i + 0.5) * cw, y: (j + 0.5) * ch };
      const best = [1e9, 1e9];
      for (const p of m.players) {
        if (p.role === 'gk') continue;
        const d = dist(p.pos, c);
        if (d < best[p.team]) best[p.team] = d;
      }
      const w: Side = best[0] < best[1] ? 0 : 1;
      const lead = Math.min(1, Math.abs(best[0] - best[1]) / 9);
      ctx.globalAlpha = 0.1 + lead * 0.26;
      ctx.fillStyle = m.cfg.teams[w].color;
      poly(ctx, v, [{ x: i * cw, y: j * ch }, { x: (i + 1) * cw, y: j * ch }, { x: (i + 1) * cw, y: (j + 1) * ch }, { x: i * cw, y: (j + 1) * ch }]);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPasses(ctx: CanvasRenderingContext2D, v: View, m: MatchState) {
  if (m.ball.owner < 0) return;
  const c = m.players[m.ball.owner];
  for (const q of m.players) {
    if (q.team !== c.team || q.id === c.id) continue;
    if (dist(q.pos, c.pos) > 42) continue;
    const s = passSafety(m, c.pos, q.pos, c.team, false);
    ctx.strokeStyle = `hsla(${Math.round(s * 130)}, 85%, 58%, ${0.25 + s * 0.65})`;
    ctx.lineWidth = 1 + s * 2.4;
    poly(ctx, v, [c.pos, q.pos]);
    ctx.stroke();
  }
}

function drawNumbers(ctx: CanvasRenderingContext2D, v: View, m: MatchState) {
  const R = 16;
  const b = m.ball.pos;
  const count = [0, 0];
  for (const p of m.players) if (p.role !== 'gk' && dist(p.pos, b) < R) count[p.team] += 1;
  const px = sx(v, b.x, b.y);
  const py = sy(v, b.x, b.y);
  const diff = count[0] - count[1];
  ctx.fillStyle = diff > 0 ? 'rgba(90,220,150,.17)' : diff < 0 ? 'rgba(255,120,100,.17)' : 'rgba(255,255,255,.08)';
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px, py, R * v.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 各ゾーンの人数(自チーム対相手)
  const cols = [0, 35, 70, 105];
  const rows = [0, 22.67, 45.33, 68];
  ctx.font = `700 ${Math.max(11, v.scale * 2.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const n = [0, 0];
      for (const p of m.players) {
        if (p.role === 'gk') continue;
        if (p.pos.x >= cols[i] && p.pos.x < cols[i + 1] && p.pos.y >= rows[j] && p.pos.y < rows[j + 1]) n[p.team] += 1;
      }
      if (!n[0] && !n[1]) continue;
      const cx = (cols[i] + cols[i + 1]) / 2;
      const cy = (rows[j] + rows[j + 1]) / 2;
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      const x = sx(v, cx, cy);
      const y = sy(v, cx, cy);
      ctx.beginPath();
      ctx.roundRect(x - 24, y - 11, 48, 22, 6);
      ctx.fill();
      ctx.fillStyle = n[0] > n[1] ? '#7CF0B2' : n[0] < n[1] ? '#FFA494' : '#fff';
      ctx.fillText(`${n[0]} : ${n[1]}`, x, y + 0.5);
    }
  }
}

/** 選手の下に敷くレイヤーと上に重ねるレイヤーを分ける。 */
export function drawUnder(ctx: CanvasRenderingContext2D, v: View, m: MatchState, on: Set<OverlayId>) {
  if (on.has('space')) drawSpace(ctx, v, m);
  if (on.has('lanes')) drawLanes(ctx, v);
  if (on.has('lines')) drawLines(ctx, v, m);
  if (on.has('passes')) drawPasses(ctx, v, m);
}

export function drawOver(ctx: CanvasRenderingContext2D, v: View, m: MatchState, on: Set<OverlayId>) {
  if (on.has('numbers')) drawNumbers(ctx, v, m);
}
