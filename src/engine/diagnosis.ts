import { FORMATIONS } from '../data/formations';
import { possessionPct } from './analysis';
import { MatchState, RoleId, Side, Tactics } from './types';

/** ステージ攻略の鍵。試合終了時の戦術(と試合経過)で判定する。 */
export interface StageKey {
  label: string;
  check: (t: Tactics, m: MatchState) => boolean;
  /** 満たしていない時に、何が起きていたかの説明。 */
  bad: string;
  /** どう直すか。 */
  fix: string;
}

export interface Finding {
  ok: boolean;
  title: string;
  detail: string;
  fix?: string;
}

export const rolesOf = (t: Tactics): RoleId[] => FORMATIONS[t.formation].map((s, i) => t.roles?.[i] ?? s.role);
export const countRoles = (t: Tactics, ...r: RoleId[]) => rolesOf(t).filter((x) => r.includes(x)).length;
/** 中盤の中央にいる人数(アンカー、CM、トップ下)。 */
export const centralMids = (t: Tactics) => countRoles(t, 'dm', 'cm', 'am');
/** 守備時の最終ラインの枚数(WB は守備時に最終ラインへ下がる)。 */
export const backLine = (t: Tactics) => countRoles(t, 'cb', 'fb', 'wb');
/** 後半に自分で戦術を変えたか。 */
export const changedInSecondHalf = (m: MatchState) =>
  m.events.some((e) => e.type === 'tactic' && e.team === 0 && e.minute >= 45);

const goalsAgainst = (m: MatchState, me: Side) => m.events.filter((e) => e.type === 'goal' && e.team !== me);

/** 試合の数字から、悪かった点と良かった点を探す。 */
function statFindings(m: MatchState, me: Side): Finding[] {
  const opp = (1 - me) as Side;
  const a = m.stats[me];
  const b = m.stats[opp];
  const out: Finding[] = [];
  const xgPerShot = a.xg / Math.max(1, a.shots);

  if (a.shots < 6) {
    out.push({
      ok: false, title: `シュートが ${a.shots} 本しかない`,
      detail: 'ボールを相手ゴール前まで運べていません。前線へ届く前に止められています。',
      fix: 'テンポを上げる、幅を広げる、トップ下やインサイドWGで中央に受け手を増やす、などで前進の手段を作りましょう。',
    });
  } else if (xgPerShot < 0.09) {
    out.push({
      ok: false, title: '遠くからのシュートばかり',
      detail: `シュート ${a.shots} 本の平均 xG は ${xgPerShot.toFixed(2)}。ゴールから遠い、またはコースを塞がれたシュートが多い試合でした。`,
      fix: 'ハーフスペースや相手の背後で受ける選手を増やし、ゴールに近い位置で打てる形を作りましょう。',
    });
  } else {
    out.push({ ok: true, title: 'チャンスは作れていた', detail: `シュート ${a.shots} 本、xG ${a.xg.toFixed(2)}。` });
  }

  if (a.turnoversOwnHalf >= 5) {
    out.push({
      ok: false, title: `自陣で ${a.turnoversOwnHalf} 回ボールを失った`,
      detail: '後方でつないでいるところを相手のプレスに捕まっています。自陣で奪われると、すぐ失点の危機になります。',
      fix: 'ビルドアップを「長く」にしてプレスの頭を越えるか、テンポを上げて囲まれる前に手放しましょう。',
    });
  }
  if (b.counters >= 3 || (goalsAgainst(m, me).length >= 2 && b.shots >= 10)) {
    out.push({
      ok: false, title: '攻撃中の背後を突かれた',
      detail: `相手は ${b.shots} 本のシュートを打ち、カウンターも ${b.counters} 回。攻めている時に後ろの人数が足りていません。`,
      fix: 'SBを「残る」にする、アンカーを置く、失った直後に「即時奪回」で止める、のどれかで後方を厚くしましょう。',
    });
  } else if (b.shots >= 12) {
    out.push({
      ok: false, title: `${b.shots} 本のシュートを打たれた`,
      detail: '守備ブロックが相手の攻撃を止められていません。',
      fix: '陣形を「密集」にする、最終ラインを5枚にする、などで中央を閉じましょう。',
    });
  } else if (b.shots <= 7) {
    out.push({ ok: true, title: '守備は安定していた', detail: `被シュートは ${b.shots} 本に抑えました。` });
  }

  const late = goalsAgainst(m, me).filter((e) => e.minute >= 65).length;
  if (m.energy[me] < 0.2 && late > 0) {
    out.push({
      ok: false, title: '体力切れの終盤に失点',
      detail: `試合終了時の体力は ${Math.round(m.energy[me] * 100)}%。走れなくなった65分以降に ${late} 失点しています。`,
      fix: 'プレスを続ける試合では、後半に一時停止してプレスの高さや人数を下げましょう。',
    });
  }
  if (possessionPct(m, me) > 58 && a.xg < b.xg) {
    out.push({
      ok: false, title: 'ボールを持っても崩せない',
      detail: `保持率 ${Math.round(possessionPct(m, me))}% でも xG は相手より低い。持たされている状態です。`,
      fix: '幅を広げて相手を横に引き伸ばす、ライン間で受ける選手を置く、テンポを上げる、を試しましょう。',
    });
  }
  if (a.offsides >= 4) {
    out.push({
      ok: false, title: `オフサイドが ${a.offsides} 回`,
      detail: '相手の最終ラインの裏を狙いすぎて、走り出しが早くなっています。',
      fix: '背後一辺倒にせず、足元へのパスで相手のラインを下げさせてから狙いましょう。',
    });
  }
  return out;
}

/** 試合の振り返り。ステージなら攻略の鍵を先に判定する。 */
export function diagnose(m: MatchState, keys: StageKey[] = [], me: Side = 0): { bad: Finding[]; good: Finding[] } {
  const t = m.tactics[me];
  const fromKeys: Finding[] = keys.map((k) => {
    const ok = k.check(t, m);
    return ok
      ? { ok, title: k.label, detail: 'できていました。' }
      : { ok, title: k.label, detail: k.bad, fix: k.fix };
  });
  const all = [...fromKeys, ...statFindings(m, me)];
  return { bad: all.filter((f) => !f.ok), good: all.filter((f) => f.ok) };
}
