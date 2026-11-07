import { FORMATION_IDS, FORMATIONS, ROLE_LABEL, roleChoices } from '../../data/formations';
import { RoleId, Tactics } from '../../engine/types';

type Key = keyof Pick<Tactics, 'buildUp' | 'tempo' | 'width' | 'focus' | 'fullbacks' | 'pressHeight' | 'pressIntensity' | 'lineHeight' | 'compactness' | 'marking' | 'onLoss' | 'onWin'>;

interface Opt { v: string; l: string; d: string }
interface Field { key: Key; label: string; opts: Opt[] }

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'ボール保持', fields: [
      { key: 'buildUp', label: 'ビルドアップ', opts: [
        { v: 'short', l: '短く', d: '後方から細かくつなぐ。保持は安定するが、プレスに捕まると自陣で失う。' },
        { v: 'mixed', l: '混合', d: '状況に応じてつなぎと長いボールを使い分ける。' },
        { v: 'long', l: '長く', d: '早めに前線へ蹴る。プレスを飛び越えられるが、保持率は下がる。' },
      ] },
      { key: 'tempo', label: 'テンポ', opts: [
        { v: 'slow', l: '遅い', d: '判断をゆっくり。相手を動かして隙を待つ。' },
        { v: 'normal', l: '普通', d: '標準のテンポ。' },
        { v: 'fast', l: '速い', d: '素早く縦へ。崩れた相手を突くが、ミスも増える。' },
      ] },
      { key: 'width', label: '攻撃の幅', opts: [
        { v: 'narrow', l: '狭い', d: '中央に集まる。近い距離で崩すが、守備者も集まる。' },
        { v: 'normal', l: '普通', d: '標準の幅。' },
        { v: 'wide', l: '広い', d: '大外まで使い、相手を横に広げる。サイドチェンジが増える。' },
      ] },
      { key: 'focus', label: '攻撃の方向', opts: [
        { v: 'left', l: '左', d: '左サイドに人とボールを寄せる。' },
        { v: 'balanced', l: '両方', d: '偏らせずに攻める。' },
        { v: 'center', l: '中央', d: '中央からゴールを目指す。' },
        { v: 'right', l: '右', d: '右サイドに人とボールを寄せる。' },
      ] },
      { key: 'fullbacks', label: 'SBの動き', opts: [
        { v: 'stay', l: '残る', d: '後ろに残ってカウンターに備える。攻撃の人数は減る。' },
        { v: 'overlap', l: '上がる', d: '大外を駆け上がる。背後のスペースはリスクになる。' },
        { v: 'invert', l: '内側へ', d: '中盤に入って中央の数を増やす(偽SB)。' },
      ] },
    ],
  },
  {
    title: 'ボール非保持', fields: [
      { key: 'pressHeight', label: 'プレスの高さ', opts: [
        { v: 'low', l: '低い', d: '自陣で構える。スペースを消すが、押し込まれる。' },
        { v: 'mid', l: '中間', d: '中盤で網を張る。' },
        { v: 'high', l: '高い', d: '敵陣から奪いに行く。背後は空き、体力も減る。' },
      ] },
      { key: 'pressIntensity', label: 'プレスの人数', opts: [
        { v: 'low', l: '1人', d: 'ボールに1人だけ。陣形は崩れない。' },
        { v: 'normal', l: '2人', d: '2人で連動して寄せる。' },
        { v: 'high', l: '3人', d: '3人で囲む。外されると数的不利になり、体力も早く減る。' },
      ] },
      { key: 'lineHeight', label: '最終ライン', opts: [
        { v: 'deep', l: '深い', d: '背後のスペースを消す。中盤との距離は開きやすい。' },
        { v: 'normal', l: '普通', d: '標準の高さ。' },
        { v: 'high', l: '高い', d: '押し上げてオフサイドも狙う。背後へのボールに弱い。' },
      ] },
      { key: 'compactness', label: '陣形', opts: [
        { v: 'loose', l: '広い', d: '広く守る。サイドに強いが、ライン間が空く。' },
        { v: 'normal', l: '普通', d: '標準の陣形。' },
        { v: 'tight', l: '密集', d: '縦横を狭める。中央に強いが、サイドが空く。' },
      ] },
      { key: 'marking', label: 'マーク', opts: [
        { v: 'zone', l: 'ゾーン', d: '場所を守る。組織的だがライン間で受けられやすい。' },
        { v: 'man', l: '人基準', d: '担当の相手に付く。自由を奪うが、釣り出されやすい。' },
      ] },
    ],
  },
  {
    title: '切り替え', fields: [
      { key: 'onLoss', label: 'ボールを失った時', opts: [
        { v: 'regroup', l: '帰陣', d: 'すぐ戻って守備ブロックを作る。' },
        { v: 'counterpress', l: '即時奪回', d: '失った直後に3人で囲む。外されるとカウンターを受ける。' },
      ] },
      { key: 'onWin', label: 'ボールを奪った時', opts: [
        { v: 'keep', l: '保持', d: '落ち着いてつなぎ、陣形を整える。' },
        { v: 'counter', l: '速攻', d: '相手が戻る前に縦へ。CFも前線に残る。' },
      ] },
    ],
  },
];

export function TacticsPanel({ t, onChange, formationLocked }: { t: Tactics; onChange: (t: Tactics) => void; formationLocked?: boolean }) {
  const slots = FORMATIONS[t.formation];
  const rows = slots
    .map((s, i) => ({ s, i, choices: roleChoices(s.role) }))
    .filter((r) => r.choices.length > 1);
  return (
    <div>
      <div className="group-title">配置</div>
      <div className="field">
        <label htmlFor="formation">フォーメーション</label>
        <select
          id="formation"
          value={t.formation}
          disabled={formationLocked}
          onChange={(e) => onChange({ ...t, formation: e.target.value as Tactics['formation'], roles: undefined, offsets: undefined })}
        >
          {FORMATION_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="role-grid field">
        {rows.map(({ s, i, choices }) => (
          <div key={i}>
            <label className="small muted" htmlFor={`role${i}`}>#{[1, 2, 4, 5, 3, 6, 8, 10, 7, 11, 9][i]} の役割</label>
            <select
              id={`role${i}`}
              value={t.roles?.[i] ?? s.role}
              onChange={(e) => onChange({ ...t, roles: { ...t.roles, [i]: e.target.value as RoleId } })}
            >
              {choices.map((c) => <option key={c} value={c}>{ROLE_LABEL[c]}</option>)}
            </select>
          </div>
        ))}
      </div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="group-title">{g.title}</div>
          {g.fields.map((f) => {
            const cur = f.opts.find((o) => o.v === t[f.key]);
            return (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <div className="seg" role="group" aria-label={f.label}>
                  {f.opts.map((o) => (
                    <button
                      key={o.v}
                      className={t[f.key] === o.v ? 'on' : ''}
                      aria-pressed={t[f.key] === o.v}
                      onClick={() => onChange({ ...t, [f.key]: o.v } as Tactics)}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                <div className="desc">{cur?.d}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
