import { useEffect, useMemo, useRef, useState } from 'react';
import { createMatch } from '../../engine/match';
import { shapeTarget, updateFrames, updateLastLines } from '../../engine/teamShape';
import { PITCH_H, PITCH_W, Side, Tactics, TeamSetup, Vec } from '../../engine/types';
import { drawDot, drawPitch, sx, sy, toPitch } from '../../render/pitch';
import { usePitchCanvas } from './usePitchCanvas';

type Phase = 'attack' | 'defend';

interface Pos { id: number; team: Side; slot: number; role: string; number: number; at: Vec }

/** エンジンの形状計算をそのまま使い、試合で実際に取る配置を見せる。 */
function preview(home: TeamSetup, away: TeamSetup, phase: Phase): Pos[] {
  const m = createMatch({ teams: [home, away], seed: 1 });
  m.dead = null;
  const owner: Side = phase === 'attack' ? 0 : 1;
  m.possession = owner;
  m.ball.pos = { x: 52.5, y: 34 };
  for (const p of m.players) {
    const rel = p.team === 0 ? { x: 35, y: p.pos.y } : { x: 70, y: p.pos.y };
    p.pos = rel;
  }
  for (let i = 0; i < 6; i++) {
    updateLastLines(m);
    updateFrames(m);
    for (const p of m.players) p.pos = shapeTarget(m, p);
  }
  return m.players.map((p) => ({ id: p.id, team: p.team, slot: p.slot, role: p.role, number: p.number, at: p.pos }));
}

const cols = [0, 35, 70, 105];

function zoneText(list: Pos[]) {
  return cols.slice(0, 3).map((c, i) => {
    const hi = cols[i + 1];
    const n: [number, number] = [0, 0];
    for (const p of list) {
      if (p.role === 'gk') continue;
      if (p.at.x >= c && p.at.x < hi) n[p.team] += 1;
    }
    return n;
  });
}

export function Board({ home, away, onOffset, editable }: {
  home: TeamSetup;
  away: TeamSetup;
  onOffset?: (t: Tactics) => void;
  editable: boolean;
}) {
  const { holder, canvas, view } = usePitchCanvas(520);
  const [phase, setPhase] = useState<Phase>('defend');
  const list = useMemo(() => preview(home, away, phase), [home, away, phase]);
  const drag = useRef<{ p: Pos; at: Vec } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !view) return;
    const ctx = c.getContext('2d')!;
    drawPitch(ctx, view);
    // ゾーン別の人数
    const z = zoneText(list);
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    z.forEach((n, i) => {
      const cx = (cols[i] + cols[i + 1]) / 2;
      const x = sx(view, cx, view.portrait ? 6 : 4);
      const y = sy(view, cx, view.portrait ? 6 : 4);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath();
      ctx.roundRect(x - 26, y - 11, 52, 22, 6);
      ctx.fill();
      ctx.fillStyle = n[0] > n[1] ? '#7CF0B2' : n[0] < n[1] ? '#FFA494' : '#fff';
      ctx.fillText(`${n[0]} : ${n[1]}`, x, y + 0.5);
    });
    for (const p of list) {
      const d = drag.current?.p.id === p.id ? drag.current.at : p.at;
      drawDot(ctx, view, {
        x: d.x, y: d.y, color: p.team === 0 ? home.color : away.color, label: String(p.number), ring: drag.current?.p.id === p.id,
      });
    }
  }, [list, view, home.color, away.color, tick, canvas]);

  const hit = (e: React.PointerEvent) => {
    if (!view || !editable) return null;
    const r = canvas.current!.getBoundingClientRect();
    const at = toPitch(view, e.clientX - r.left, e.clientY - r.top);
    let best: Pos | null = null;
    let bd = 4.5;
    for (const p of list) {
      if (p.team !== 0 || p.role === 'gk') continue;
      const d = Math.hypot(p.at.x - at.x, p.at.y - at.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, at } : null;
  };

  return (
    <div>
      <div ref={holder} className="pitch-frame">
        <canvas
          ref={canvas}
          aria-label="両チームの配置図"
          onPointerDown={(e) => {
            const h = hit(e);
            if (h) {
              drag.current = h;
              (e.target as Element).setPointerCapture(e.pointerId);
              setTick((t) => t + 1);
            }
          }}
          onPointerMove={(e) => {
            if (!drag.current || !view) return;
            const r = canvas.current!.getBoundingClientRect();
            const at = toPitch(view, e.clientX - r.left, e.clientY - r.top);
            drag.current.at = { x: Math.max(1, Math.min(PITCH_W - 1, at.x)), y: Math.max(1, Math.min(PITCH_H - 1, at.y)) };
            setTick((t) => t + 1);
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (!d || !onOffset) return;
            const t = home.tactics;
            const old = t.offsets?.[d.p.slot] ?? { x: 0, y: 0 };
            onOffset({
              ...t,
              offsets: { ...t.offsets, [d.p.slot]: { x: old.x + d.at.x - d.p.at.x, y: old.y + d.at.y - d.p.at.y } },
            });
          }}
        />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="seg" role="group" aria-label="局面" style={{ flex: '0 0 220px' }}>
          <button className={phase === 'defend' ? 'on' : ''} onClick={() => setPhase('defend')}>守備時の形</button>
          <button className={phase === 'attack' ? 'on' : ''} onClick={() => setPhase('attack')}>攻撃時の形</button>
        </div>
        {editable && home.tactics.offsets && Object.keys(home.tactics.offsets).length > 0 && (
          <button className="chip" onClick={() => onOffset?.({ ...home.tactics, offsets: undefined })}>配置の調整を戻す</button>
        )}
        <span className="muted small">上の数字は自陣・中盤・敵陣の人数(あなた : 相手)。{editable ? '選手はドラッグで動かせます。' : ''}</span>
      </div>
    </div>
  );
}
