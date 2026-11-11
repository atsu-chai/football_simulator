// ストーリーモードの進行。UI から独立した純粋なロジック。
import { Tactics } from '../engine/types';
import { Chapter, CHAPTERS, chapterOf } from '../data/story';

export type MatchResult = 'W' | 'D' | 'L';

export interface StoryState {
  club: string;
  /** 挑戦中の章。全章を終えたら CHAPTERS.length + 1。 */
  chapter: number;
  /** 今の章(シーズン/大会)の結果。cup の PK 勝ちは 'W'、PK 負けは 'L' として残す。 */
  results: MatchResult[];
  /** 最後に使った戦術。次の試合の初期値にする。 */
  tactics?: Tactics;
  /** 章ごとの挑戦回数。 */
  attempts: Record<number, number>;
  /** 世界一になった回数。 */
  titles: number;
}

export const emptyStory = (): StoryState => ({ club: 'FCラボ', chapter: 1, results: [], attempts: {}, titles: 0 });

export const points = (rs: MatchResult[]) => rs.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

export const storyFinished = (s: StoryState) => s.chapter > CHAPTERS.length;

/** 昇格(league)に必要な勝ち点に、残り試合で届くか。 */
export function leagueStatus(c: Chapter, rs: MatchResult[]) {
  const pts = points(rs);
  const left = c.opponents.length - rs.length;
  const target = c.target ?? 0;
  return { pts, left, target, max: pts + left * 3, secured: pts >= target, dead: pts + left * 3 < target };
}

export type StoryEvent =
  | { kind: 'continue' }
  | { kind: 'cleared'; chapter: Chapter; last: boolean }
  | { kind: 'failed'; chapter: Chapter };

/**
 * 試合結果を反映する。league は全節を終えた時点の勝ち点で、cup は負けた時点で判定する。
 * 昇格が決まらないまま全節を終えたら、同じ章をやり直す。cup の引き分けは pk で決める。
 */
export function recordStoryMatch(s: StoryState, result: MatchResult, tactics?: Tactics): { next: StoryState; event: StoryEvent } {
  if (storyFinished(s)) return { next: s, event: { kind: 'continue' } };
  const c = chapterOf(s.chapter);
  const results = [...s.results, result];
  const base: StoryState = { ...s, results, tactics: tactics ?? s.tactics, attempts: { ...s.attempts } };

  let outcome: 'continue' | 'cleared' | 'failed' = 'continue';
  if (c.format === 'cup') {
    if (result !== 'W') outcome = 'failed';
    else if (results.length >= c.opponents.length) outcome = 'cleared';
  } else {
    const st = leagueStatus(c, results);
    if (st.left === 0) outcome = st.secured ? 'cleared' : 'failed';
    else if (st.dead) outcome = 'failed';
  }

  if (outcome === 'continue') return { next: base, event: { kind: 'continue' } };
  base.attempts[c.id] = (base.attempts[c.id] ?? 1) + (outcome === 'failed' ? 1 : 0);
  if (outcome === 'failed') return { next: { ...base, results: [] }, event: { kind: 'failed', chapter: c } };
  const last = c.id === CHAPTERS.length;
  return {
    next: { ...base, chapter: c.id + 1, results: [], titles: s.titles + (last ? 1 : 0) },
    event: { kind: 'cleared', chapter: c, last },
  };
}

/** 試合後の画面に出す、ストーリーの結果。 */
export interface StoryOutcome {
  result: MatchResult;
  event: StoryEvent;
  pk?: { me: number; opp: number };
}

/** PK 戦。地力の差が少しだけ効く。乱数は呼び出し側から渡す(試合のシードで再現できるように)。 */
export function penaltyShootout(rand: () => number, mySkill: number, oppSkill: number) {
  const pMe = 0.76 + (mySkill - oppSkill) * 0.3;
  const pOpp = 0.76 + (oppSkill - mySkill) * 0.3;
  const kicks: { me: boolean; opp: boolean }[] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < 5; i++) {
    const k = { me: rand() < pMe, opp: rand() < pOpp };
    kicks.push(k);
    a += k.me ? 1 : 0;
    b += k.opp ? 1 : 0;
    const left = 4 - i;
    if (a > b + left || b > a + left) break;
  }
  // 同点ならサドンデス
  while (a === b && kicks.length < 20) {
    const k = { me: rand() < pMe, opp: rand() < pOpp };
    kicks.push(k);
    a += k.me ? 1 : 0;
    b += k.opp ? 1 : 0;
  }
  if (a === b) a += 1;
  return { me: a, opp: b, won: a > b, kicks };
}

/** 世界一まで進んだ後に、もう一度 JFL から始める。クラブ名と世界一の回数は残す。 */
export function restartStory(s: StoryState): StoryState {
  return { ...emptyStory(), club: s.club, titles: s.titles };
}
