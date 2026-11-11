import { useState } from 'react';
import { DEFAULT_TACTICS, FORMATION_IDS, tactic } from '../../data/formations';
import { Stage, STAGES } from '../../data/stages';
import { RealTeam, TEAMS } from '../../data/teams';
import { Tactics } from '../../engine/types';
import { Progress } from '../store';
import { LicenseBar } from '../components/Career';
import { CARDS } from '../../game/content';
import { BADGES } from '../../game/progress';

export function Home({ go, cleared, progress, daily }: {
  go: (s: 'stages' | 'teams' | 'free' | 'daily' | 'codex' | 'achievements') => void;
  cleared: number;
  progress: Progress;
  daily: { opponent: string; rule: string; done: boolean };
}) {
  return (
    <div className="wrap">
      <div className="hero">
        <h1>タクティクス・ラボ</h1>
        <p>あなたは監督です。相手の形を読み、配置と指示で有利を作り、22人の動きで答え合わせをしましょう。</p>
      </div>
      <div className="career">
        <LicenseBar xp={progress.xp} />
        <button className={`daily ${daily.done ? 'done' : ''}`} onClick={() => go('daily')}>
          <span className="kicker">今日のチャレンジ {progress.daily.streak > 0 ? `・${progress.daily.streak}日連続` : ''}</span>
          <h3>vs {daily.opponent}</h3>
          <span className="small muted">{daily.done ? '本日クリア済み。もう一度挑戦できます(XP 2倍は1日1回)' : `条件: ${daily.rule} ・ クリアで XP 2倍`}</span>
        </button>
      </div>
      <div className="mode-grid">
        <button className="mode" onClick={() => go('stages')}>
          <h3>ステージ</h3>
          <p>12の相手を順に攻略し、戦術の考え方を学ぶ。クリア {cleared} / {STAGES.length}</p>
        </button>
        <button className="mode" onClick={() => go('teams')}>
          <h3>名チームに学ぶ</h3>
          <p>実在の8チームの戦術を、知って、見て、使って、倒す。</p>
        </button>
        <button className="mode" onClick={() => go('free')}>
          <h3>自由対戦</h3>
          <p>好きな戦術どうしをぶつけて、自分の仮説を試す。</p>
        </button>
      </div>
      <div className="sub-links">
        <button className="btn" onClick={() => go('codex')}>戦術図鑑 {CARDS.filter((c) => (progress.stars[c.stage] ?? 0) > 0).length}/{CARDS.length}</button>
        <button className="btn" onClick={() => go('achievements')}>実績 {BADGES.filter((b) => progress.badges[b.id]).length}/{BADGES.length}</button>
      </div>
    </div>
  );
}

export function StageSelect({ progress, back, pick }: { progress: Progress; back: () => void; pick: (s: Stage) => void }) {
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>ステージ</h2></div>
      <div className="grid">
        {STAGES.map((s) => {
          const open = s.id === 1 || (progress.stars[s.id - 1] ?? 0) > 0;
          const stars = progress.stars[s.id] ?? 0;
          return (
            <button key={s.id} className={`card ${open ? '' : 'locked'}`} disabled={!open} onClick={() => pick(s)}>
              <span className="kicker">STAGE {s.id}</span>
              <h3>{s.title}</h3>
              <span className="muted small">{open ? s.concept : '前のステージをクリアで解放'}</span>
              <span className="meta">
                <span>{open ? `vs ${s.opponent.tactics.formation}` : ''}</span>
                <span className="stars" aria-label={`星 ${stars} 個`}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TeamList({ back, pick }: { back: () => void; pick: (t: RealTeam) => void }) {
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>名チームに学ぶ</h2></div>
      <div className="grid">
        {TEAMS.map((t) => (
          <button key={t.id} className="card" onClick={() => pick(t)}>
            <span className="kicker">{t.tag}</span>
            <h3>{t.name}</h3>
            <span className="muted small">{t.era}</span>
            <span className="meta"><span><i className="swatch" style={{ background: t.color }} />{t.tactics.formation}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TeamDetail({ team, back, start }: {
  team: RealTeam;
  back: () => void;
  start: (mode: 'watch' | 'use' | 'face', rival: RealTeam) => void;
}) {
  const others = TEAMS.filter((t) => t.id !== team.id);
  const [rivalId, setRivalId] = useState(others[0].id);
  const rival = TEAMS.find((t) => t.id === rivalId)!;
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>{team.name} {team.era}</h2></div>
      <div className="two">
        <div>
          <div className="panel">
            <h3>{team.tag} / {team.tactics.formation}</h3>
            <p>{team.summary}</p>
            <p className="muted" style={{ marginTop: 8 }}>{team.context}</p>
          </div>
          <div className="panel">
            <h3>戦術の原則</h3>
            {team.principles.map((p) => (
              <div key={p.title} style={{ marginBottom: 10 }}>
                <b>{p.title}</b>
                <p className="muted">{p.text}</p>
              </div>
            ))}
          </div>
          <div className="panel"><h3>弱点</h3><p>{team.weakness}</p></div>
          <div className="panel">
            <h3>再現の注意</h3>
            <p className="muted small">{team.simNote}</p>
            <h3 style={{ marginTop: 12 }}>参考資料</h3>
            <ul className="small">
              {team.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
            </ul>
          </div>
        </div>
        <div className="panel">
          <h3>試してみる</h3>
          <div className="field">
            <label htmlFor="rival">比較する相手(見る/使うで使用)</label>
            <select id="rival" value={rivalId} onChange={(e) => setRivalId(e.target.value)}>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name} {t.era}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="btn" onClick={() => start('watch', rival)}>見る: 解説付きで観戦</button>
            <button className="btn" onClick={() => start('use', rival)}>使う: このチームを指揮</button>
            <button className="btn primary" onClick={() => start('face', rival)}>倒す: このチームに挑戦</button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>「倒す」では、弱点を突く戦術を自分で組んで挑みます。</p>
        </div>
      </div>
    </div>
  );
}

export function FreeSetup({ back, start }: { back: () => void; start: (home: Tactics, awayTeam: RealTeam | null, awayFormation: Tactics) => void }) {
  const [opp, setOpp] = useState('custom');
  const [formation, setFormation] = useState<Tactics['formation']>('4-4-2');
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>自由対戦</h2></div>
      <div className="panel" style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="opp">相手</label>
          <select id="opp" value={opp} onChange={(e) => setOpp(e.target.value)}>
            <option value="custom">標準チーム(形を選ぶ)</option>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name} {t.era}</option>)}
          </select>
        </div>
        {opp === 'custom' && (
          <div className="field">
            <label htmlFor="oppf">相手のフォーメーション</label>
            <select id="oppf" value={formation} onChange={(e) => setFormation(e.target.value as Tactics['formation'])}>
              {FORMATION_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        <button
          className="btn primary"
          onClick={() => start(DEFAULT_TACTICS, TEAMS.find((t) => t.id === opp) ?? null, tactic({ formation }))}
        >
          戦術ボードへ
        </button>
      </div>
    </div>
  );
}
