import { useState } from 'react';
import { CARDS, Quiz } from '../../game/content';
import { BADGES, licenseOf, Outcome, Progress } from '../../game/progress';

export function LicenseBar({ xp, compact }: { xp: number; compact?: boolean }) {
  const l = licenseOf(xp);
  return (
    <div className={`license ${compact ? 'compact' : ''}`}>
      <div className="license-row">
        <span className="license-badge" aria-hidden>{['D', 'C', 'B', 'A', 'S', 'P'][l.level]}</span>
        <div className="license-body">
          <div className="license-name">{l.name}</div>
          <div className="xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.ratio * 100)} aria-label="次のライセンスまでの進み具合">
            <i style={{ width: `${l.ratio * 100}%` }} />
          </div>
          <div className="small muted">{l.next ? `${xp} XP ・ ${l.next}まで あと ${l.toNext} XP` : `${xp} XP ・ 最上位ライセンス`}</div>
        </div>
      </div>
    </div>
  );
}

export function RewardPanel({ outcome }: { outcome: Outcome }) {
  const up = outcome.after.level > outcome.before.level;
  return (
    <div className="panel reward">
      {up && <div className="levelup" role="status">昇格! {outcome.after.name} を取得しました</div>}
      <h3>獲得 XP <span className="xp-total">+{outcome.xp}</span></h3>
      <ul className="reward-list">
        {outcome.rewards.map((r, i) => (
          <li key={i}><span>{r.label}</span><span className="xp">+{r.xp}</span></li>
        ))}
      </ul>
      <LicenseBar xp={outcome.next.xp} compact />
      {(outcome.newBadges.length > 0 || outcome.unlockedCards.length > 0 || outcome.masteredCards.length > 0) && (
        <div className="unlocks">
          {outcome.unlockedCards.map((s) => (
            <div key={`u${s}`} className="unlock card-unlock">戦術図鑑に「{CARDS.find((c) => c.stage === s)?.name}」を追加</div>
          ))}
          {outcome.masteredCards.map((s) => (
            <div key={`m${s}`} className="unlock card-master">「{CARDS.find((c) => c.stage === s)?.name}」をマスター</div>
          ))}
          {outcome.newBadges.map((b) => (
            <div key={b.id} className="unlock badge-new">実績「{b.name}」を解除: {b.hint}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 試合前のスカウティング予想。答えると正解と理由が出る。 */
export function QuizCard({ quiz, answered, onAnswer }: { quiz: Quiz; answered: boolean | undefined; onAnswer: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return (
    <div className="panel quiz">
      <h3>スカウティング予想 {answered === undefined && <span className="small muted">(正解で +30 XP)</span>}</h3>
      <p>{quiz.question}</p>
      <div className="quiz-choices">
        {quiz.choices.map((c, i) => {
          const state = !done ? '' : i === quiz.answer ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button
              key={c}
              className={`quiz-choice ${state}`}
              disabled={done}
              onClick={() => {
                setPicked(i);
                onAnswer(i === quiz.answer);
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
      {done && (
        <p className="small" style={{ marginTop: 8 }}>
          <b>{picked === quiz.answer ? '正解!' : '惜しい。'}</b> {quiz.why}
        </p>
      )}
      {!done && answered !== undefined && <p className="small muted" style={{ marginTop: 8 }}>前回は{answered ? '正解' : '不正解'}でした。もう一度考えてから試合に臨みましょう。</p>}
    </div>
  );
}

export function Codex({ progress, back }: { progress: Progress; back: () => void }) {
  const got = CARDS.filter((c) => (progress.stars[c.stage] ?? 0) > 0).length;
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>戦術図鑑 {got} / {CARDS.length}</h2></div>
      <p className="muted" style={{ marginBottom: 14 }}>ステージをクリアすると概念カードが手に入り、★3でマスターになります。</p>
      <div className="grid">
        {CARDS.map((c) => {
          const stars = progress.stars[c.stage] ?? 0;
          if (stars === 0) {
            return (
              <div key={c.stage} className="card locked concept">
                <span className="kicker">STAGE {c.stage}</span>
                <h3>???</h3>
                <span className="muted small">ステージ {c.stage} をクリアで入手</span>
              </div>
            );
          }
          return (
            <div key={c.stage} className={`card concept ${stars >= 3 ? 'mastered' : ''}`}>
              <span className="kicker">STAGE {c.stage} {stars >= 3 ? '・マスター' : ''}</span>
              <h3>{c.name}</h3>
              <p className="small">{c.summary}</p>
              <p className="small"><b>使いどころ</b> {c.use}</p>
              <p className="small muted"><b>対策</b> {c.counter}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Achievements({ progress, back }: { progress: Progress; back: () => void }) {
  const got = BADGES.filter((b) => progress.badges[b.id]).length;
  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>実績 {got} / {BADGES.length}</h2></div>
      <div className="grid">
        {BADGES.map((b) => {
          const at = progress.badges[b.id];
          return (
            <div key={b.id} className={`card badge ${at ? 'earned' : 'locked'}`}>
              <span className="kicker">{at ? '解除済み' : '未解除'}</span>
              <h3>{b.name}</h3>
              <span className="small muted">{b.hint}</span>
              {at && <span className="meta"><span>{new Date(at).toLocaleDateString('ja-JP')}</span></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
