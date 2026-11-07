import { FormationId, RoleId, Tactics } from '../engine/types';

export interface Slot {
  /** 0=最終ライン, 1=最前線。GK は x<0。 */
  x: number;
  /** 0=左, 1=右(攻撃方向を向いて)。 */
  y: number;
  role: RoleId;
}

const gk: Slot = { x: -1, y: 0.5, role: 'gk' };
const s = (x: number, y: number, role: RoleId): Slot => ({ x, y, role });

export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-4-2': [gk, s(0.03, 0.08, 'fb'), s(0, 0.36, 'cb'), s(0, 0.64, 'cb'), s(0.03, 0.92, 'fb'),
    s(0.5, 0.08, 'wg'), s(0.48, 0.38, 'cm'), s(0.48, 0.62, 'cm'), s(0.5, 0.92, 'wg'),
    s(1, 0.36, 'st'), s(1, 0.64, 'st')],
  '4-3-3': [gk, s(0.03, 0.08, 'fb'), s(0, 0.36, 'cb'), s(0, 0.64, 'cb'), s(0.03, 0.92, 'fb'),
    s(0.34, 0.5, 'dm'), s(0.56, 0.3, 'cm'), s(0.56, 0.7, 'cm'),
    s(0.94, 0.1, 'wg'), s(1, 0.5, 'st'), s(0.94, 0.9, 'wg')],
  '4-2-3-1': [gk, s(0.03, 0.08, 'fb'), s(0, 0.36, 'cb'), s(0, 0.64, 'cb'), s(0.03, 0.92, 'fb'),
    s(0.34, 0.38, 'dm'), s(0.34, 0.62, 'dm'),
    s(0.72, 0.1, 'wg'), s(0.72, 0.5, 'am'), s(0.72, 0.9, 'wg'), s(1, 0.5, 'st')],
  '4-1-4-1': [gk, s(0.03, 0.08, 'fb'), s(0, 0.36, 'cb'), s(0, 0.64, 'cb'), s(0.03, 0.92, 'fb'),
    s(0.3, 0.5, 'dm'), s(0.62, 0.1, 'wg'), s(0.6, 0.36, 'cm'), s(0.6, 0.64, 'cm'), s(0.62, 0.9, 'wg'),
    s(1, 0.5, 'st')],
  '4-1-2-1-2': [gk, s(0.03, 0.1, 'fb'), s(0, 0.36, 'cb'), s(0, 0.64, 'cb'), s(0.03, 0.9, 'fb'),
    s(0.3, 0.5, 'dm'), s(0.5, 0.3, 'cm'), s(0.5, 0.7, 'cm'), s(0.72, 0.5, 'am'),
    s(1, 0.38, 'st'), s(1, 0.62, 'st')],
  '3-5-2': [gk, s(0, 0.24, 'cb'), s(0, 0.5, 'cb'), s(0, 0.76, 'cb'),
    s(0.5, 0.05, 'wb'), s(0.36, 0.5, 'dm'), s(0.54, 0.32, 'cm'), s(0.54, 0.68, 'cm'), s(0.5, 0.95, 'wb'),
    s(1, 0.38, 'st'), s(1, 0.62, 'st')],
  '3-4-3': [gk, s(0, 0.24, 'cb'), s(0, 0.5, 'cb'), s(0, 0.76, 'cb'),
    s(0.46, 0.05, 'wb'), s(0.42, 0.38, 'cm'), s(0.42, 0.62, 'cm'), s(0.46, 0.95, 'wb'),
    s(0.92, 0.14, 'wg'), s(1, 0.5, 'st'), s(0.92, 0.86, 'wg')],
  '3-4-2-1': [gk, s(0, 0.24, 'cb'), s(0, 0.5, 'cb'), s(0, 0.76, 'cb'),
    s(0.46, 0.05, 'wb'), s(0.4, 0.38, 'cm'), s(0.4, 0.62, 'cm'), s(0.46, 0.95, 'wb'),
    s(0.76, 0.32, 'am'), s(0.76, 0.68, 'am'), s(1, 0.5, 'st')],
  '5-4-1': [gk, s(0.05, 0.06, 'wb'), s(0, 0.28, 'cb'), s(0, 0.5, 'cb'), s(0, 0.72, 'cb'), s(0.05, 0.94, 'wb'),
    s(0.55, 0.14, 'wg'), s(0.52, 0.38, 'cm'), s(0.52, 0.62, 'cm'), s(0.55, 0.86, 'wg'),
    s(1, 0.5, 'st')],
  '5-3-2': [gk, s(0.05, 0.06, 'wb'), s(0, 0.28, 'cb'), s(0, 0.5, 'cb'), s(0, 0.72, 'cb'), s(0.05, 0.94, 'wb'),
    s(0.52, 0.24, 'cm'), s(0.48, 0.5, 'dm'), s(0.52, 0.76, 'cm'),
    s(1, 0.38, 'st'), s(1, 0.62, 'st')],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export const ROLE_LABEL: Record<RoleId, string> = {
  gk: 'GK', cb: 'CB', fb: 'SB', wb: 'WB', dm: 'アンカー', cm: 'CM', am: 'トップ下',
  wg: 'ウイング', iw: 'インサイドWG', st: 'CF', f9: '偽9番',
};

/** 枠の場所ごとに選べる役割。 */
export function roleChoices(role: RoleId): RoleId[] {
  switch (role) {
    case 'wg': case 'iw': return ['wg', 'iw'];
    case 'st': case 'f9': return ['st', 'f9'];
    case 'cm': case 'dm': case 'am': return ['dm', 'cm', 'am'];
    default: return [role];
  }
}

export const DEFAULT_TACTICS: Tactics = {
  formation: '4-2-3-1',
  buildUp: 'mixed',
  tempo: 'normal',
  width: 'normal',
  focus: 'balanced',
  fullbacks: 'stay',
  pressHeight: 'mid',
  pressIntensity: 'normal',
  lineHeight: 'normal',
  compactness: 'normal',
  marking: 'zone',
  onLoss: 'regroup',
  onWin: 'keep',
};

export const tactic = (over: Partial<Tactics>): Tactics => ({ ...DEFAULT_TACTICS, ...over });
