import { CoachHint, Tactics, TeamSetup } from '../engine/types';
import { Stage } from '../data/stages';

const KEY = 'tactics-lab-progress-v1';

export interface Progress {
  /** ステージ番号 → 獲得した★の数(勝利で1)。 */
  stars: Record<number, number>;
  autoPause: boolean;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { stars: {}, autoPause: true, ...JSON.parse(raw) };
  } catch {
    /* 保存領域が使えない環境ではその回限りの進行で動かす */
  }
  return { stars: {}, autoPause: true };
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 同上 */
  }
}

export type PlayMode = 'stage' | 'use' | 'face' | 'watch' | 'free';

export interface MatchPlan {
  mode: PlayMode;
  title: string;
  home: TeamSetup;
  away: TeamSetup;
  stage?: Stage;
  editable: boolean;
  initial: Tactics;
  /** 試合後に振り返りへ出す、チームの説明。 */
  note?: string;
  /** 観戦中に流す解説。 */
  coachHints?: CoachHint[];
  seed: number;
}
