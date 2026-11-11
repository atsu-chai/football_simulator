import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATIONS, ROLE_LABEL } from '../../data/formations';
import { explain } from '../../engine/analysis';
import { diagnose, Finding } from '../../engine/diagnosis';
import { STAGE_KEYS } from '../../data/stages';
import { RewardPanel } from '../components/Career';
import { Outcome } from '../../game/progress';
import { MatchEvent, MatchState, PITCH_W } from '../../engine/types';
import { drawBallAt, drawDot, drawPitch, sx, sy } from '../../render/pitch';
import { StatsTable } from '../components/StatsTable';
import { usePitchCanvas } from '../components/usePitchCanvas';
import { MatchPlan } from '../store';

function ShotMap({ m }: { m: MatchState }) {
  const { holder, canvas, view } = usePitchCanvas(320);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !view) return;
    const ctx = c.getContext('2d')!;
    drawPitch(ctx, view);
    for (const s of m.shots) {
      const abs = s.team === 0 ? { x: s.x, y: s.y } : { x: PITCH_W - s.x, y: 68 - s.y };
      const x = sx(view, abs.x, abs.y);
      const y = sy(view, abs.x, abs.y);
      const r = 3 + s.xg * 14;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = s.outcome === 'goal' ? '#fff' : `${m.cfg.teams[s.team].color}cc`;
      ctx.fill();
      ctx.strokeStyle = m.cfg.teams[s.team].color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [m, view, canvas]);
  return <div ref={holder} className="pitch-frame"><canvas ref={canvas} aria-label="シュートマップ" /></div>;
}

function PassNetwork({ m }: { m: MatchState }) {
  const { holder, canvas, view } = usePitchCanvas(320);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !view) return;
    const ctx = c.getContext('2d')!;
    drawPitch(ctx, view);
    const s = m.stats[0];
    const pos = s.posSum.map((p) => ({ x: p.x / Math.max(1, p.n), y: p.y / Math.max(1, p.n) }));
    const links = Object.entries(s.links);
    const max = Math.max(1, ...links.map(([, n]) => n));
    for (const [k, n] of links) {
      const [a, b] = k.split('-').map(Number);
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + (n / max) * 0.75})`;
      ctx.lineWidth = 0.6 + (n / max) * 5;
      ctx.beginPath();
      ctx.moveTo(sx(view, pos[a].x, pos[a].y), sy(view, pos[a].x, pos[a].y));
      ctx.lineTo(sx(view, pos[b].x, pos[b].y), sy(view, pos[b].x, pos[b].y));
      ctx.stroke();
    }
    m.players.filter((p) => p.team === 0).forEach((p) => {
      drawDot(ctx, view, { ...pos[p.slot], color: m.cfg.teams[0].color, label: String(p.number) });
    });
  }, [m, view, canvas]);
  return <div ref={holder} className="pitch-frame"><canvas ref={canvas} aria-label="パスネットワーク" /></div>;
}

function Replay({ m, goal }: { m: MatchState; goal: MatchEvent }) {
  const { holder, canvas, view } = usePitchCanvas(360);
  const frames = useMemo(() => {
    const end = Math.round(goal.t * 10);
    return m.frames_rec.slice(Math.max(0, end - 100), end);
  }, [m, goal]);
  const raf = useRef(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !view || frames.length < 2) return;
    const ctx = c.getContext('2d')!;
    const start = performance.now();
    const n = m.players.length * 2;
    const draw = (now: number) => {
      const f = ((now - start) / 1000) * 12;
      const i = Math.floor(f) % frames.length;
      const j = Math.min(frames.length - 1, i + 1);
      const a = f - Math.floor(f);
      const A = frames[i];
      const B = frames[j];
      const near = Math.hypot(A[n] - B[n], A[n + 1] - B[n + 1]) < 8;
      const mix = (k: number) => (near ? A[k] + (B[k] - A[k]) * a : A[k]);
      drawPitch(ctx, view);
      m.players.forEach((p, k) => {
        drawDot(ctx, view, { x: mix(k * 2), y: mix(k * 2 + 1), color: m.cfg.teams[p.team].color, label: String(p.number) });
      });
      drawBallAt(ctx, view, { x: mix(n), y: mix(n + 1) }, A[n + 2]);
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [view, frames, m, canvas]);
  return <div ref={holder} className="pitch-frame"><canvas ref={canvas} aria-label="ゴールのリプレイ" /></div>;
}

function Diagnosis({ items, title }: { items: Finding[]; title: string }) {
  return (
    <div className="panel diag">
      <h3>{title}</h3>
      {items.map((f) => (
        <div key={f.title} className={`finding ${f.ok ? 'ok' : 'bad'}`}>
          <div className="finding-title"><span className="mark" aria-hidden>{f.ok ? '✓' : '✕'}</span>{f.title}</div>
          {!f.ok && <p className="small">{f.detail}</p>}
          {f.fix && <p className="small fix">直し方: {f.fix}</p>}
        </div>
      ))}
    </div>
  );
}

export function Result({ plan, m, stars, retry, next, home, outcome }: {
  outcome?: Outcome;
  plan: MatchPlan;
  m: MatchState;
  stars: number;
  retry: () => void;
  next?: () => void;
  home: () => void;
}) {
  const won = m.score[0] > m.score[1];
  const stage = plan.stage;
  const lines = explain(m, 0);
  const goals = m.events.filter((e) => e.type === 'goal');
  const [goalIdx, setGoalIdx] = useState(goals.length ? 0 : -1);
  const [showAnswer, setShowAnswer] = useState(false);
  const verdict = won ? '勝利' : m.score[0] === m.score[1] ? '引き分け' : '敗戦';
  const diag = useMemo(() => diagnose(m, stage ? STAGE_KEYS[stage.id] : []), [m, stage]);
  return (
    <div className="wrap">
      <div className="result-head">
        <div className="muted">{plan.home.short} vs {plan.away.short}</div>
        <div className="big">{m.score[0]} - {m.score[1]}</div>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{verdict}</div>
        {stage && <div className="stars" style={{ fontSize: 22 }} aria-label={`星 ${stars} 個`}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>}
      </div>
      {outcome && <div className="reward-top"><RewardPanel outcome={outcome} /></div>}
      <div className="two">
        <div>
          {!won && diag.bad.length > 0 && <Diagnosis title="どこが悪かったか" items={diag.bad} />}
          {won && diag.bad.length > 0 && <Diagnosis title="さらに良くするには" items={diag.bad.slice(0, 2)} />}
          {diag.good.length > 0 && <Diagnosis title="できていたこと" items={diag.good} />}
          <div className="panel">
            <h3>試合の数字から</h3>
            <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
          {stage && (
            <div className="panel">
              <h3>目標</h3>
              <div className={`objective ${won ? 'done' : ''}`}><span className="mark">{won ? '★' : '☆'}</span>勝利する</div>
              {stage.objectives.map((o) => {
                const ok = won && o.check(m);
                return <div key={o.id} className={`objective ${ok ? 'done' : ''}`}><span className="mark">{ok ? '★' : '☆'}</span>{o.label}</div>;
              })}
              {won && <p className="lesson" style={{ marginTop: 12 }}>{stage.lessonWin}</p>}
              {!won && <p className="muted small" style={{ marginTop: 10 }}>次はヒントを開いて、相手の弱点に合わせて設定を変えてみましょう。</p>}
              {won && !showAnswer && <button className="chip" style={{ marginTop: 10 }} onClick={() => setShowAnswer(true)}>模範の設定を見る</button>}
              {won && showAnswer && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  {stage.solution.formation} / ビルドアップ {stage.solution.buildUp} / プレス {stage.solution.pressHeight} / ライン {stage.solution.lineHeight} / 幅 {stage.solution.width} / 切替 {stage.solution.onLoss}・{stage.solution.onWin}
                  {stage.solution.roles ? ` / 役割 ${Object.entries(stage.solution.roles).map(([k, r]) => `${FORMATIONS[stage.solution.formation][+k].role}→${ROLE_LABEL[r!]}`).join('、')}` : ''}
                </p>
              )}
            </div>
          )}
          {goalIdx >= 0 && (
            <div className="panel">
              <h3>ゴールのリプレイ</h3>
              <div className="row" style={{ marginBottom: 8 }}>
                {goals.map((g, i) => (
                  <button key={i} className={`chip ${goalIdx === i ? 'on' : ''}`} onClick={() => setGoalIdx(i)}>{g.minute}分 {m.cfg.teams[g.team!].short}</button>
                ))}
              </div>
              <Replay key={goalIdx} m={m} goal={goals[goalIdx]} />
            </div>
          )}
          <div className="panel"><h3>シュートマップ(円が大きいほど xG が高い)</h3><ShotMap m={m} /></div>
          <div className="panel"><h3>パスネットワーク(あなたのチーム)</h3><PassNetwork m={m} /></div>
        </div>
        <div>
          <div className="panel"><h3>スタッツ</h3><StatsTable m={m} /></div>
          <div className="panel" style={{ display: 'grid', gap: 8 }}>
            {next && won && <button className="btn primary" onClick={next}>次のステージへ</button>}
            <button className={`btn ${won ? '' : 'primary'}`} onClick={retry}>もう一度挑戦</button>
            <button className="btn" onClick={home}>メニューへ戻る</button>
          </div>
        </div>
      </div>
    </div>
  );
}
