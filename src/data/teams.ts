import { Tactics, TeamSetup } from '../engine/types';
import { tactic } from './formations';

export interface RealTeam {
  id: string;
  name: string;
  era: string;
  tag: string;
  color: string;
  tactics: Tactics;
  summary: string;
  context: string;
  principles: { title: string; text: string }[];
  weakness: string;
  /** ゲーム内の再現で単純化している点。 */
  simNote: string;
  sources: { label: string; url: string }[];
}

export const TEAMS: RealTeam[] = [
  {
    id: 'bar11', name: 'バルセロナ', era: '2010-11', tag: 'ポジショナルプレー', color: '#A3264C',
    tactics: tactic({
      formation: '4-3-3', roles: { 9: 'f9', 8: 'iw', 10: 'iw' }, buildUp: 'short', tempo: 'normal', width: 'wide',
      fullbacks: 'overlap', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress', onWin: 'keep',
    }),
    summary: 'ボールを保持し続けることで攻撃と守備を同時に行う。中盤に数的・位置的な優位を作り、相手を押し込む。',
    context: 'このシーズンは、ポジショナルな保持サッカーの一つの到達点とされる。中盤の技術と、偽9番の起用が特徴だった。',
    principles: [
      { title: '偽9番', text: 'CFが中盤まで下がって中盤に数を足し、空いた中央へ別の選手が走り込む。相手CBは出るか残るかを迫られる。' },
      { title: 'インサイドWG', text: 'ウイングが内側へ入り、CFが空けた場所を使う。大外はSBが上がって埋める。' },
      { title: '失った瞬間に奪い返す', text: 'ボールを失った直後に複数人で圧力をかける。相手が陣形を整える前に取り返す。' },
    ],
    weakness: '高い最終ラインの背後と、引いて中央を固める相手。保持が崩れた瞬間の長いカウンターが脅威になる。',
    simNote: '選手個人の技術差は再現せず、配置と判断の傾向だけをモデル化しています。',
    sources: [
      { label: 'Retro Analysis: FC Barcelona 2010/11', url: 'https://medium.com/@christophthetactician/retro-analysis-fc-barcelona-2010-11-f2de6b80c7b9' },
      { label: 'A tactical review of the 2010-11 season', url: 'https://www.inkl.com/news/a-tactical-review-of-the-2010-11-season' },
    ],
  },
  {
    id: 'mil90', name: 'ACミラン', era: '1988-90', tag: 'ゾーンプレス', color: '#C8102E',
    tactics: tactic({
      formation: '4-4-2', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', compactness: 'tight',
      marking: 'zone', onLoss: 'counterpress', tempo: 'fast',
    }),
    summary: '人ではなく場所を守るゾーンと、コンパクトな陣形からの全員プレス。現代の守備戦術の原点の一つ。',
    context: 'マンマークが主流だった時代に、4-4-2のゾーンマークと高い最終ラインで欧州を制した。守備ラインと中盤の距離を25〜30mに保ったとされる。',
    principles: [
      { title: 'ゾーンマーク', text: '担当の相手ではなく担当の場所を守る。全員が同じ基準で動くので、組織で守れる。' },
      { title: 'コンパクトな縦幅', text: '最終ラインと前線の距離を詰める。ボール周辺に常に人が多い状態を作る。' },
      { title: '高いラインとオフサイドトラップ', text: 'ラインを押し上げて相手を自陣へ閉じ込める。背後へのボールはオフサイドで無効化を狙う。' },
    ],
    weakness: '正確な背後へのボールと、ラインより先に走り出すタイミング。組織が一瞬ずれると広大なスペースが生まれる。',
    simNote: 'オフサイドの判定は現行ルールで計算しています。当時の解釈とは異なります。',
    sources: [
      { label: 'UEFA: The greatest teams of all time, AC Milan 1988-90', url: 'https://uefa.com/uefachampionsleague/news/0253-0d7ff547ca01-af062fb1225f-1000--the-greatest-teams-of-all-time-ac-milan-1988-90' },
      { label: 'Sempre Milan: 1980年代の革新', url: 'https://sempremilan.com/the-genius-of-ariggo-sacchi' },
    ],
  },
  {
    id: 'liv20', name: 'リヴァプール', era: '2019-20', tag: 'ゲーゲンプレス', color: '#C8232C',
    tactics: tactic({
      formation: '4-3-3', roles: { 8: 'iw', 10: 'iw' }, buildUp: 'mixed', tempo: 'fast', fullbacks: 'overlap',
      pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress', onWin: 'counter',
    }),
    summary: '奪われた瞬間のプレスを最大の攻撃機会にする。創造性の起点は中央ではなく両SB。',
    context: '4-3-3を基本に、非常に高い最終ラインと連動したプレスを組み合わせた。',
    principles: [
      { title: '即時奪回', text: '失った直後は相手の陣形が崩れている。そこで奪えばゴールに最も近い。' },
      { title: 'SBが攻撃の起点', text: '両SBが高い位置から攻撃を作る。ウイングは内側へ入り、ゴール前に人数を確保する。' },
      { title: 'サイドへ追い込むプレス', text: '相手をSBへ誘導し、そこで囲んで中央へパスを出させて奪う。' },
    ],
    weakness: 'SBが上がった背後でCBが1対1にされる場面。高いラインの裏を突く速いカウンター。',
    simNote: 'ゲームの体力はチーム全体で1つの値です。選手ごとの疲労や交代は再現していません。',
    sources: [
      { label: 'Football Whispers: Gegenpress at Liverpool', url: 'https://footballwhispers.com/blog/tactical-analysis-jurgen-klopps-gegenpress-at-liverpool/' },
      { label: 'Anfield Index: Pragmatism vs Idealism', url: 'https://anfieldindex.com/27365/klopps-tactics-pragmatism-vs-idealism.html' },
      { label: 'Coaching Area: Analysis of pressing', url: 'https://www.coachingarea.net/magazine/analysis-pressing-juergen-klopp' },
    ],
  },
  {
    id: 'mci23', name: 'マンチェスター・シティ', era: '2022-23', tag: 'CBの中盤化', color: '#6CABDD',
    tactics: tactic({
      formation: '4-3-3', roles: { 8: 'wg', 10: 'wg' }, buildUp: 'short', tempo: 'slow', width: 'wide', fullbacks: 'invert',
      pressHeight: 'high', pressIntensity: 'normal', lineHeight: 'high', onLoss: 'counterpress', onWin: 'keep',
    }),
    summary: '守備者を中盤へ移して後方と中盤に優位を作る。攻撃時は3-2の土台の上に前線を並べる。',
    context: 'シーズン途中から、最終ラインの選手を中盤へ上げる形に進化した。分析者によって3-2-4-1や3-2-5など呼び方は分かれる。',
    principles: [
      { title: '後方の3-2', text: '最終ラインの選手がアンカーの横に上がり、中央に2枚の土台を作る。守備時は元の位置へ戻る。' },
      { title: '捕まえにくい移動', text: '最終ラインから上がる選手は、相手にとって誰が付くか決めにくい。各局面で1人余る。' },
      { title: 'ゆっくり運び、確実に崩す', text: '急がずに相手を動かし、ボールを失っても後方の人数で止める。' },
    ],
    weakness: '後方に残る人数が少ない場面の、CBへの1対1。4人の守備者の連動が崩れると背後が空く。',
    simNote: 'ゲームでは「SBが内側に入る」設定で近い形を再現しています。実際にはCBが中盤へ上がる形でした。',
    sources: [
      { label: 'The Analyst: CBと中盤のハイブリッド役', url: 'https://theanalyst.com/2023/05/john-stones-centre-midfield-centre-back-hybrid-role/' },
      { label: 'Sky Sports: Treble-winning season', url: 'https://www.skysports.com/football/news/11679/12900340/john-stones-man-citys-defender-turned-midfielder-was-the-catalyst-in-their-treble-winning-season' },
      { label: 'Mastermind: Manchester City 2022-23', url: 'https://themastermindsite.com/2023/05/04/pep-guardiola-manchester-city-tactical-analysis-2022-23-edition/' },
    ],
  },
  {
    id: 'atm14', name: 'アトレティコ・マドリード', era: '2013-14', tag: '4-4-2ローブロック', color: '#CB3524',
    tactics: tactic({
      formation: '4-4-2', pressHeight: 'low', pressIntensity: 'normal', lineHeight: 'normal', compactness: 'tight',
      buildUp: 'long', onWin: 'counter', width: 'narrow',
    }),
    summary: '2列の4枚で中央を閉じ、奪って素早く前へ。ボール保持を手放すことを恐れない。',
    context: 'この年にラ・リーガを制した。横一列の2ラインが深く、狭く構える形が象徴的だった。',
    principles: [
      { title: '2列の4枚', text: '最終ラインと中盤の4枚が連動し、ライン間のスペースを消す。' },
      { title: '中央を閉じて外へ', text: '守備の幅を狭くして中央を塞ぎ、相手を外へ追いやる。' },
      { title: '奪ってからの縦', text: '奪ったら2トップへ素早く入れる。少ない人数で完結させる。' },
    ],
    weakness: '狭く構えるぶん、サイドが弱点になる。大きなサイドチェンジで横に振られると苦しい。',
    simNote: '選手個々の守備の強度は再現していません。セットプレーの強さも再現していません。',
    sources: [
      { label: 'Into the Calderon: How will Atletico attack Barca', url: 'https://www.intothecalderon.com/2016/4/13/11419970/analysis-how-will-atletico-attack-barca' },
      { label: 'Soccer Tutor: Atlético 4-4-2 Defending Tactics', url: 'https://soccertutor.com/products/diego-simeone-defending-tactics' },
    ],
  },
  {
    id: 'int10', name: 'インテル', era: '2009-10', tag: '堅守速攻', color: '#0B4EA2',
    tactics: tactic({
      formation: '4-2-3-1', pressHeight: 'mid', pressIntensity: 'normal', lineHeight: 'normal', compactness: 'tight',
      buildUp: 'long', onWin: 'counter', tempo: 'fast',
    }),
    summary: 'ボールを譲ってでも守備ブロックを保ち、奪った瞬間の速さで仕留める。「持たない強さ」の代表例。',
    context: '欧州の大舞台で保持型の強豪を相手に、ボールの大半を譲りながら勝ち上がった。バルセロナとの準決勝第1戦は3-1で勝利している。',
    principles: [
      { title: 'ボールを譲る', text: '保持率ではなく、危険な場所を消すことを優先する。' },
      { title: '守備の役割を全員で', text: '前線の選手も守備に下がってブロックに加わる。' },
      { title: '速攻の完結力', text: '奪ってからの少ないパスで背後を突く。' },
    ],
    weakness: '先制されると、守備的な設定のまま攻めに転じる必要が生まれる。',
    simNote: '試合展開による心理面は再現していません。',
    sources: [
      { label: 'beIN Sports: Great teams, Inter Milan 2009', url: 'https://www.beinsports.com/en/uefa-champions-league/video/champions-league-great-teams-inter-milan-2009/1449407' },
      { label: 'Goal: バルセロナ戦の守備設計', url: 'https://www.goal.com/en/news/mourinho-explains-how-he-kept-messi-in-jail-in-inters/1jz9kysk85x8t1aoziwcn70wrb' },
    ],
  },
  {
    id: 'lev24', name: 'レバークーゼン', era: '2023-24', tag: '可変3バック', color: '#E32221',
    tactics: tactic({
      formation: '3-4-2-1', buildUp: 'short', tempo: 'normal', width: 'wide', pressHeight: 'high', pressIntensity: 'normal',
      lineHeight: 'normal', onLoss: 'counterpress', onWin: 'counter',
    }),
    summary: '3バックとダブルボランチの安定した土台の上で、WBが高い位置から幅と縦の速さを加える。',
    context: '3-4-2-1を基本に、保持時は3-2-5へ、守備時は5-2-2-1などへ形を変えた。リーグ戦では5試合を残して優勝を決めた。',
    principles: [
      { title: '3-2の土台', text: '3バックとボランチ2枚で後方を安定させ、ビルドアップと即時の守備を両立する。' },
      { title: 'WBの縦への速さ', text: '大外のWBが高い位置まで上がり、相手の最終ラインを広げてテンポを加える。' },
      { title: '2シャドー', text: 'CFの背後の2枚がハーフスペースで受け、内と外の同時攻撃を作る。' },
    ],
    weakness: 'WBの背後。上がったWBの裏へ素早く展開されると、CBが外へ引き出される。',
    simNote: 'ゲームのフォーメーションは1試合で固定なので、局面ごとの細かな可変は単純化しています。',
    sources: [
      { label: 'Mastermind: Leverkusen 2023-24', url: 'https://themastermindsite.com/2023/09/08/xabi-alonso-bayer-leverkusen-tactical-analysis-2023-24/' },
      { label: 'Soccer Tutor: 3-2-5 attacking shape', url: 'https://www.soccertutor.com/blogs/inside-football-coaching/xabi-alonso-tactics-bayer-leverkusen-3-2-5-attacking-shape-wing-back-threat' },
      { label: 'Bundesliga: Tactics vs Bayern', url: 'https://www.bundesliga.com/en/bundesliga/news/tactics-how-xabi-alonso-s-bayer-leverkusen-neutralised-thomas-tuchel-s-bayern-munich-26233' },
    ],
  },
  {
    id: 'jpn22', name: '日本代表', era: '2022', tag: '後半の修正', color: '#1E3A8A',
    tactics: tactic({
      formation: '4-2-3-1', pressHeight: 'low', pressIntensity: 'normal', lineHeight: 'normal', compactness: 'tight',
      buildUp: 'long', onWin: 'counter', tempo: 'fast',
    }),
    summary: 'ボールを持たれることを受け入れて耐え、試合の中で修正して流れを変える。',
    context: 'W杯で元優勝国のドイツとスペインをともに逆転で破った。保持率はドイツ戦で26%、スペイン戦で18%と報じられている。',
    principles: [
      { title: 'ボールを持たない前提', text: '保持で上回れない相手に対し、守備の整理と速攻の精度に資源を振る。' },
      { title: 'ハーフタイムの修正', text: 'ドイツ戦は4-2-3-1で深く守り、ハーフタイムに3バックの3-4-3へ変更。前線が相手CBとGKへ圧力をかける形に変えた。' },
      { title: '短い時間に集中する', text: '流れが来た時間帯に、一気に得点を重ねる。' },
    ],
    weakness: '自分たちが主導権を持つ試合の作り方。保持を求められる相手には別の準備が必要になる。',
    simNote: 'このチームはゲーム内の「試合中の変更」を使うと学びやすいです。ハーフタイムに設定を変えてみてください。',
    sources: [
      { label: 'The National: Japan\'s comebacks', url: 'https://www.thenationalnews.com/fifa-world-cup-2022/2022/12/05/japans-rousing-comebacks-hide-limitations-of-their-counter-attacking-strategy/' },
      { label: 'Coaches\' Voice: Germany vs Japan tactics', url: 'https://learning.coachesvoice.com/cv/germany-japan-world-cup-2022-tactics/' },
    ],
  },
];

export const teamSetup = (t: RealTeam): TeamSetup => ({
  name: `${t.name} ${t.era}`,
  short: t.name.slice(0, 4),
  color: t.color,
  tactics: t.tactics,
  skill: 1,
});
