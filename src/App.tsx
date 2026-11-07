import { useCallback, useState } from 'react';
import { DEFAULT_TACTICS } from './data/formations';
import { myTeamBase, MY_COLOR, Stage, STAGES } from './data/stages';
import { RealTeam, teamSetup } from './data/teams';
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
  | { name: 'prematch'; plan: MatchPlan; from: Screen }
  | { name: 'match'; plan: MatchPlan; from: Screen }
  | { name: 'result'; plan: MatchPlan; m: MatchState; stars: number; from: Screen };

const newSeed = () => Math.floor(Math.random() * 1e9);

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

  const finish = useCallback((m: MatchState) => {
    setScreen((cur) => {
      if (cur.name !== 'match') return cur;
      const { plan, from } = cur;
      let stars = 0;
      if (plan.stage && m.score[0] > m.score[1]) {
        stars = 1 + plan.stage.objectives.filter((o) => o.check(m)).length;
        const best = Math.max(stars, progress.stars[plan.stage.id] ?? 0);
        update({ ...progress, stars: { ...progress.stars, [plan.stage.id]: best } });
      }
      return { name: 'result', plan, m, stars, from };
    });
  }, [progress, update]);

  const setAutoPause = useCallback((v: boolean) => update({ ...progress, autoPause: v }), [progress, update]);
  const quitTo = useCallback((s: Screen) => () => setScreen(s), []);

  switch (screen.name) {
    case 'home':
      return (
        <Home
          cleared={Object.values(progress.stars).filter((n) => n > 0).length}
          go={(n) => setScreen(n === 'stages' ? { name: 'stages' } : n === 'teams' ? { name: 'teams' } : { name: 'free' })}
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
      const { plan, m, stars, from } = screen;
      const stage = plan.stage;
      const nextStage = stage ? STAGES.find((s) => s.id === stage.id + 1) : undefined;
      return (
        <Result
          plan={plan}
          m={m}
          stars={stars}
          retry={() => setScreen({ name: 'prematch', plan: { ...plan, seed: newSeed() }, from })}
          next={nextStage ? () => setScreen({ name: 'prematch', plan: stagePlan(nextStage), from }) : undefined}
          home={() => setScreen(from)}
        />
      );
    }
  }
}
