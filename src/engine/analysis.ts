import { MatchState, Side } from './types';

export const possessionPct = (m: MatchState, s: Side) => {
  const a = m.stats[s].possessionTicks;
  const b = m.stats[(1 - s) as Side].possessionTicks;
  return (a / Math.max(1, a + b)) * 100;
};

/** 相手の守備アクション1回あたりに、相手が許したパス数。低いほど前から奪えている。 */
export const ppda = (m: MatchState, s: Side) => {
  const opp = (1 - s) as Side;
  return m.stats[opp].passesOwn60 / Math.max(1, m.stats[s].defActionsHigh);
};

/** 相手陣でのパスのうち、自チームが占める割合。 */
export const fieldTilt = (m: MatchState, s: Side) => {
  const a = m.stats[s].finalThirdPasses;
  const b = m.stats[(1 - s) as Side].finalThirdPasses;
  return (a / Math.max(1, a + b)) * 100;
};

/** 試合の数字から「なぜこの結果になったか」を文章にする。 */
export function explain(m: MatchState, me: Side): string[] {
  const opp = (1 - me) as Side;
  const a = m.stats[me];
  const b = m.stats[opp];
  const out: string[] = [];
  const won = m.score[me] > m.score[opp];
  const lost = m.score[me] < m.score[opp];

  if (a.xg > b.xg + 0.4) {
    out.push(won
      ? `xG ${a.xg.toFixed(2)} 対 ${b.xg.toFixed(2)}。質の高い決定機を多く作れた内容通りの勝利です。`
      : `xG ${a.xg.toFixed(2)} 対 ${b.xg.toFixed(2)} と内容では上回りました。戦術は機能しているので、もう一度試す価値があります。`);
  } else if (b.xg > a.xg + 0.4) {
    out.push(won
      ? `xG ${a.xg.toFixed(2)} 対 ${b.xg.toFixed(2)} で、内容では押されていました。結果に満足せず、守備を見直しましょう。`
      : `xG ${a.xg.toFixed(2)} 対 ${b.xg.toFixed(2)}。チャンスの質で相手に上回られました。`);
  } else {
    out.push(`xG ${a.xg.toFixed(2)} 対 ${b.xg.toFixed(2)}。チャンスの質はほぼ互角でした。`);
  }

  const pa = possessionPct(m, me);
  if (pa > 58 && a.shots < b.shots) out.push('ボールは持てましたが、シュート数で下回りました。保持が攻撃につながっていません。');
  if (pa < 42 && a.xg >= b.xg) out.push('保持率は低くても危険な場面は作れました。ボールを持たない戦い方が機能しています。');
  if (a.turnoversOwnHalf >= 5) out.push(`自陣でのボールロストが ${a.turnoversOwnHalf} 回。相手のプレスに捕まっています。`);
  if (a.ballWinsHigh >= 6) out.push(`敵陣で ${a.ballWinsHigh} 回ボールを奪いました。前からの守備が効いています。`);
  if (b.counters >= 4) out.push(`相手のカウンターを ${b.counters} 回受けました。攻撃時の後方の人数を見直しましょう。`);
  if (a.counters >= 4) out.push(`カウンターの機会を ${a.counters} 回作りました。奪ってからの速さが出ています。`);
  if (a.lineBreaks >= 10) out.push(`3人以上を越えるパスを ${a.lineBreaks} 本通しました。相手のラインを破れています。`);
  if (a.halfSpaceShots >= 3) out.push(`ハーフスペースからのシュートが ${a.halfSpaceShots} 本。崩しの形が作れています。`);
  if (b.offsides >= 3) out.push(`オフサイドを ${b.offsides} 回取りました。最終ラインの統率が機能しています。`);
  if (lost && a.shots <= 4) out.push('シュートが少なすぎます。ボールを前線へ運ぶ手順から見直しましょう。');
  return out.slice(0, 5);
}
