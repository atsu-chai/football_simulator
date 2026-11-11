import { describe, expect, it } from 'vitest';
import { makeTestMatch } from '../engine/testUtils';
import { MatchState } from '../engine/types';
import { CARDS, QUIZZES } from './content';
import {
  answerQuiz, applyMatch, nextFailedKeys, BADGES, cameFromBehind, dailyFor, emptyProgress, licenseOf, managerialImpact, MatchContext,
  migrate, XP,
} from './progress';

const goal = (m: MatchState, team: 0 | 1, minute: number) => {
  m.score[team] += 1;
  m.events.push({ t: minute * 10, minute, type: 'goal', team, text: 'ゴール' });
};

const ctx = (m: MatchState, over: Partial<MatchContext> = {}): MatchContext => ({
  mode: 'stage', stageId: 1, m, stars: 0, overcame: false, managerial: null, dailyCleared: false, ...over,
});

describe('保存データ', () => {
  it('★と自動停止だけの古いデータを読める', () => {
    const p = migrate({ stars: { 1: 2 }, autoPause: false });
    expect(p.stars[1]).toBe(2);
    expect(p.autoPause).toBe(false);
    expect(p.xp).toBe(0);
    expect(p.daily.streak).toBe(0);
  });
});

describe('ライセンス', () => {
  it('XP の境界でライセンスが上がる', () => {
    expect(licenseOf(0).name).toBe('D級ライセンス');
    expect(licenseOf(299).level).toBe(0);
    expect(licenseOf(300).name).toBe('C級ライセンス');
    expect(licenseOf(99999).next).toBeNull();
  });
});

describe('試合の報酬', () => {
  it('負けても XP が入り、勝利より少ない', () => {
    const lose = makeTestMatch();
    goal(lose, 1, 10);
    const win = makeTestMatch();
    goal(win, 0, 10);
    const a = applyMatch(emptyProgress(), ctx(lose));
    const b = applyMatch(emptyProgress(), ctx(win, { stars: 1 }));
    expect(a.xp).toBeGreaterThan(0);
    expect(b.xp).toBeGreaterThan(a.xp);
  });

  it('初クリアでカード入手、★3でマスター。2回目は初回ボーナスなし', () => {
    const m = makeTestMatch();
    goal(m, 0, 10);
    const first = applyMatch(emptyProgress(), ctx(m, { stars: 3 }));
    expect(first.unlockedCards).toEqual([1]);
    expect(first.masteredCards).toEqual([1]);
    expect(first.next.stars[1]).toBe(3);
    const again = applyMatch(first.next, ctx(m, { stars: 3 }));
    expect(again.unlockedCards).toEqual([]);
    expect(again.rewards.some((r) => r.label === '初クリア')).toBe(false);
  });

  it('★は最高記録を残す', () => {
    const m = makeTestMatch();
    goal(m, 0, 10);
    const a = applyMatch(emptyProgress(), ctx(m, { stars: 3 }));
    const b = applyMatch(a.next, ctx(m, { stars: 1 }));
    expect(b.next.stars[1]).toBe(3);
  });

  it('実績は一度だけ解除され、XP が付く', () => {
    const m = makeTestMatch();
    goal(m, 0, 10);
    const a = applyMatch(emptyProgress(), ctx(m, { stars: 1 }));
    expect(a.newBadges.map((b) => b.id)).toContain('first-win');
    const b = applyMatch(a.next, ctx(m, { stars: 1 }));
    expect(b.newBadges.map((x) => x.id)).not.toContain('first-win');
  });

  it('デイリーは1日1回だけ XP 2倍、連続日数は前日クリアで伸びる', () => {
    const m = makeTestMatch();
    goal(m, 0, 10);
    const c = ctx(m, { mode: 'daily', stageId: undefined, dailyCleared: true });
    const d1 = applyMatch(emptyProgress(), c, '2026-11-09');
    expect(d1.next.daily.streak).toBe(1);
    const base = d1.rewards.filter((r) => !r.label.startsWith('デイリー')).reduce((s, r) => s + r.xp, 0);
    expect(d1.xp).toBe(base * XP.dailyMultiplier);
    const same = applyMatch(d1.next, c, '2026-11-09');
    expect(same.next.daily.streak).toBe(1);
    expect(same.rewards.some((r) => r.label.startsWith('デイリー'))).toBe(false);
    const d2 = applyMatch(d1.next, c, '2026-11-10');
    expect(d2.next.daily.streak).toBe(2);
    const gap = applyMatch(d2.next, c, '2026-11-13');
    expect(gap.next.daily.streak).toBe(1);
  });

  it('観戦は試合数に数えず、観戦回数を増やす', () => {
    const m = makeTestMatch();
    const a = applyMatch(emptyProgress(), ctx(m, { mode: 'watch', stageId: undefined }));
    expect(a.next.counts.watched).toBe(1);
    expect(a.next.counts.matches).toBe(0);
    expect(a.newBadges.map((b) => b.id)).not.toContain('first-win');
  });
});

describe('判定', () => {
  it('リードされてからの逆転を見分ける', () => {
    const m = makeTestMatch();
    goal(m, 1, 5);
    goal(m, 0, 30);
    goal(m, 0, 70);
    expect(cameFromBehind(m)).toBe(true);
    const n = makeTestMatch();
    goal(n, 0, 5);
    goal(n, 1, 30);
    goal(n, 0, 70);
    expect(cameFromBehind(n)).toBe(false);
  });

  it('戦術変更の後に xG 差が良くなれば名采配', () => {
    const m = makeTestMatch();
    m.events.push({ t: 300, minute: 30, type: 'tactic', team: 0, text: '戦術を変更しました' });
    const shot = (team: 0 | 1, minute: number, xg: number) =>
      m.shots.push({ team, x: 90, y: 34, xg, outcome: 'miss', minute, halfSpace: false, header: false });
    shot(1, 20, 0.3);
    shot(0, 35, 0.4);
    shot(0, 40, 0.2);
    expect(managerialImpact(m)?.minute).toBe(30);
    const quiet = makeTestMatch();
    quiet.events.push({ t: 300, minute: 30, type: 'tactic', team: 0, text: '戦術を変更しました' });
    expect(managerialImpact(quiet)).toBeNull();
  });

  it('デイリーは同じ日なら同じ挑戦になる', () => {
    expect(dailyFor('2026-11-10', 20)).toEqual(dailyFor('2026-11-10', 20));
    const days = new Set(Array.from({ length: 14 }, (_, i) => dailyFor(`2026-11-${10 + i}`, 20).rule.id));
    expect(days.size).toBeGreaterThan(2);
  });

  it('クイズの XP は最初の1回だけ', () => {
    const a = answerQuiz(emptyProgress(), 1, true);
    expect(a.xp).toBe(XP.quiz);
    const b = answerQuiz(a.next, 1, true);
    expect(b.xp).toBe(0);
    expect(b.next.counts.quizCorrect).toBe(1);
  });
});

describe('敗因の記録', () => {
  it('鍵を直したのに負けても、前の敗因は残る。勝てば消える', () => {
    const a = nextFailedKeys({}, 2, false, ['幅', 'プレス']);
    expect(a[2]).toEqual(['幅', 'プレス']);
    const b = nextFailedKeys(a, 2, false, []);
    expect(b[2]).toEqual(['幅', 'プレス']);
    const c = nextFailedKeys(b, 2, false, ['速攻']);
    expect(c[2]).toEqual(['幅', 'プレス', '速攻']);
    expect(nextFailedKeys(c, 2, true, [])[2]).toBeUndefined();
    expect(nextFailedKeys({}, 3, false, [])[3]).toBeUndefined();
  });
});

describe('内容データ', () => {
  it('全ステージにカードとクイズがあり、正解の番号が範囲内', () => {
    for (let s = 1; s <= 12; s++) {
      expect(CARDS.some((c) => c.stage === s)).toBe(true);
      const q = QUIZZES.find((x) => x.stage === s)!;
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
    }
    expect(new Set(QUIZZES.map((q) => q.answer)).size).toBe(3);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
