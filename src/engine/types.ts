export interface Vec {
  x: number;
  y: number;
}

export type Side = 0 | 1;

export const PITCH_W = 105;
export const PITCH_H = 68;
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const TICK = 0.1;
/** 1試合のシミュレーション秒数。 */
export const MATCH_SECONDS = 1200;
/** 1倍速での再生倍率。実時間では約11分46秒で1試合が終わる。 */
export const BASE_PLAYBACK = 1.7;

export type RoleId =
  | 'gk'
  | 'cb'
  | 'fb'
  | 'wb'
  | 'dm'
  | 'cm'
  | 'am'
  | 'wg'
  | 'iw'
  | 'st'
  | 'f9';

export type FormationId =
  | '4-4-2'
  | '4-3-3'
  | '4-2-3-1'
  | '4-1-4-1'
  | '4-1-2-1-2'
  | '3-5-2'
  | '3-4-3'
  | '3-4-2-1'
  | '5-4-1'
  | '5-3-2';

export interface Tactics {
  formation: FormationId;
  /** 枠ごとの役割。未指定ならフォーメーションの既定値を使う。 */
  roles?: Partial<Record<number, RoleId>>;
  /** 枠ごとの手動調整(m)。自チーム基準で x+ が前方。 */
  offsets?: Partial<Record<number, Vec>>;
  buildUp: 'short' | 'mixed' | 'long';
  tempo: 'slow' | 'normal' | 'fast';
  width: 'narrow' | 'normal' | 'wide';
  focus: 'balanced' | 'left' | 'center' | 'right';
  fullbacks: 'overlap' | 'invert' | 'stay';
  pressHeight: 'low' | 'mid' | 'high';
  pressIntensity: 'low' | 'normal' | 'high';
  lineHeight: 'deep' | 'normal' | 'high';
  compactness: 'loose' | 'normal' | 'tight';
  marking: 'zone' | 'man';
  onLoss: 'regroup' | 'counterpress';
  onWin: 'keep' | 'counter';
}

export interface TeamSetup {
  name: string;
  short: string;
  color: string;
  tactics: Tactics;
  /** 1.0 が基準。ステージ差は戦術で作るため、振れ幅は小さく保つ。 */
  skill?: number;
  /** ステージの相手用: 試合の状況から地力に掛ける倍率。弱点(攻略の鍵)を突かれるほど下がる。 */
  skillMod?: (m: MatchState) => number;
}

export interface Player {
  id: number;
  team: Side;
  slot: number;
  role: RoleId;
  number: number;
  pos: Vec;
  prev: Vec;
  vel: Vec;
  target: Vec;
  /** 移動用の目標。戦術上の目標の細かな揺れを吸収する。 */
  moveTarget: Vec;
  urgency: number;
  decideAt: number;
  stunnedUntil: number;
  runUntil: number;
  runTarget: Vec | null;
  nextSpotAt: number;
  spot: Vec | null;
  /** サポート位置の基準となる保持者。-1 は絶対座標。 */
  spotOwner: number;
  markTarget: number;
  pressing: boolean;
}

export interface PassInfo {
  from: number;
  to: number;
  point: Vec;
  lofted: boolean;
  startX: number;
  offside: boolean[];
  cross: boolean;
  /** 走り込む味方の前のスペースへ出したパス。 */
  through: boolean;
}

export type ShotOutcome = 'goal' | 'saved' | 'miss' | 'blocked';

export interface ShotInfo {
  shooter: number;
  outcome: ShotOutcome;
  xg: number;
  blocker: number;
  header: boolean;
}

export interface Ball {
  pos: Vec;
  prev: Vec;
  z: number;
  vel: Vec;
  vz: number;
  owner: number;
  lastTouch: number;
  pass: PassInfo | null;
  shot: ShotInfo | null;
}

export type DeadKind = 'kickoff' | 'throw' | 'corner' | 'goalkick' | 'free';

export interface DeadBall {
  kind: DeadKind;
  team: Side;
  at: Vec;
  until: number;
  taker: number;
}

export interface TeamFrame {
  hasBall: boolean;
  line: number;
  length: number;
  width: number;
  cy: number;
}

export interface ShotRecord {
  team: Side;
  x: number;
  y: number;
  xg: number;
  outcome: ShotOutcome;
  minute: number;
  halfSpace: boolean;
  header: boolean;
}

export interface TeamStats {
  possessionTicks: number;
  passes: number;
  passesDone: number;
  longPasses: number;
  shots: number;
  onTarget: number;
  xg: number;
  tackles: number;
  interceptions: number;
  /** 自陣ゴールから42m以遠での寄せと奪取の回数(PPDA の分母)。 */
  defActionsHigh: number;
  /** 自陣60%でのパス数(相手のPPDAの分子)。 */
  passesOwn60: number;
  finalThirdPasses: number;
  lineBreaks: number;
  turnoversOwnHalf: number;
  ballWinsHigh: number;
  counters: number;
  offsides: number;
  corners: number;
  crosses: number;
  halfSpaceShots: number;
  posSum: { x: number; y: number; n: number }[];
  links: Record<string, number>;
}

export type EventType =
  | 'kickoff'
  | 'halftime'
  | 'fulltime'
  | 'goal'
  | 'shot'
  | 'save'
  | 'offside'
  | 'corner'
  | 'tactic'
  | 'coach';

export interface MatchEvent {
  t: number;
  minute: number;
  type: EventType;
  team?: Side;
  text: string;
  /** コーチ解説の重要度。key は自動一時停止の対象。 */
  key?: boolean;
  /** その局面で見ると分かりやすいオーバーレイ。 */
  overlay?: OverlayId;
}

export type OverlayId = 'numbers' | 'lines' | 'passes' | 'space' | 'lanes';

export interface ScriptPhase {
  /** この試合時間(分)以降に発動。 */
  atMinute?: number;
  /** 相手(スクリプト側)の得失点差がこの値以下で発動。 */
  whenDiffAtMost?: number;
  /** 得失点差がこの値以上で発動。 */
  whenDiffAtLeast?: number;
  /** 反映する戦術変更。 */
  change: Partial<Tactics>;
  message: string;
}

export interface MatchConfig {
  teams: [TeamSetup, TeamSetup];
  seed: number;
  /** リプレイ用に毎ティック記録する。 */
  record?: boolean;
  /** 指定サイドの戦術を試合中に変えるスクリプト。 */
  script?: { side: Side; phases: ScriptPhase[] };
  /** コーチ解説を生成する対象。 */
  coachSide?: Side;
  /** ステージ固有の解説。 */
  coachHints?: CoachHint[];
}

export interface CoachHint {
  id: string;
  /** 発動条件。engine/coach.ts の CONDITIONS のキー。 */
  when: string;
  text: string;
  key?: boolean;
  overlay?: OverlayId;
}

export interface MatchState {
  cfg: MatchConfig;
  t: number;
  half: 1 | 2;
  finished: boolean;
  /** ハーフタイムで止まっている。UI が resume() を呼ぶまで進まない。 */
  atHalftime: boolean;
  players: Player[];
  ball: Ball;
  tactics: [Tactics, Tactics];
  possession: Side;
  possessionSince: number;
  frames: [TeamFrame, TeamFrame];
  lineDrop: [number, number];
  /** チームの体力(1→0)。プレスで減り、選手の速度が落ちる。 */
  energy: [number, number];
  /** 各チームの最終ライン(そのチーム基準の x)。 */
  lastLine: [number, number];
  dead: DeadBall | null;
  setPieceUntil: number;
  score: [number, number];
  stats: [TeamStats, TeamStats];
  shots: ShotRecord[];
  events: MatchEvent[];
  frames_rec: Float32Array[];
  firedScripts: Set<number>;
  firedHints: Set<string>;
  coachNextAt: number;
  rand: () => number;
  /** 相手に人を当てる割当表の再計算要求。 */
  markingDirty: [boolean, boolean];
  /** いまの地力(skill × 弱点による倍率)。戦術変更と定期的な更新で計算し直す。 */
  skillNow: [number, number];
  /** 直近で守備者が寄せたボール保持者。同じ保持で二重に数えないために持つ。 */
  challenged: number;
}
