import { MatchState, PITCH_H, PITCH_W, Player, Vec } from '../engine/types';

/** ピッチ座標と画面座標の変換。縦長の画面ではピッチを90度回して、右方向の攻撃を上方向にする。 */
export interface View {
  w: number;
  h: number;
  portrait: boolean;
  scale: number;
  ox: number;
  oy: number;
}

const PAD = 14;

export function makeView(w: number, h: number): View {
  const portrait = h > w * 1.1;
  const pw = portrait ? PITCH_H : PITCH_W;
  const ph = portrait ? PITCH_W : PITCH_H;
  const scale = Math.min((w - PAD * 2) / pw, (h - PAD * 2) / ph);
  return { w, h, portrait, scale, ox: (w - pw * scale) / 2, oy: (h - ph * scale) / 2 };
}

export function viewHeightFor(width: number, portrait: boolean) {
  const pw = portrait ? PITCH_H : PITCH_W;
  const ph = portrait ? PITCH_W : PITCH_H;
  return ((width - PAD * 2) / pw) * ph + PAD * 2;
}

export function sx(v: View, x: number, y: number) {
  return v.portrait ? v.ox + y * v.scale : v.ox + x * v.scale;
}
export function sy(v: View, x: number, y: number) {
  return v.portrait ? v.oy + (PITCH_W - x) * v.scale : v.oy + y * v.scale;
}
export function toPitch(v: View, px: number, py: number): Vec {
  if (v.portrait) return { x: PITCH_W - (py - v.oy) / v.scale, y: (px - v.ox) / v.scale };
  return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
}

const C = {
  grassA: '#2c6e49',
  grassB: '#28643f',
  line: 'rgba(255,255,255,.78)',
};

function pitchRect(ctx: CanvasRenderingContext2D, v: View, x0: number, y0: number, x1: number, y1: number) {
  const ax = sx(v, x0, y0);
  const ay = sy(v, x0, y0);
  const bx = sx(v, x1, y1);
  const by = sy(v, x1, y1);
  ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
}

export function drawPitch(ctx: CanvasRenderingContext2D, v: View) {
  ctx.fillStyle = '#16302a';
  ctx.fillRect(0, 0, v.w, v.h);
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? C.grassA : C.grassB;
    ctx.beginPath();
    pitchRect(ctx, v, (i * PITCH_W) / bands, 0, ((i + 1) * PITCH_W) / bands, PITCH_H);
    ctx.fill();
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.4;
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    pitchRect(ctx, v, x0, y0, x1, y1);
    ctx.stroke();
  };
  box(0, 0, PITCH_W, PITCH_H);
  box(0, 13.84, 16.5, 54.16);
  box(PITCH_W - 16.5, 13.84, PITCH_W, 54.16);
  box(0, 24.84, 5.5, 43.16);
  box(PITCH_W - 5.5, 24.84, PITCH_W, 43.16);
  ctx.beginPath();
  ctx.moveTo(sx(v, 52.5, 0), sy(v, 52.5, 0));
  ctx.lineTo(sx(v, 52.5, PITCH_H), sy(v, 52.5, PITCH_H));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx(v, 52.5, 34), sy(v, 52.5, 34), 9.15 * v.scale, 0, Math.PI * 2);
  ctx.stroke();
  // ゴール
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  pitchRect(ctx, v, -1.6, 30.34, 0, 37.66);
  pitchRect(ctx, v, PITCH_W, 30.34, PITCH_W + 1.6, 37.66);
  ctx.fill();
}

export interface Dot {
  x: number;
  y: number;
  color: string;
  label: string;
  ring?: boolean;
  pressing?: boolean;
  dim?: boolean;
  dark?: boolean;
}

const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

export function drawDot(ctx: CanvasRenderingContext2D, v: View, d: Dot) {
  const r = Math.max(7, 1.55 * v.scale);
  const x = sx(v, d.x, d.y);
  const y = sy(v, d.x, d.y);
  ctx.globalAlpha = d.dim ? 0.45 : 1;
  if (d.pressing) {
    ctx.strokeStyle = 'rgba(255,214,102,.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.arc(x + 1, y + 1.6, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = d.ring ? '#fff' : 'rgba(0,0,0,.45)';
  ctx.lineWidth = d.ring ? 2.4 : 1;
  ctx.stroke();
  ctx.fillStyle = luminance(d.color) > 0.6 ? '#10201a' : '#fff';
  ctx.font = `700 ${Math.max(9, r * 1.02)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.label, x, y + 0.5);
  ctx.globalAlpha = 1;
}

export function drawBallAt(ctx: CanvasRenderingContext2D, v: View, p: Vec, z: number) {
  const r = Math.max(4, 0.75 * v.scale) * (1 + z * 0.09);
  const x = sx(v, p.x, p.y);
  const y = sy(v, p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.arc(x + z * 0.9, y + z * 1.2, Math.max(3, r * 0.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - z * 0.8, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** 前ティックと現ティックを補間した表示位置。 */
export function interp(p: { pos: Vec; prev: Vec }, a: number): Vec {
  return { x: p.prev.x + (p.pos.x - p.prev.x) * a, y: p.prev.y + (p.pos.y - p.prev.y) * a };
}

export function drawMatch(
  ctx: CanvasRenderingContext2D,
  v: View,
  m: MatchState,
  alpha: number,
  drag?: { id: number; at: Vec } | null,
) {
  const colors = [m.cfg.teams[0].color, m.cfg.teams[1].color];
  const order: Player[] = [...m.players].sort((a, b) => Number(a.id === m.ball.owner) - Number(b.id === m.ball.owner));
  for (const p of order) {
    const pos = interp(p, alpha);
    drawDot(ctx, v, {
      ...pos,
      color: colors[p.team],
      label: String(p.number),
      ring: p.id === m.ball.owner,
      pressing: p.pressing,
      dim: drag?.id === p.id,
    });
  }
  if (drag) {
    const p = m.players[drag.id];
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(v, p.pos.x, p.pos.y), sy(v, p.pos.x, p.pos.y));
    ctx.lineTo(sx(v, drag.at.x, drag.at.y), sy(v, drag.at.x, drag.at.y));
    ctx.stroke();
    ctx.setLineDash([]);
    drawDot(ctx, v, { ...drag.at, color: colors[p.team], label: String(p.number), ring: true });
  }
  drawBallAt(ctx, v, interp(m.ball, alpha), m.ball.z);
}
