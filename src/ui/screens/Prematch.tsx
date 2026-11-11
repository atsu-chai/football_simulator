import { useState } from 'react';
import { Tactics } from '../../engine/types';
import { Board } from '../components/Board';
import { TacticsPanel } from '../components/TacticsPanel';
import { MatchPlan } from '../store';
import { QuizCard } from '../components/Career';
import { quizFor } from '../../game/content';
import { chapterOf, styleOf } from '../../data/story';

export function Prematch({ plan, back, kick, quizAnswered, onQuiz }: {
  plan: MatchPlan;
  back: () => void;
  kick: (t: Tactics) => void;
  quizAnswered?: boolean;
  onQuiz?: (stage: number, correct: boolean) => void;
}) {
  const [t, setT] = useState<Tactics>(plan.initial);
  const [hintN, setHintN] = useState(0);
  const [weak, setWeak] = useState(false);
  const storyOpp = plan.story ? chapterOf(plan.story.chapter).opponents[plan.story.match] : undefined;
  const stage = plan.stage;
  const home = { ...plan.home, tactics: t };
  const quiz = stage ? quizFor(stage.id) : undefined;
  return (
    <div className="wrap">
      <div className="topbar">
        <button className="back" onClick={back}>戻る</button>
        <h2>{plan.title}</h2>
        <button className="btn primary" onClick={() => kick(t)}>{plan.mode === 'watch' ? '観戦する' : 'キックオフ'}</button>
      </div>
      <div className="two">
        <div>
          {quiz && onQuiz && <QuizCard quiz={quiz} answered={quizAnswered} onAnswer={(c) => onQuiz(quiz.stage, c)} />}
          {plan.daily && (
            <div className="panel daily-rule">
              <h3>今日のチャレンジ</h3>
              <p>条件: <b>{plan.daily.rule.label}</b>。達成すると、この試合の XP が2倍になります(1日1回)。</p>
            </div>
          )}
          {storyOpp && (
            <div className="panel">
              <h3>スカウティング: {storyOpp.name}({plan.away.tactics.formation})</h3>
              <p>{styleOf(storyOpp.style).scouting}</p>
              {weak
                ? <p className="small fix" style={{ marginTop: 6 }}>弱点: {styleOf(storyOpp.style).weakness}</p>
                : <button className="chip" style={{ marginTop: 8 }} onClick={() => setWeak(true)}>弱点のヒントを見る</button>}
            </div>
          )}
          <Board home={home} away={plan.away} editable={plan.editable} onOffset={setT} />
          {stage && (
            <>
              <div className="panel" style={{ marginTop: 12 }}>
                <h3>今回のテーマ: {stage.concept}</h3>
                <p>{stage.brief}</p>
              </div>
              <div className="panel">
                <h3>スカウティング: {stage.opponent.name}({stage.opponent.tactics.formation})</h3>
                <ul>{stage.scouting.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div className="panel">
                <h3>追加目標</h3>
                <ul>{stage.objectives.map((o) => <li key={o.id}>{o.label}</li>)}</ul>
                <h3 style={{ marginTop: 12 }}>ヒント</h3>
                {stage.hints.slice(0, hintN).map((h) => <p key={h} className="small" style={{ marginBottom: 4 }}>{h}</p>)}
                {hintN < stage.hints.length
                  ? <button className="chip" onClick={() => setHintN(hintN + 1)}>ヒントを見る({hintN}/{stage.hints.length})</button>
                  : null}
              </div>
            </>
          )}
          {plan.note && <div className="panel" style={{ marginTop: 12 }}><p>{plan.note}</p></div>}
        </div>
        <div className="panel">
          {plan.editable
            ? <TacticsPanel t={t} onChange={setT} formationLocked={!!plan.daily?.rule.lockFormation} />
            : <p className="muted">このモードでは両チームとも自動で戦います。試合中のオーバーレイと解説に注目してください。</p>}
        </div>
      </div>
    </div>
  );
}
