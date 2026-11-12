import { describe, expect, it } from 'vitest';
import { CHAPTERS, opponentSetup, STORY_WEAKNESS, STYLE_STAGE } from '../data/story';
import { DEFAULT_TACTICS } from '../data/formations';
import { STAGES } from '../data/stages';
import { createMatch, setTactics } from '../engine/match';
import { mulberry32 } from '../engine/geometry';
import { makeTestMatch } from '../engine/testUtils';
import { applyMatch, emptyProgress, migrate } from './progress';
import { emptyStory, leagueStatus, MatchResult, penaltyShootout, recordStoryMatch, restartStory, StoryState, storyFinished } from './story';

const play = (s: StoryState, rs: MatchResult[]) => rs.reduce((acc, r) => recordStoryMatch(acc.next, r), { next: s, event: { kind: 'continue' } } as ReturnType<typeof recordStoryMatch>);

describe('ストーリーの進行', () => {
  it('JFL で目標の勝ち点に届けば J3 へ進む', () => {
    const r = play(emptyStory(), ['W', 'W', 'D', 'L']);
    expect(r.event.kind).toBe('cleared');
    expect(r.next.chapter).toBe(2);
    expect(r.next.results).toEqual([]);
  });

  it('届かなければ同じ章をやり直し、挑戦回数が増える', () => {
    const r = play(emptyStory(), ['W', 'D', 'D', 'L']);
    expect(r.event.kind).toBe('failed');
    expect(r.next.chapter).toBe(1);
    expect(r.next.attempts[1]).toBe(2);
  });

  it('残り試合で届かなくなった時点で失敗が決まる', () => {
    const r = play(emptyStory(), ['L', 'L']);
    expect(r.event.kind).toBe('failed');
    expect(leagueStatus(CHAPTERS[0], ['L']).dead).toBe(false);
  });

  it('勝ち抜き戦は負けたら終わり、全勝で優勝', () => {
    const cup: StoryState = { ...emptyStory(), chapter: 5 };
    expect(play(cup, ['W', 'L']).event.kind).toBe('failed');
    const win = play(cup, ['W', 'W', 'W']);
    expect(win.event.kind).toBe('cleared');
    expect(win.next.chapter).toBe(6);
  });

  it('世界一で物語が終わり、やり直してもクラブ名と回数は残る', () => {
    const last: StoryState = { ...emptyStory(), club: '港FC', chapter: 6 };
    const r = play(last, ['W', 'W', 'W']);
    expect(r.event).toMatchObject({ kind: 'cleared', last: true });
    expect(storyFinished(r.next)).toBe(true);
    expect(r.next.titles).toBe(1);
    const again = restartStory(r.next);
    expect(again).toMatchObject({ chapter: 1, club: '港FC', titles: 1, results: [] });
  });

  it('PK 戦は必ず決着し、同じ乱数なら同じ結果', () => {
    for (let s = 0; s < 50; s++) {
      const a = penaltyShootout(mulberry32(s), 1, 1.1);
      expect(a.me).not.toBe(a.opp);
      expect(penaltyShootout(mulberry32(s), 1, 1.1)).toEqual(a);
    }
  });
});

describe('ストーリーの報酬', () => {
  it('章の突破で XP と実績が入る', () => {
    const m = makeTestMatch();
    m.score[0] = 1;
    const ev = play(emptyStory(), ['W', 'W', 'W', 'W']).event;
    const o = applyMatch(emptyProgress(), {
      mode: 'story', m, stars: 0, overcame: false, managerial: null, dailyCleared: false, storyEvent: ev,
    });
    expect(o.rewards.some((r) => r.label.includes('JFL'))).toBe(true);
    expect(o.newBadges.map((b) => b.id)).toContain('story-up');
  });

  it('ストーリーのない古い保存データも読める', () => {
    const p = migrate({ stars: { 1: 1 }, xp: 50 });
    expect(p.story.chapter).toBe(1);
    expect(p.story.club).toBe('FCラボ');
  });
});

describe('ストーリーの内容', () => {
  it('初期設定には補正せず、対策を変更すると各スタイルの弱点が実際の試合に反映される', () => {
    for (const c of CHAPTERS) for (const o of c.opponents) {
      const m = createMatch({ teams: [
        { name: '自分', short: '自分', color: '#888', tactics: DEFAULT_TACTICS, skill: c.mySkill },
        opponentSetup(o),
      ], seed: 42 });
      expect(m.skillNow[1]).toBeCloseTo(o.skill);
      const solution = STAGES.find((s) => s.id === STYLE_STAGE[o.style])!.solution;
      setTactics(m, 0, solution);
      expect(m.skillNow[1]).toBeCloseTo(o.skill * (1 - STORY_WEAKNESS));
    }
  });

  it('章ごとに相手がいて、後の章ほど相手が強い', () => {
    const avg = CHAPTERS.map((c) => c.opponents.reduce((s, o) => s + o.skill, 0) / c.opponents.length);
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
    for (const c of CHAPTERS) {
      if (c.format === 'league') expect(c.target!).toBeLessThanOrEqual(c.opponents.length * 3);
      else expect(c.roundNames?.length).toBe(c.opponents.length);
    }
  });
});
