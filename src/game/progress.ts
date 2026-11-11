// 監督キャリアの進行(XP、ライセンス、実績、デイリーチャレンジ)。UI から独立した純粋なロジック。
import { FormationId, MatchState, Side } from '../engine/types';
import { countRoles, backLine } from '../engine/diagnosis';
import { possessionPct, ppda } from '../engine/analysis';
import { CARDS } from './content';
import { emptyStory, StoryEvent, StoryState } from './story';

export interface Progress {
  /** ステージ番号 → 獲得した★の数(勝利で1)。 */
  stars: Record<number, number>;
  autoPause: boolean;
  xp: number;
  /** 実績ID → 獲得した日時(ミリ秒)。 */
  badges: Record<string, number>;
  /** ステージ番号 → スカウティング予想の結果。 */
  quiz: Record<number, boolean>;
  /** ステージ番号 → 前回負けた時に満たしていなかった攻略の鍵。 */
  failedKeys: Record<number, string[]>;
  daily: { last: string | null; streak: number; best: number };
  counts: { matches: number; wins: number; watched: number; quizCorrect: number; managerial: number };
  story: StoryState;
}

export const emptyProgress = (): Progress => ({
  stars: {}, autoPause: true, xp: 0, badges: {}, quiz: {}, failedKeys: {},
  daily: { last: null, streak: 0, best: 0 },
  counts: { matches: 0, wins: 0, watched: 0, quizCorrect: 0, managerial: 0 },
  story: emptyStory(),
});

/** 古い保存データ(★と自動停止だけ)も読めるように、足りない項目を補う。 */
export function migrate(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Progress>;
  return {
    ...base, ...r,
    daily: { ...base.daily, ...r.daily },
    counts: { ...base.counts, ...r.counts },
    story: { ...base.story, ...r.story },
  };
}

// ---- ライセンス(レベル) ----

export const LICENSES = [
  { name: 'D級ライセンス', xp: 0 },
  { name: 'C級ライセンス', xp: 300 },
  { name: 'B級ライセンス', xp: 800 },
  { name: 'A級ライセンス', xp: 1600 },
  { name: 'S級ライセンス', xp: 2800 },
  { name: 'プロライセンス', xp: 4500 },
];

export function licenseOf(xp: number) {
  let i = 0;
  while (i + 1 < LICENSES.length && xp >= LICENSES[i + 1].xp) i++;
  const cur = LICENSES[i];
  const next = LICENSES[i + 1];
  return {
    level: i,
    name: cur.name,
    next: next?.name ?? null,
    /** 次のライセンスまでの進み具合(0〜1)。最上位なら1。 */
    ratio: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}

// ---- デイリーチャレンジ ----

export interface DailyRule {
  id: string;
  label: string;
  lockFormation?: FormationId;
  /** 試合結果がルールを満たしたか。勝利は別に判定する。 */
  check: (m: MatchState) => boolean;
}

export const DAILY_RULES: DailyRule[] = [
  { id: 'f442', label: '4-4-2 から変えずに勝つ', lockFormation: '4-4-2', check: (m) => m.tactics[0].formation === '4-4-2' },
  { id: 'f352', label: '3-5-2 から変えずに勝つ', lockFormation: '3-5-2', check: (m) => m.tactics[0].formation === '3-5-2' },
  { id: 'f433', label: '4-3-3 から変えずに勝つ', lockFormation: '4-3-3', check: (m) => m.tactics[0].formation === '4-3-3' },
  { id: 'clean', label: '無失点で勝つ', check: (m) => m.score[1] === 0 },
  { id: 'margin', label: '2点差以上で勝つ', check: (m) => m.score[0] - m.score[1] >= 2 },
  { id: 'nopress', label: 'ハイプレスを使わずに勝つ', check: (m) => m.tactics[0].pressHeight !== 'high' },
  { id: 'f9', label: '偽9番を使って勝つ', check: (m) => countRoles(m.tactics[0], 'f9') >= 1 },
];

/** 日付文字列から決まる、その日の相手とルール。全員が同じ日に同じ挑戦をする。 */
export function dailyFor(date: string, opponents: number) {
  let h = 2166136261;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return {
    date,
    opponent: h % opponents,
    rule: DAILY_RULES[(h >>> 8) % DAILY_RULES.length],
    seed: h % 1_000_000_007,
  };
}

export const todayString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayBefore = (date: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  return todayString(new Date(y, mo - 1, d - 1));
};

// ---- 実績 ----

export interface MatchContext {
  mode: 'stage' | 'use' | 'face' | 'watch' | 'free' | 'daily' | 'story';
  stageId?: number;
  m: MatchState;
  stars: number;
  /** 前回の敗戦で足りなかった攻略の鍵を、今回すべて満たして勝ったか。 */
  overcame: boolean;
  /** 試合中の変更で流れを変えた分(分と xG 差の改善)。 */
  managerial: { minute: number; gain: number } | null;
  dailyCleared: boolean;
  /** ストーリーモードで、この試合によって章が終わったか。 */
  storyEvent?: StoryEvent;
}

export interface Badge {
  id: string;
  name: string;
  hint: string;
  check: (c: MatchContext, next: Progress) => boolean;
}

const won = (c: MatchContext) => c.m.score[0] > c.m.score[1];
const playable = (c: MatchContext) => c.mode !== 'watch';
const clearedChapter = (c: MatchContext, id: number) => c.storyEvent?.kind === 'cleared' && c.storyEvent.chapter.id === id;

/** 0-1 から逆転したか。ゴールの順番から判定する。 */
export function cameFromBehind(m: MatchState, me: Side = 0): boolean {
  let a = 0;
  let b = 0;
  let trailed = false;
  for (const e of m.events) {
    if (e.type !== 'goal') continue;
    if (e.team === me) a++;
    else b++;
    if (b > a) trailed = true;
  }
  return trailed && m.score[me] > m.score[(1 - me) as Side];
}

export const BADGES: Badge[] = [
  { id: 'first-win', name: '初勝利', hint: 'どのモードでもいいので1勝する', check: (c) => playable(c) && won(c) },
  { id: 'first-3star', name: '完璧な采配', hint: 'ステージで★3を取る', check: (c) => c.mode === 'stage' && c.stars === 3 },
  { id: 'all-clear', name: '全ステージ制覇', hint: '12ステージすべてをクリアする', check: (_c, n) => Object.values(n.stars).filter((s) => s > 0).length >= 12 },
  { id: 'all-3star', name: '戦術マスター', hint: '12ステージすべてで★3を取る', check: (_c, n) => Object.values(n.stars).filter((s) => s >= 3).length >= 12 },
  { id: 'managerial', name: '名采配', hint: '試合中の戦術変更で流れを変えて勝つ', check: (c) => won(c) && c.managerial !== null },
  { id: 'comeback', name: '逆転劇', hint: 'リードされてから逆転勝ちする', check: (c) => playable(c) && cameFromBehind(c.m) },
  { id: 'overcame', name: '敗因を越えて', hint: '負けた時に足りなかった攻略の鍵を、すべて直して勝つ', check: (c) => c.overcame },
  { id: 'clean3', name: '鉄壁', hint: '被シュート3本以下で勝つ', check: (c) => playable(c) && won(c) && c.m.stats[1].shots <= 3 },
  { id: 'press', name: '前から奪う', hint: 'PPDA 8以下(前から奪えている)で勝つ', check: (c) => playable(c) && won(c) && ppda(c.m, 0) <= 8 },
  { id: 'possession', name: 'ボールの支配者', hint: '保持率65%以上で勝つ', check: (c) => playable(c) && won(c) && possessionPct(c.m, 0) >= 65 },
  { id: 'counter', name: '速攻の刃', hint: '保持率40%以下で勝つ', check: (c) => playable(c) && won(c) && possessionPct(c.m, 0) <= 40 },
  { id: 'halfspace', name: 'ハーフスペースの住人', hint: 'ハーフスペースからシュートを10本打つ', check: (c) => playable(c) && c.m.stats[0].halfSpaceShots >= 10 },
  { id: 'f9win', name: '偽9番の使い手', hint: '偽9番を置いて勝つ', check: (c) => playable(c) && won(c) && countRoles(c.m.tactics[0], 'f9') >= 1 },
  { id: 'back5win', name: '5枚の壁', hint: '最終ライン5枚の形で無失点勝利', check: (c) => playable(c) && won(c) && c.m.score[1] === 0 && backLine(c.m.tactics[0]) >= 5 },
  { id: 'giant', name: '名門撃破', hint: '「倒す」モードで名チームに勝つ', check: (c) => c.mode === 'face' && won(c) },
  { id: 'scout', name: 'スカウトの目', hint: 'スカウティング予想に5回正解する', check: (_c, n) => n.counts.quizCorrect >= 5 },
  { id: 'student', name: '研究熱心', hint: '名チームの試合を3回観戦する', check: (_c, n) => n.counts.watched >= 3 },
  { id: 'story-up', name: '初昇格', hint: 'ストーリーで JFL を突破する', check: (c) => clearedChapter(c, 1) },
  { id: 'story-j1', name: '日本の頂点', hint: 'ストーリーで J1 を制する', check: (c) => clearedChapter(c, 4) },
  { id: 'story-asia', name: 'アジア王者', hint: 'ストーリーでアジアの頂点に立つ', check: (c) => clearedChapter(c, 5) },
  { id: 'story-world', name: '世界制覇', hint: 'ストーリーで世界一になる', check: (c) => clearedChapter(c, 6) },
  { id: 'streak3', name: '3日連続', hint: 'デイリーチャレンジを3日連続でクリアする', check: (_c, n) => n.daily.streak >= 3 },
  { id: 'streak7', name: '1週間の習慣', hint: 'デイリーチャレンジを7日連続でクリアする', check: (_c, n) => n.daily.streak >= 7 },
];

// ---- 名采配の判定 ----

/** 自チームの戦術変更の前後15分で、xG 差がどれだけ良くなったか。最も効いた変更を返す。 */
export function managerialImpact(m: MatchState): { minute: number; gain: number } | null {
  const changes = m.events.filter((e) => e.type === 'tactic' && e.team === 0 && e.minute <= 78);
  let best: { minute: number; gain: number } | null = null;
  for (const c of changes) {
    const diff = (from: number, to: number) =>
      m.shots.filter((s) => s.minute >= from && s.minute < to).reduce((acc, s) => acc + (s.team === 0 ? s.xg : -s.xg), 0);
    const before = diff(Math.max(0, c.minute - 15), c.minute);
    const after = diff(c.minute, Math.min(90, c.minute + 15));
    const gain = after - before;
    if (gain >= 0.35 && (!best || gain > best.gain)) best = { minute: c.minute, gain };
  }
  return best;
}

// ---- 試合後の報酬 ----

export interface Reward {
  label: string;
  xp: number;
}

export interface Outcome {
  rewards: Reward[];
  xp: number;
  before: ReturnType<typeof licenseOf>;
  after: ReturnType<typeof licenseOf>;
  newBadges: Badge[];
  unlockedCards: number[];
  masteredCards: number[];
  next: Progress;
}

export const XP = {
  win: 100, draw: 40, loss: 20, objective: 30, firstClear: 100, threeStar: 80,
  quiz: 30, badge: 50, managerial: 40, overcame: 80, watch: 15, dailyMultiplier: 2,
  chapter: 200, world: 500,
};

/** 試合結果を進行に反映し、もらえる XP と新しく得たものを返す。 */
export function applyMatch(p: Progress, c: MatchContext, today = todayString()): Outcome {
  const rewards: Reward[] = [];
  const next: Progress = {
    ...p, stars: { ...p.stars }, badges: { ...p.badges }, failedKeys: { ...p.failedKeys }, story: p.story,
    daily: { ...p.daily }, counts: { ...p.counts },
  };
  const m = c.m;
  const w = won(c);
  const draw = m.score[0] === m.score[1];

  if (c.mode === 'watch') {
    next.counts.watched += 1;
    rewards.push({ label: '名チームの試合を観戦', xp: XP.watch });
  } else {
    next.counts.matches += 1;
    if (w) next.counts.wins += 1;
    rewards.push(w ? { label: '勝利', xp: XP.win } : draw ? { label: '引き分け', xp: XP.draw } : { label: '挑戦した(敗戦からも学べる)', xp: XP.loss });
  }

  const unlockedCards: number[] = [];
  const masteredCards: number[] = [];
  if (c.mode === 'stage' && c.stageId !== undefined) {
    const prevStars = p.stars[c.stageId] ?? 0;
    if (c.stars > 1) rewards.push({ label: `追加目標 ×${c.stars - 1}`, xp: XP.objective * (c.stars - 1) });
    if (c.stars > 0 && prevStars === 0) {
      rewards.push({ label: '初クリア', xp: XP.firstClear });
      if (CARDS.some((k) => k.stage === c.stageId)) unlockedCards.push(c.stageId);
    }
    if (c.stars === 3 && prevStars < 3) {
      rewards.push({ label: '初の★3', xp: XP.threeStar });
      masteredCards.push(c.stageId);
    }
    next.stars[c.stageId] = Math.max(prevStars, c.stars);
    if (c.overcame) rewards.push({ label: '前回の敗因を克服', xp: XP.overcame });
  }

  if (c.storyEvent?.kind === 'cleared') {
    const ch = c.storyEvent.chapter;
    rewards.push(c.storyEvent.last
      ? { label: '世界制覇', xp: XP.world }
      : { label: `${ch.league} ${ch.format === 'cup' ? '優勝' : '突破'}`, xp: XP.chapter });
  }

  if (c.managerial) {
    next.counts.managerial += 1;
    rewards.push({ label: `名采配(${c.managerial.minute}分の変更で xG 差 +${c.managerial.gain.toFixed(2)})`, xp: XP.managerial });
  }

  // デイリーは1日1回だけ、XP を倍にする
  let dailyBonus = false;
  if (c.mode === 'daily' && c.dailyCleared && p.daily.last !== today) {
    next.daily.streak = p.daily.last === dayBefore(today) ? p.daily.streak + 1 : 1;
    next.daily.best = Math.max(next.daily.best, next.daily.streak);
    next.daily.last = today;
    dailyBonus = true;
  }

  const newBadges = BADGES.filter((b) => !p.badges[b.id] && b.check(c, next));
  for (const b of newBadges) {
    next.badges[b.id] = Date.now();
    rewards.push({ label: `実績「${b.name}」`, xp: XP.badge });
  }

  let xp = rewards.reduce((s, r) => s + r.xp, 0);
  if (dailyBonus) {
    rewards.push({ label: `デイリーチャレンジ達成(XP ×${XP.dailyMultiplier}、${next.daily.streak}日連続)`, xp: xp * (XP.dailyMultiplier - 1) });
    xp *= XP.dailyMultiplier;
  }
  next.xp = p.xp + xp;
  return { rewards, xp, before: licenseOf(p.xp), after: licenseOf(next.xp), newBadges, unlockedCards, masteredCards, next };
}

/**
 * 負けた時に足りなかった攻略の鍵を覚える。鍵を直したのに負けた試合でも、それまでの敗因は消さない
 * (次に勝った時に「敗因を克服」と判定するため)。勝ったら記録を消す。
 */
export function nextFailedKeys(prev: Record<number, string[]>, stage: number, won: boolean, failing: string[]) {
  const next = { ...prev };
  if (won) {
    delete next[stage];
    return next;
  }
  const merged = Array.from(new Set([...(prev[stage] ?? []), ...failing]));
  if (merged.length > 0) next[stage] = merged;
  return next;
}

/** スカウティング予想に答えた結果を反映する。同じステージで XP がもらえるのは最初の1回だけ。 */
export function answerQuiz(p: Progress, stage: number, correct: boolean): { next: Progress; xp: number } {
  if (p.quiz[stage] !== undefined) return { next: p, xp: 0 };
  const xp = correct ? XP.quiz : 0;
  return {
    xp,
    next: {
      ...p, quiz: { ...p.quiz, [stage]: correct }, xp: p.xp + xp,
      counts: { ...p.counts, quizCorrect: p.counts.quizCorrect + (correct ? 1 : 0) },
    },
  };
}
