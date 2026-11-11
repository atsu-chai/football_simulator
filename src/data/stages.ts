import { CoachHint, MatchState, ScriptPhase, Tactics, TeamSetup } from '../engine/types';
import { backLine, centralMids, changedInSecondHalf, countRoles, StageKey } from '../engine/diagnosis';
import { tactic } from './formations';

export const MY_COLOR = '#3BA7F5';
export const OPP_COLOR = '#F2694C';

export interface Objective {
  id: string;
  label: string;
  check: (m: MatchState) => boolean;
}

export interface Stage {
  id: number;
  title: string;
  concept: string;
  opponent: TeamSetup;
  /** 想定解。バランス検証に使い、クリア後に「模範解答」として見せる。 */
  solution: Tactics;
  brief: string;
  scouting: string[];
  hints: string[];
  lessonWin: string;
  objectives: Objective[];
  coachHints?: CoachHint[];
  script?: ScriptPhase[];
}

const opp = (name: string, t: Partial<Tactics>, skill = 1): TeamSetup => ({
  name, short: name.slice(0, 4), color: OPP_COLOR, tactics: tactic(t), skill,
});

const cleanSheet: Objective = { id: 'cs', label: '無失点で終える', check: (m) => m.score[1] === 0 };
const margin2: Objective = { id: 'm2', label: '2点差以上で勝つ', check: (m) => m.score[0] - m.score[1] >= 2 };
const shots = (n: number): Objective => ({ id: `s${n}`, label: `シュート ${n} 本以上`, check: (m) => m.stats[0].shots >= n });
const halfSpace = (n: number): Objective => ({
  id: `hs${n}`, label: `ハーフスペースからシュート ${n} 本`, check: (m) => m.stats[0].halfSpaceShots >= n,
});
const lineBreaks = (n: number): Objective => ({
  id: `lb${n}`, label: `3人以上を越えるパス ${n} 本`, check: (m) => m.stats[0].lineBreaks >= n,
});
const concedeShots = (n: number): Objective => ({
  id: `cs${n}`, label: `被シュート ${n} 本以下`, check: (m) => m.stats[1].shots <= n,
});

export const STAGES: Stage[] = [
  {
    id: 1, title: '中盤を制する', concept: '数的優位',
    opponent: opp('ブロック・フラッツ', { formation: '4-4-2', buildUp: 'short' }),
    solution: tactic({ formation: '3-5-2', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high' }),
    brief: '相手は4-4-2。中盤は2枚だけです。あなたが中盤に3枚置けば、そこで常に1人余ります。',
    scouting: ['中盤が横一列の2枚で、その間と前後が空く', 'プレスは穏やか。後ろから短くつないでくる', 'サイドは1対1の関係ができやすい'],
    hints: ['中盤の中央に3枚置けるフォーメーションを選ぼう(3-5-2 など)', '数的関係オーバーレイで中盤の人数を確認しよう', '前から奪いに行くと中盤の余りがさらに生きる'],
    lessonWin: '人数の差はピッチのどこかに必ず余りを生みます。戦術の出発点は「どこで1人余らせるか」です。',
    objectives: [cleanSheet, margin2],
    coachHints: [{ id: 'st1', when: 'overload', text: '中盤で3対2。余った1人がフリーで前を向けるかが鍵です。', overlay: 'numbers' }],
  },
  {
    id: 2, title: '幅で揺さぶる', concept: '幅とサイドチェンジ',
    opponent: opp('ダイヤモンド・シティ', { formation: '4-1-2-1-2', width: 'narrow', compactness: 'tight' }),
    solution: tactic({ formation: '4-4-2', width: 'wide', fullbacks: 'overlap', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は中央に人を集めるダイヤモンド型。その代わり、サイドには人がいません。',
    scouting: ['中央に5人以上が密集する', 'サイドを守るのはSBだけ', '横に振ると中盤のスライドが間に合わない'],
    hints: ['幅を「広い」に設定しよう', 'SBを上げてサイドで2対1を作ろう', '5レーンのオーバーレイで大外の使い方を見よう'],
    lessonWin: '相手が中央を締めるなら、ピッチの幅を全部使う。守備者は全部の場所には立てません。',
    objectives: [margin2, shots(12)],
    coachHints: [{ id: 'st2', when: 'centerCrowded', text: '中央は渋滞しています。大外の味方へ展開しましょう。', overlay: 'lanes' }],
  },
  {
    id: 3, title: 'ハーフスペースの鍵', concept: 'ハーフスペース攻略',
    opponent: opp('セブン・ウォール', { formation: '5-4-1', pressHeight: 'mid', compactness: 'tight', onWin: 'counter', tempo: 'fast', buildUp: 'long' }, 1.3),
    solution: tactic({ formation: '4-3-3', roles: { 8: 'iw', 10: 'iw' }, width: 'wide', fullbacks: 'overlap', onLoss: 'counterpress', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は5-4-1のブロックで中央を固め、奪えば速攻を狙います。5バックの間、ハーフスペースが崩しの入口です。',
    scouting: ['最終ラインが5枚で、背後のスペースは小さい', '中盤4枚と最終ラインの間は狭いが空く', '奪われると1トップへ素早く長いボールが来る'],
    hints: ['ウイングを「インサイドWG」にして、5バックの間(ハーフスペース)に立たせよう', '幅を「広い」にしてSBで大外を取り、内側のレーンを広げよう', '奪われたら即時奪回。相手の速攻を出させない'],
    lessonWin: '大外とハーフスペースに同時に人を置くと、相手のSBやCBは「どちらに付くか」を迫られます。',
    objectives: [halfSpace(12), cleanSheet],
    coachHints: [{ id: 'st3', when: 'oppDeepBlock', text: '黄色のハーフスペースに人を置くと、5バックに迷いが生まれます。', overlay: 'lanes' }],
  },
  {
    id: 4, title: '攻めながら守る', concept: 'レストディフェンス',
    opponent: opp('スパーク・カウンターズ', { formation: '4-4-2', pressHeight: 'mid', compactness: 'tight', onWin: 'counter', tempo: 'fast', buildUp: 'long' }, 1.15),
    solution: tactic({ formation: '3-5-2', onLoss: 'counterpress', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は中盤に網を張って奪い、一気に前線へ蹴ってきます。攻めるほど背後が危険になります。',
    scouting: ['奪った瞬間に2トップが走り出す', 'ボールを持つ時間は短い', 'ビルドアップでは蹴ってくる'],
    hints: ['アンカーを置いて、攻撃中も中央に人を残そう', '3バック(3-5-2 など)か、SBを「残る」にして後ろに3人以上を残そう', '奪われた瞬間に囲む「即時奪回」を試そう'],
    lessonWin: '攻撃中の後方の配置(レストディフェンス)が、次の守備の質を決めます。',
    objectives: [cleanSheet, concedeShots(5)],
    coachHints: [{ id: 'st4', when: 'concedingCounters', text: '後方の人数が足りません。SBを残してカウンターに備えましょう。', key: true, overlay: 'lines' }],
  },
  {
    id: 5, title: 'プレスを越える', concept: 'プレス回避',
    opponent: opp('ハンターズ', { formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high' }, 0.94),
    solution: tactic({ formation: '5-4-1', buildUp: 'long', onWin: 'counter', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は高い位置から3人で奪いに来ます。前に人が多いぶん、最終ラインの背後は広大です。',
    scouting: ['前線3枚と中盤が連動して寄せてくる', '最終ラインは高く、背後に30m以上のスペース', 'ショートで繋ぐと囲まれやすい'],
    hints: ['ビルドアップを「長く」にしてプレスを飛び越えよう', '後ろに5枚置けば、蹴った後に奪い返されても耐えられる', '奪ったら速攻。相手の前線は高い位置に残っている'],
    lessonWin: 'プレスは「前に人を増やす」守備です。頭を越えられた瞬間、その人数はすべて置き去りになります。',
    objectives: [lineBreaks(68), margin2],
    coachHints: [{ id: 'st5', when: 'oppHighLine', text: '相手ラインは非常に高い。背後へ蹴れば一発で局面が変わります。', overlay: 'lines' }],
  },
  {
    id: 6, title: 'ウイングバックの裏', concept: '幅の守備の弱点',
    opponent: opp('トライデント', { formation: '3-5-2', pressHeight: 'mid' }, 0.95),
    solution: tactic({ formation: '4-4-2', width: 'wide', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は3バック。大外を守るのはウイングバック1人で、その背後はCBが見るには遠い場所です。',
    scouting: ['WBが高い位置を取ると、その裏が空く', 'CB3枚の幅は広くない', '中盤は3枚で厚い'],
    hints: ['4-4-2のウイングを大外に張らせて、幅を「広い」にしよう', '相手のCB3枚を横に広げ、2トップで間を突く', '中盤より前で奪えばWBの裏は空いたまま'],
    lessonWin: '3バックの弱点はCBの外側です。WBが出た瞬間にそこを突けば、CBが引き出されて中央も空きます。',
    objectives: [shots(12), margin2],
    coachHints: [{ id: 'st6', when: 'wingFree', text: 'WBの背後が空きました。ここへ出せばCBが釣り出されます。', overlay: 'space' }],
  },
  {
    id: 7, title: 'ライン間の住人', concept: 'ライン間の活用',
    opponent: opp('グリッド・ユナイテッド', { formation: '4-2-3-1', compactness: 'normal', pressHeight: 'mid' }),
    solution: tactic({ formation: '4-2-3-1', roles: { 7: 'iw', 9: 'iw' }, pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '整理されたゾーン守備です。人を捕まえに来ないので、守備者と守備者の間にいれば受けられます。',
    scouting: ['ゾーンの間で受ける選手に寄せるのが遅い', 'ボランチ2枚の前後に段差ができる', '4バックの横のスライドは堅実'],
    hints: ['陣形はそのままでいい。ウイングを「インサイドWG」にして内側で受けよう', 'トップ下と合わせて、相手の中盤と最終ラインの間に3人が立つ', '前から奪いに行き、ライン間で受ける回数を増やそう'],
    lessonWin: 'ゾーン守備は「場所」を守るので、守備者の間の場所に立つことが最大の攻撃になります。',
    objectives: [lineBreaks(62), concedeShots(5)],
  },
  {
    id: 8, title: 'マンツーマン崩し', concept: '偽9とローテーション',
    opponent: opp('シャドウズ', { formation: '3-5-2', marking: 'man', pressHeight: 'high', pressIntensity: 'normal' }),
    solution: tactic({ formation: '4-2-3-1', roles: { 10: 'f9', 7: 'iw', 9: 'iw' }, fullbacks: 'overlap', tempo: 'fast', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '全員が1人ずつマークに付いてきます。味方が動けば相手も動きます。つまり、相手の配置を操作できます。',
    scouting: ['担当の相手にどこまでも付いてくる', '動き出しへの反応は一瞬遅れる', 'カバーリングの余り人がいないので、1人剥がされると一気に崩れる'],
    hints: ['陣形はそのままでいい。CFを偽9番にして相手CBを釣り出そう', 'ウイングをインサイドWGにして、空いた中央へ走り込ませよう', 'テンポを上げ、SBも上げて担当者を動かし続けよう'],
    lessonWin: '人に付く守備は、こちらの動きで崩せます。動く選手と空いた場所を使う選手を分けるのが鍵です。',
    objectives: [margin2, shots(19)],
    coachHints: [{ id: 'st8', when: 'oppManMark', text: '相手は人に付いています。CFが下がるとCBも釣れてゴール前が空きます。', overlay: 'space' }],
  },
  {
    id: 9, title: 'ゼロトップ対策', concept: '釣り出しへの対処',
    opponent: opp('ファントム', { formation: '4-3-3', roles: { 9: 'f9', 8: 'iw', 10: 'iw' }, pressHeight: 'mid', buildUp: 'short' }),
    solution: tactic({ formation: '5-3-2', compactness: 'tight', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手にCFがいません。CBが誰を見るか迷った瞬間に、WGが内側へ走り込んできます。',
    scouting: ['CFが中盤まで下がってくる', 'WGが斜めに最終ラインの裏へ走る', '最前線に基準点がないので押し返しやすい'],
    hints: ['中盤の中央に3枚置き、下がるCFを中盤で捕まえよう(5-3-2 など)', 'コンパクトに保ち、CBは釣り出されないように', '基準点のない相手には2トップで押し返せる'],
    lessonWin: '釣り出しへの答えは、CBが出なくて済むように中盤で捕まえることです。役割の受け渡しが守備の要です。',
    objectives: [concedeShots(7), margin2],
  },
  {
    id: 10, title: '5レーンを塞ぐ', concept: '3-2-5への対抗',
    opponent: opp('ファイブ・レーンズ', { formation: '4-3-3', fullbacks: 'invert', width: 'wide', pressHeight: 'high', lineHeight: 'high', onLoss: 'counterpress', buildUp: 'short' }, 0.95),
    solution: tactic({ formation: '5-3-2', compactness: 'tight', onWin: 'counter', buildUp: 'long', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は攻撃時に5レーンすべてへ人を置きます。4バックでは大外とハーフスペースを同時に守り切れません。',
    scouting: ['SBが内側に入り、後方は3-2の形になる', '前線5人が全レーンに立つ', 'ボールを失うと後方は5人だけ'],
    hints: ['WBが下がって5枚になる形で全レーンを埋めよう', '中央を閉じて外へ追いやる', '奪ったら前線2枚へ長いボールで速攻'],
    lessonWin: '5レーンには5人で対応する。ただし守り切るだけでなく、相手の前がかりを速攻で刺します。',
    objectives: [cleanSheet, concedeShots(7)],
  },
  {
    id: 11, title: '切り替えの戦争', concept: 'ゲーゲンプレス対策',
    opponent: opp('リップタイド', { formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress', tempo: 'fast' }, 0.97),
    solution: tactic({ formation: '5-3-2', buildUp: 'long', onWin: 'counter', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '相手は奪われた瞬間に3人で囲み、奪えばすぐ縦へ攻めます。最も速いチームです。',
    scouting: ['ボールを失った5秒間の圧力が非常に強い', '密集を作るぶん逆サイドが空く', '最終ラインは高い'],
    hints: ['最終ラインに5枚置いて背後を消そう', 'ビルドアップは長く、囲まれる前に手放す', '相手の体力が落ちる後半が勝負どころ'],
    lessonWin: '即時奪回は最初の5秒が勝負です。その5秒を越える速さと距離が、最大の対策になります。',
    objectives: [margin2, cleanSheet],
  },
  {
    id: 12, title: '変化する相手', concept: '試合中の修正',
    opponent: opp('カメレオン', { formation: '5-4-1', pressHeight: 'low', lineHeight: 'deep', compactness: 'tight' }, 1.3),
    solution: tactic({ formation: '5-3-2', width: 'wide', onLoss: 'counterpress', pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'normal' }),
    brief: '最終試験です。相手は点差と時間に応じて戦術を変えてきます。一時停止とハーフタイムを使って修正してください。',
    scouting: ['前半は5-4-1で深く守る', '後半に入るとハイプレスへ切り替える', 'ビハインドになると前線の人数を増やす'],
    hints: ['前半は低いブロックを崩す設定で入ろう', 'ハーフタイムにプレス対策へ切り替えよう', '数的関係のオーバーレイで相手の変化に気づこう'],
    lessonWin: '良い監督は、最初の答えより二番目の答えが速い。相手の変化に気づき、言語化し、修正する。それが戦術理解です。',
    objectives: [margin2, cleanSheet],
    script: [
      { atMinute: 45, change: { formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', compactness: 'normal' }, message: '相手が4-3-3のハイプレスに変更!' },
      { whenDiffAtMost: -2, change: { formation: '3-4-3', onWin: 'counter', tempo: 'fast', buildUp: 'long' }, message: '相手が3-4-3で前線の人数を増やしてきた!' },
    ],
    coachHints: [
      { id: 'st12a', when: 'halfTime2', text: '相手の形が変わりました。最終ラインの高さを確認してください。', key: true, overlay: 'lines' },
    ],
  },
];

export const myTeamBase = (t: Tactics): TeamSetup => ({
  name: 'あなたのチーム', short: 'YOU', color: MY_COLOR, tactics: t, skill: 1,
});

const k = (label: string, check: StageKey['check'], bad: string, fix: string): StageKey => ({ label, check, bad, fix });
const pressHigh = k(
  '前から奪いに行く',
  (t) => t.pressHeight === 'high',
  '待って守っていたので、相手は楽に前を向いて運べていました。',
  '「プレスの高さ」を「高い」にしましょう。',
);
const wide = k(
  '攻撃の幅を広く取る',
  (t) => t.width === 'wide',
  '幅が足りず、相手の守備者が横に動かずに守れていました。',
  '「攻撃の幅」を「広い」にして、大外にも人を置きましょう。',
);
const counterpress = k(
  '失った直後に奪い返す',
  (t) => t.onLoss === 'counterpress',
  'ボールを失うたびに帰陣していたので、相手は落ち着いて反撃できていました。',
  '「ボールを失った時」を「即時奪回」にしましょう。',
);
const goLong = k(
  'プレスを長いボールで越える',
  (t) => t.buildUp === 'long',
  '後ろからつなごうとして、相手が人数をかけて囲む場所にボールを運んでいました。',
  '「ビルドアップ」を「長く」にして、相手の頭を越えましょう。',
);
const counter = k(
  '奪ったら速攻',
  (t) => t.onWin === 'counter',
  '奪った後に落ち着いてしまい、相手に守備を整える時間を与えていました。',
  '「ボールを奪った時」を「速攻」にしましょう。',
);
const fiveBack = k(
  '最終ラインを5枚にする',
  (t) => backLine(t) >= 5,
  `最終ラインが4枚以下で、相手の攻撃の人数を受け止めきれていませんでした。`,
  '5-3-2、3-5-2、5-4-1 など、WBが下がって5枚になる形を選びましょう。',
);
const twoStrikers = k(
  '2トップを置く',
  (t) => countRoles(t, 'st', 'f9') >= 2,
  'FWが1人で、相手のCBに数的優位で守られていました。',
  '4-4-2 や 3-5-2 など、FWを2人置く形にしましょう。',
);

/** ステージごとの攻略の鍵。失敗した時に、どれが足りなかったかを示す。 */
export const STAGE_KEYS: Record<number, StageKey[]> = {
  1: [
    k('中盤の中央に3人以上', (t) => centralMids(t) >= 3, '中盤の中央で相手の2枚と同数かそれ以下になり、余る選手がいませんでした。', '4-3-3 や 4-2-3-1 など、中盤の中央に3人置く形を選びましょう。'),
    pressHigh,
  ],
  2: [wide, k('中央に攻めを偏らせない', (t) => t.focus !== 'center', '人の多い中央を攻め続けていました。', '「攻撃の方向」を「両方」か左右どちらかにしましょう。'), pressHigh],
  3: [
    k('ハーフスペースに2人', (t) => countRoles(t, 'am', 'iw') >= 2, '5バックの間(ハーフスペース)で受ける選手がいませんでした。', '3-4-2-1 のトップ下2枚や、インサイドWGを置きましょう。'),
    wide,
    counterpress,
  ],
  4: [
    k('SBを上げすぎない', (t) => t.fullbacks !== 'overlap', 'SBが上がった背後を、相手の2トップに何度も突かれていました。', '「SBの動き」を「残る」にしましょう。'),
    counterpress,
    k('中央の守備役を置く', (t) => countRoles(t, 'dm') >= 1, '攻撃中に中央を守る選手がおらず、カウンターの通り道が空いていました。', 'アンカーを置ける形(4-1-2-1-2、4-3-3 など)にしましょう。'),
  ],
  5: [goLong, counter, fiveBack],
  6: [wide, twoStrikers, pressHigh],
  7: [
    k('ライン間に2人', (t) => countRoles(t, 'am', 'iw', 'f9') >= 2, '相手の中盤と最終ラインの間で受ける選手が足りませんでした。', '3-4-2-1 のトップ下2枚か、インサイドWG・偽9番を使いましょう。'),
    pressHigh,
  ],
  8: [
    k('偽9番で釣り出す', (t) => countRoles(t, 'f9') >= 1, 'CFが前線に張っていたので、相手のCBは動かずにマークできていました。', 'CFの役割を「偽9番」にしましょう。'),
    k('空いた場所へ走り込む選手', (t) => countRoles(t, 'iw') >= 1, '偽9番が空けた中央へ入っていく選手がいませんでした。', 'ウイングを「インサイドWG」にしましょう。'),
    k('テンポを上げる', (t) => t.tempo === 'fast', '判断がゆっくりで、マークに付く時間を相手に与えていました。', '「テンポ」を「速い」にしましょう。'),
  ],
  9: [
    k('陣形を密集させる', (t) => t.compactness === 'tight', '守備の間隔が広く、下がるCFと飛び出すWGの両方に場所を与えていました。', '「陣形」を「密集」にしましょう。'),
    k('人ではなく場所を守る', (t) => t.marking === 'zone', '人に付いたCBが釣り出され、背後が空いていました。', '「マーク」を「ゾーン」にしましょう。'),
    twoStrikers,
  ],
  10: [fiveBack, k('中央を閉じる', (t) => t.compactness === 'tight', '守備の間隔が広く、5レーンに立つ相手の間を通されていました。', '「陣形」を「密集」にしましょう。'), counter],
  11: [goLong, counter, fiveBack],
  12: [
    k('後半に修正する', (_t, m) => changedInSecondHalf(m), '相手は後半に形を変えましたが、同じ設定のまま戦っていました。', 'ハーフタイムか一時停止で、相手の変化に合わせて設定を変えましょう。'),
    wide,
    pressHigh,
  ],
};
