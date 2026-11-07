import { useCallback, useEffect, useRef, useState } from 'react';
import { gameMinute } from '../../engine/events';
import { createMatch, resume, setTactics, step } from '../../engine/match';
import { BASE_PLAYBACK, MatchEvent, MatchState, OverlayId, TICK, Tactics, Vec } from '../../engine/types';
import { drawOver, drawUnder, OVERLAY_INFO } from '../../render/overlays';
import { drawMatch, drawPitch, sx, sy, toPitch } from '../../render/pitch';
import { StatsTable } from '../components/StatsTable';
import { TacticsPanel } from '../components/TacticsPanel';
import { usePitchCanvas } from '../components/usePitchCanvas';
import { MatchPlan } from '../store';

type Tab = 'feed' | 'tactics' | 'stats';

export function MatchScreen({ plan, autoPause, setAutoPause, finish, quit }: {
  plan: MatchPlan;
  autoPause: boolean;
  setAutoPause: (v: boolean) => void;
  finish: (m: MatchState) => void;
  quit: () => void;
}) {
  const matchRef = useRef<MatchState | null>(null);
  if (!matchRef.current) {
    matchRef.current = createMatch({
      teams: [plan.home, plan.away],
      seed: plan.seed,
      record: true,
      coachSide: 0,
      coachHints: plan.coachHints ?? plan.stage?.coachHints,
      script: plan.stage?.script ? { side: 1, phases: plan.stage.script } : undefined,
    });
  }
  const m = matchRef.current;
  // 開発時のみ、自動確認から試合を進められるようにする
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tl = { m, step, resume };
  const { holder, canvas, viewRef } = usePitchCanvas(640);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [overlays, setOverlays] = useState<Set<OverlayId>>(new Set());
  const [tab, setTab] = useState<Tab>('feed');
  const [halftime, setHalftime] = useState(false);
  const [toast, setToast] = useState('');
  const [t, setT] = useState<Tactics>(m.tactics[0]);
  const [, force] = useState(0);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const overlayRef = useRef(overlays);
  overlayRef.current = overlays;
  const autoRef = useRef(autoPause);
  autoRef.current = autoPause;
  const dragRef = useRef<{ id: number; at: Vec } | null>(null);
  const eventsSeen = useRef(m.events.length);

  const showToast = useCallback((s: string) => {
    setToast(s);
    window.setTimeout(() => setToast((c) => (c === s ? '' : c)), 2600);
  }, []);

  const onEvent = useCallback((e: MatchEvent) => {
    if (e.type === 'goal') showToast(e.text);
    if (e.type === 'tactic') {
      showToast(e.text);
      if (autoRef.current && plan.mode !== 'watch') {
        setPaused(true);
        setTab('feed');
      }
    }
    if (e.type === 'coach' && e.key && autoRef.current && plan.mode !== 'watch') {
      setPaused(true);
      setTab('feed');
      if (e.overlay) setOverlays((o) => new Set(o).add(e.overlay!));
    }
  }, [plan.mode, showToast]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAt = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const running = !pausedRef.current && !m.atHalftime && !m.finished;
      if (running) {
        acc += dt * speedRef.current * BASE_PLAYBACK;
        while (acc >= TICK && !m.finished && !m.atHalftime && !pausedRef.current) {
          acc -= TICK;
          step(m);
          while (eventsSeen.current < m.events.length) onEvent(m.events[eventsSeen.current++]);
        }
        if (m.atHalftime) setHalftime(true);
        if (m.finished) finish(m);
      }
      const v = viewRef.current;
      const c = canvas.current;
      if (v && c) {
        const ctx = c.getContext('2d')!;
        const a = running ? Math.min(1, acc / TICK) : 1;
        drawPitch(ctx, v);
        drawUnder(ctx, v, m, overlayRef.current);
        drawMatch(ctx, v, m, a, dragRef.current);
        drawOver(ctx, v, m, overlayRef.current);
        if (pausedRef.current) {
          ctx.fillStyle = 'rgba(255,255,255,.8)';
          ctx.font = '600 12px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('一時停止中', sx(v, 2, 3), sy(v, 2, 3));
        }
      }
      if (now - uiAt > 250) {
        uiAt = now;
        force((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [m, canvas, viewRef, finish, onEvent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'SELECT') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const applyT = (n: Tactics) => {
    setT(n);
    setTactics(m, 0, n);
    m.events.push({ t: m.t, minute: gameMinute(m), type: 'tactic', team: 0, text: '戦術を変更しました' });
    eventsSeen.current = m.events.length;
  };

  const toggleOverlay = (id: OverlayId) => {
    setOverlays((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const editable = plan.mode !== 'watch';
  const pos = (e: React.PointerEvent) => {
    const v = viewRef.current!;
    const r = canvas.current!.getBoundingClientRect();
    return toPitch(v, e.clientX - r.left, e.clientY - r.top);
  };

  const feed = [...m.events].filter((e) => e.type !== 'shot' && e.type !== 'save' && e.type !== 'corner').reverse().slice(0, 40);
  const min = gameMinute(m);

  return (
    <div className="wrap" style={{ paddingTop: 10 }}>
      <div className="two">
        <div>
          <div className="scorebar">
            <div className="team"><i className="swatch" style={{ background: plan.home.color }} />{plan.home.short}</div>
            <div>
              <div className="score">{m.score[0]} - {m.score[1]}</div>
              <div className="clock">{min}分</div>
              <div className="energy" title="チームの体力。プレスで減り、減ると走る速さが落ちる" aria-label={`体力 ${Math.round(m.energy[0] * 100)} 対 ${Math.round(m.energy[1] * 100)}`}>
                <i style={{ width: `${m.energy[0] * 100}%`, background: plan.home.color }} />
                <span>体力</span>
                <i style={{ width: `${m.energy[1] * 100}%`, background: plan.away.color }} />
              </div>
            </div>
            <div className="team right">{plan.away.short}<i className="swatch" style={{ background: plan.away.color, marginLeft: 6, marginRight: 0 }} /></div>
          </div>
          <div ref={holder} className="pitch-frame canvas-holder">
            <canvas
              ref={canvas}
              aria-label="試合のピッチ"
              onPointerDown={(e) => {
                if (!paused || !editable) return;
                const at = pos(e);
                let best = -1;
                let bd = 4.5;
                for (const p of m.players) {
                  if (p.team !== 0 || p.role === 'gk') continue;
                  const d = Math.hypot(p.pos.x - at.x, p.pos.y - at.y);
                  if (d < bd) { bd = d; best = p.id; }
                }
                if (best >= 0) {
                  dragRef.current = { id: best, at };
                  (e.target as Element).setPointerCapture(e.pointerId);
                }
              }}
              onPointerMove={(e) => { if (dragRef.current) dragRef.current.at = pos(e); }}
              onPointerUp={() => {
                const d = dragRef.current;
                dragRef.current = null;
                if (!d) return;
                const p = m.players[d.id];
                const old = t.offsets?.[p.slot] ?? { x: 0, y: 0 };
                applyT({ ...t, offsets: { ...t.offsets, [p.slot]: { x: old.x + d.at.x - p.pos.x, y: old.y + d.at.y - p.pos.y } } });
                showToast(`#${p.number} の基準位置を調整しました`);
              }}
            />
            {toast && <div className="toast" role="status">{toast}</div>}
          </div>
          <div className="controls">
            <button className="btn primary" onClick={() => setPaused((p) => !p)} style={{ minWidth: 92 }}>
              {paused ? '再開' : '一時停止'}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} className={`chip ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>{s}倍</button>
            ))}
            <span className="spacer" />
            {editable && <label className="small muted row" style={{ gap: 4 }}>
              <input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} />
              重要な局面で止める
            </label>}
          </div>
          <div className="controls" style={{ marginTop: 0 }}>
            {(Object.keys(OVERLAY_INFO) as OverlayId[]).map((id) => (
              <button key={id} className={`chip ${overlays.has(id) ? 'on' : ''}`} aria-pressed={overlays.has(id)} title={OVERLAY_INFO[id].desc} onClick={() => toggleOverlay(id)}>
                {OVERLAY_INFO[id].label}
              </button>
            ))}
          </div>
          {overlays.size > 0 && (
            <p className="muted small">{[...overlays].map((o) => OVERLAY_INFO[o].desc).join(' / ')}</p>
          )}
        </div>

        <div className="panel">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>解説</button>
            {editable && <button role="tab" aria-selected={tab === 'tactics'} className={tab === 'tactics' ? 'on' : ''} onClick={() => setTab('tactics')}>戦術</button>}
            <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>スタッツ</button>
          </div>
          {tab === 'feed' && (
            <div className="feed">
              {feed.map((e, i) => (
                <div key={`${e.t}-${i}`} className={`item ${e.type === 'coach' ? 'coach' : ''} ${e.key ? 'key' : ''} ${e.type === 'goal' ? 'goal' : ''}`}>
                  <span className="min">{e.minute}'</span>{e.text}
                  {e.overlay && <button className="show" onClick={() => setOverlays((o) => new Set(o).add(e.overlay!))}>{OVERLAY_INFO[e.overlay].label}を見る</button>}
                </div>
              ))}
            </div>
          )}
          {tab === 'tactics' && editable && (
            <div style={{ maxHeight: 620, overflowY: 'auto' }}>
              <p className="muted small" style={{ marginBottom: 8 }}>変更はすぐ反映されます。一時停止中は味方選手をドラッグして基準位置を調整できます。</p>
              <TacticsPanel t={t} onChange={applyT} />
            </div>
          )}
          {tab === 'stats' && <StatsTable m={m} />}
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="back" onClick={quit}>試合をやめる</button>
      </div>

      {halftime && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-label="ハーフタイム">
            <h3>ハーフタイム {m.score[0]} - {m.score[1]}</h3>
            <StatsTable m={m} />
            <p className="muted small" style={{ margin: '8px 0 12px' }}>戦術は「戦術」タブから後半の前後どちらでも変えられます。</p>
            <div className="row">
              <button className="btn primary" onClick={() => { resume(m); setHalftime(false); }}>後半開始</button>
              {editable && (
                <button className="btn" onClick={() => { resume(m); setHalftime(false); setPaused(true); setTab('tactics'); }}>
                  戦術を調整して開始
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
