import { fieldTilt, possessionPct, ppda } from '../../engine/analysis';
import { MatchState } from '../../engine/types';

function Stat({ label, a, b, fmt, colors, lowerBetter }: {
  label: string; a: number; b: number; fmt?: (n: number) => string; colors: [string, string]; lowerBetter?: boolean;
}) {
  const f = fmt ?? ((n: number) => String(Math.round(n)));
  const total = a + b || 1;
  const left = lowerBetter ? b : a;
  return (
    <div className="stat">
      <span className="val">{f(a)}</span>
      <div>
        <div className="mid">{label}</div>
        <div className="bar" aria-hidden>
          <i style={{ width: `${(left / total) * 100}%`, background: colors[0] }} />
          <i style={{ flex: 1, background: colors[1] }} />
        </div>
      </div>
      <span className="val r">{f(b)}</span>
    </div>
  );
}

export function StatsTable({ m }: { m: MatchState }) {
  const [a, b] = m.stats;
  const colors: [string, string] = [m.cfg.teams[0].color, m.cfg.teams[1].color];
  const pct = (n: number) => `${Math.round(n)}%`;
  return (
    <div>
      <Stat label="xG" a={a.xg} b={b.xg} fmt={(n) => n.toFixed(2)} colors={colors} />
      <Stat label="シュート" a={a.shots} b={b.shots} colors={colors} />
      <Stat label="枠内" a={a.onTarget} b={b.onTarget} colors={colors} />
      <Stat label="保持率" a={possessionPct(m, 0)} b={possessionPct(m, 1)} fmt={pct} colors={colors} />
      <Stat label="パス成功" a={a.passesDone} b={b.passesDone} colors={colors} />
      <Stat label="3人越えのパス" a={a.lineBreaks} b={b.lineBreaks} colors={colors} />
      <Stat label="PPDA(低いほど前から奪う)" a={ppda(m, 0)} b={ppda(m, 1)} fmt={(n) => n.toFixed(1)} colors={colors} lowerBetter />
      <Stat label="フィールドティルト" a={fieldTilt(m, 0)} b={fieldTilt(m, 1)} fmt={pct} colors={colors} />
      <Stat label="敵陣での奪取" a={a.ballWinsHigh} b={b.ballWinsHigh} colors={colors} />
      <Stat label="オフサイド" a={a.offsides} b={b.offsides} colors={colors} />
    </div>
  );
}
