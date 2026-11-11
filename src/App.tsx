import { useCallback, useRef, useState } from 'react';
import { DEFAULT_TACTICS } from './data/formations';
import { myTeamBase, MY_COLOR, Stage, STAGE_KEYS, STAGES } from './data/stages';
import { RealTeam, teamSetup, TEAMS } from './data/teams';
import { answerQuiz, applyMatch, dailyFor, managerialImpact, nextFailedKeys, Outcome, todayString } from './game/progress';
import { Achievements, Codex } from './ui/components/Career';
import { MatchState, Tactics, TeamSetup } from './engine/types';
import { FreeSetup, Home, StageSelect, TeamDetail, TeamList } from './ui/screens/Menus';
import { MatchScreen } from './ui/screens/MatchScreen';
import { Prematch } from './ui/screens/Prematch';
import { Result } from './ui/screens/Result';
import { loadProgress, MatchPlan, Progress, saveProgress } from './ui/store';

type Screen =
  | { name: 'home' }
  | { name: 'stages' }
  | { name: 'teams' }
  | { name: 'team'; team: RealTeam }
  | { name: 'free' }
  | { name: 'codex' }
  | { name: 'achievements' }
  | { name: 'prematch'; plan: MatchPlan; from: Screen }
  | { name: 'match'; plan: MatchPlan; from: Screen }
  | { name: 'result'; plan: MatchPlan; m: MatchState; stars: number; from: Screen; outcome: Outcome };

const newSeed = () => Math.floor(Math.random() * 1e9);

/** デイリーチャレンジの相手候補(ステージの相手と名チーム)。 */
const DAILY_OPPONENTS: TeamSetup[] = [...STAGES.map((s) => s.opponent), ...TEAMS.map((t) => teamSetup(t))];

/** 色が近いチームどうしは、見分けられるように相手側を替える。 */
function distinct(a: TeamSetup, b: TeamSetup): TeamSetup {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [hex(a.color), hex(b.color)];
  const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  return d < 130 ? { ...b, color: '#F4F1E8' } : b;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const update = useCallback((p: Progress) => {
    setProgress(p);
    saveProgress(p);
  }, []);

  const stagePlan = (s: Stage): MatchPlan => ({
    mode: 'stage', title: `STAGE ${s.id} ${s.title}`, stage: s, home: myTeamBase(DEFAULT_TACTICS), away: s.opponent,
    editable: true, initial: DEFAULT_TACTICS, seed: newSeed(),
  });

  const screenRef = useRef(screen);
  screenRef.current = screen;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  /** 試合終了の処理。報酬の計算は1試合につき1回だけ行う。 */
  const finish = useCallback((m: MatchState) => {
    const cur = screenRef.current;
    if (cur.name !== 'match') return;
    const { plan, from } = cur;
    const p = progressRef.current;
    const won = m.score[0] > m.score[1];
    const stage = plan.stage;
    let stars = 0;
    if (stage && won) stars = 1 + stage.objectives.filter((o) => o.check(m)).length;

    // 攻略の鍵: 負けたら足りなかったものを覚え、次に全部直して勝てば「敗因を克服」
    const keys = stage ? STAGE_KEYS[stage.id] ?? [] : [];
    const failing = keys.filter((k) => !k.check(m.tactics[0], m)).map((k) => k.label);
    const prevFailed = stage ? p.failedKeys[stage.id] : undefined;
    const overcame = !!(stage && won && prevFailed && prevFailed.length > 0 && prevFailed.every((l) => !failing.includes(l)));

    const outcome = applyMatch(p, {
      mode: plan.mode,
      stageId: stage?.id,
      m,
      stars,
      overcame,
      managerial: plan.editable ? managerialImpact(m) : null,
      dailyCleared: !!(plan.daily && won && plan.daily.rule.check(m)),
    });
    if (stage) outcome.next.failedKeys = nextFailedKeys(p.failedKeys, stage.id, won, failing);
    update(outcome.next);
    setScreen({ name: 'result', plan, m, stars, from, outcome });
  }, [update]);

  const today = (() => {
    const d = dailyFor(todayString(), DAILY_OPPONENTS.length);
    return { ...d, opp: DAILY_OPPONENTS[d.opponent] };
  })();
  const dailyPlan = (): MatchPlan => {
    const start = today.rule.lockFormation ? { ...DEFAULT_TACTICS, formation: today.rule.lockFormation } : DEFAULT_TACTICS;
    return {
      mode: 'daily', title: `今日のチャレンジ vs ${today.opp.name}`, home: myTeamBase(start), away: distinct(myTeamBase(start), today.opp),
      editable: true, initial: start, seed: today.seed, daily: { date: today.date, rule: today.rule },
    };
  };

  const setAutoPause = useCallback((v: boolean) => update({ ...progress, autoPause: v }), [progress, update]);
  const quitTo = useCallback((s: Screen) => () => setScreen(s), []);

  switch (screen.name) {
    case 'home':
      return (
        <Home
          cleared={Object.values(progress.stars).filter((n) => n > 0).length}
          progress={progress}
          daily={{ opponent: today.opp.name, rule: today.rule.label, done: progress.daily.last === today.date }}
          go={(n) => {
            if (n === 'daily') setScreen({ name: 'prematch', plan: dailyPlan(), from: { name: 'home' } });
            else setScreen({ name: n } as Screen);
          }}
        />
      );
    case 'stages':
      return (
        <StageSelect
          progress={progress}
          back={() => setScreen({ name: 'home' })}
          pick={(s) => setScreen({ name: 'prematch', plan: stagePlan(s), from: { name: 'stages' } })}
        />
      );
    case 'codex':
      return <Codex progress={progress} back={() => setScreen({ name: 'home' })} />;
    case 'achievements':
      return <Achievements progress={progress} back={() => setScreen({ name: 'home' })} />;
    case 'teams':
      return <TeamList back={() => setScreen({ name: 'home' })} pick={(team) => setScreen({ name: 'team', team })} />;
    case 'team':
      return (
        <TeamDetail
          team={screen.team}
          back={() => setScreen({ name: 'teams' })}
          start={(mode, rival) => {
            const me = teamSetup(screen.team);
            const r = teamSetup(rival);
            let plan: MatchPlan;
            if (mode === 'watch') {
              plan = { mode, title: `観戦: ${me.name}`, home: me, away: distinct(me, r), editable: false, initial: me.tactics, seed: newSeed(), note: screen.team.summary,
                coachHints: screen.team.principles.map((p, i) => ({ id: `team${i}`, when: 'always', text: `${p.title}: ${p.text}` })) };
            } else if (mode === 'use') {
              plan = { mode, title: `指揮: ${me.name}`, home: { ...me, color: MY_COLOR }, away: r, editable: true, initial: me.tactics, seed: newSeed(), note: `弱点: ${screen.team.weakness}` };
            } else {
              plan = { mode, title: `挑戦: ${me.name}`, home: myTeamBase(DEFAULT_TACTICS), away: distinct(myTeamBase(DEFAULT_TACTICS), me), editable: true, initial: DEFAULT_TACTICS, seed: newSeed(), note: `相手の弱点: ${screen.team.weakness}` };
            }
            setScreen({ name: 'prematch', plan, from: screen });
          }}
        />
      );
    case 'free':
      return (
        <FreeSetup
          back={() => setScreen({ name: 'home' })}
          start={(t: Tactics, team, oppT) => {
            const home = myTeamBase(t);
            const away: TeamSetup = team
              ? distinct(home, teamSetup(team))
              : { name: '標準チーム', short: '標準', color: '#F2694C', tactics: oppT };
            setScreen({
              name: 'prematch',
              plan: { mode: 'free', title: '自由対戦', home, away, editable: true, initial: t, seed: newSeed() },
              from: { name: 'free' },
            });
          }}
        />
      );
    case 'prematch':
      return (
        <Prematch
          key={screen.plan.seed}
          plan={screen.plan}
          back={() => setScreen(screen.from)}
          quizAnswered={screen.plan.stage ? progress.quiz[screen.plan.stage.id] : undefined}
          onQuiz={(stage, correct) => update(answerQuiz(progressRef.current, stage, correct).next)}
          kick={(t) => setScreen({ name: 'match', plan: { ...screen.plan, home: { ...screen.plan.home, tactics: t }, initial: t }, from: screen.from })}
        />
      );
    case 'match':
      return (
        <MatchScreen
          key={screen.plan.seed}
          plan={screen.plan}
          autoPause={progress.autoPause}
          setAutoPause={setAutoPause}
          finish={finish}
          quit={quitTo({ name: 'prematch', plan: screen.plan, from: screen.from })}
        />
      );
    case 'result': {
      const { plan, m, stars, from, outcome } = screen;
      const stage = plan.stage;
      const nextStage = stage ? STAGES.find((s) => s.id === stage.id + 1) : undefined;
      return (
        <Result
          plan={plan}
          m={m}
          stars={stars}
          outcome={outcome}
          retry={() => setScreen({ name: 'prematch', plan: { ...plan, seed: newSeed() }, from })}
          next={nextStage ? () => setScreen({ name: 'prematch', plan: stagePlan(nextStage), from }) : undefined}
          home={() => setScreen(from)}
        />
      );
    }
  }
}
