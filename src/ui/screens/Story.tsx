import { useState } from 'react';
import { CHAPTERS, chapterOf, roundLabel, styleOf } from '../../data/story';
import { leagueStatus, MatchResult, points, StoryState, storyFinished } from '../../game/story';
import { tactic } from '../../data/formations';

const MARK: Record<MatchResult, string> = { W: '勝', D: '分', L: '負' };

export function StoryHub({ story, back, play, rename, restart }: {
  story: StoryState;
  back: () => void;
  play: () => void;
  rename: (name: string) => void;
  restart: () => void;
}) {
  const [name, setName] = useState(story.club);
  const finished = storyFinished(story);
  const c = finished ? null : chapterOf(story.chapter);
  const i = story.results.length;
  const nextOpp = c?.opponents[i];
  const st = c && c.format === 'league' ? leagueStatus(c, story.results) : null;

  return (
    <div className="wrap">
      <div className="topbar"><button className="back" onClick={back}>戻る</button><h2>ストーリー: JFL から世界へ</h2></div>

      <ol className="ladder" aria-label="これまでの道のり">
        {CHAPTERS.map((ch) => {
          const state = ch.id < story.chapter ? 'done' : ch.id === story.chapter ? 'now' : 'locked';
          return (
            <li key={ch.id} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="league">{ch.league}</span>
              <span className="small">{state === 'done' ? '突破' : state === 'now' ? '挑戦中' : ''}</span>
            </li>
          );
        })}
      </ol>

      {finished && (
        <div className="panel story-intro champion">
          <span className="kicker">世界一 {story.titles > 1 ? `× ${story.titles}` : ''}</span>
          <h3>{story.club} は世界の頂点に立った</h3>
          <p>{CHAPTERS[CHAPTERS.length - 1].clear}</p>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={restart}>もう一度 JFL から始める</button>
        </div>
      )}

      {c && (
        <div className="two">
          <div>
            <div className="panel story-intro">
              <span className="kicker">第{c.id}章 ・ {c.league}{(story.attempts[c.id] ?? 1) > 1 ? ` ・ ${story.attempts[c.id]}回目の挑戦` : ''}</span>
              <h3>{c.title}</h3>
              <p>{c.intro}</p>
              <p className="small muted" style={{ marginTop: 8 }}>
                {c.format === 'league'
                  ? `全${c.opponents.length}試合で勝ち点 ${c.target} 以上なら次へ進めます(勝ち3・分け1)。届かなければシーズンをやり直します。`
                  : `負けたら終わりの勝ち抜き戦(全${c.opponents.length}試合)。引き分けは PK 戦で決着。敗退したら大会をやり直します。`}
              </p>
            </div>

            <div className="panel">
              <h3>{c.format === 'league' ? '日程と結果' : 'トーナメント'}</h3>
              <ul className="fixtures">
                {c.opponents.map((o, k) => {
                  const r = story.results[k];
                  return (
                    <li key={o.name} className={k === i ? 'next' : ''}>
                      <span className="round">{roundLabel(c, k)}</span>
                      <span className="opp"><span className="swatch" style={{ background: o.color }} aria-hidden />{o.name}</span>
                      <span className="form muted small">{tactic(styleOf(o.style).tactics).formation}</span>
                      <span className={`res ${r ?? ''}`}>{r ? MARK[r] : k === i ? '次' : ''}</span>
                    </li>
                  );
                })}
              </ul>
              {st && (
                <p className="small" style={{ marginTop: 10 }}>
                  勝ち点 <b>{points(story.results)}</b> / 目標 {st.target}
                  {st.secured ? ' ・ 達成!残りの試合も戦えます' : ` ・ 残り${st.left}試合であと ${st.target - st.pts}`}
                </p>
              )}
            </div>
          </div>

          <div>
            {nextOpp && (
              <div className="panel next-match">
                <span className="kicker">{roundLabel(c, i)}</span>
                <h3>vs {nextOpp.name}</h3>
                <p className="small">{styleOf(nextOpp.style).scouting}</p>
                <p className="small muted" style={{ marginTop: 6 }}>相手の地力 {strength(nextOpp.skill, c.mySkill)}</p>
                <button className="btn primary" style={{ marginTop: 12, width: '100%' }} onClick={play}>試合の準備へ</button>
              </div>
            )}
            <div className="panel">
              <h3>クラブ</h3>
              <label className="small muted" htmlFor="club-name">クラブ名</label>
              <div className="row" style={{ marginTop: 4 }}>
                <input
                  id="club-name"
                  className="text-input"
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => rename(name.trim() || story.club)}
                />
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                昇格するたびにクラブの地力は上がりますが、相手も強く、戦い方も多彩になります。相手の型を見抜いて戦術を変えることが、勝ち上がる鍵です。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function strength(opp: number, me: number) {
  const d = opp - me;
  if (d < -0.02) return '格下';
  if (d < 0.03) return '互角';
  if (d < 0.08) return 'やや格上';
  return '格上';
}
