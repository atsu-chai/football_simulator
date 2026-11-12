// ストーリーモード: 地域リーグ上がりのクラブを率いて JFL から世界一を目指す。
// 対戦クラブはすべて架空。相手は章が進むほど上手くなり、戦い方も多彩になる。
import { Tactics, TeamSetup } from '../engine/types';
import { tactic } from './formations';
import { lessonSkillMod } from './stages';

/** 相手の戦い方。スカウティングと弱点のヒントを添える。 */
interface Style {
  tactics: Partial<Tactics>;
  scouting: string;
  weakness: string;
}

const STYLES = {
  flat442: {
    tactics: { formation: '4-4-2' },
    scouting: '4-4-2 の2ラインで、中盤は2枚だけ。',
    weakness: '中盤を3枚以上にし、前から奪いに行くと、余った1人が前を向けます。',
  },
  diamond: {
    tactics: { formation: '4-1-2-1-2', width: 'narrow', compactness: 'tight' },
    scouting: '中央に人を集めたダイヤモンド。サイドには人が少ない。',
    weakness: '攻撃の幅を広く取り、大外とサイドチェンジで揺さぶり、前から奪いに行きましょう。',
  },
  bus: {
    tactics: { formation: '5-4-1', pressHeight: 'low', lineHeight: 'deep', compactness: 'tight' },
    scouting: '5バックで自陣に引きこもる。前に出てこない。',
    weakness: '内に入るウイングを2人置き、幅で5枚を横に広げます。失ったら即時奪回で速攻を防ぎましょう。',
  },
  counter: {
    tactics: { formation: '4-4-2', compactness: 'tight', onWin: 'counter', tempo: 'fast', buildUp: 'long' },
    scouting: '引いて奪ったら一気に縦へ。カウンターが鋭い。',
    weakness: 'SBを上げすぎず、アンカーを残し、失ったら即時奪回で速攻の芽を摘みましょう。',
  },
  hunters: {
    tactics: { formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high' },
    scouting: '前線から激しく追い、最終ラインもとても高い。',
    weakness: '後ろを5枚で固め、ロングボールと速攻で、高いラインの背後を突きましょう。',
  },
  wingbacks: {
    tactics: { formation: '3-5-2', pressHeight: 'mid' },
    scouting: '3-5-2。サイドはウイングバック1人で上下する。',
    weakness: '幅を広く取り、前から奪ってWBの背後へ。2トップでCBの間を狙いましょう。',
  },
  zone4231: {
    tactics: { formation: '4-2-3-1', pressHeight: 'mid' },
    scouting: 'ゾーンで守る 4-2-3-1。ラインの間はやや空きがち。',
    weakness: 'ウイングを内に入れ、ライン間で受ける選手を2人以上に。前から奪って攻撃を続けましょう。',
  },
  manmark: {
    tactics: { formation: '3-5-2', marking: 'man', pressHeight: 'high' },
    scouting: '全員が人に付くマンツーマン。',
    weakness: '速いテンポで偽9番がCBを釣り出し、内に入るウイングが空いたゴール前へ走り込みましょう。',
  },
  falseNine: {
    tactics: { formation: '4-3-3', roles: { 9: 'f9', 8: 'iw', 10: 'iw' }, buildUp: 'short' },
    scouting: 'CFが下がってくるゼロトップ。中盤で数的優位を作ってくる。',
    weakness: 'コンパクトなゾーンで中盤を締め、下がる9番にCBが釣られないように。2トップで押し返しましょう。',
  },
  positional: {
    tactics: { formation: '4-3-3', fullbacks: 'invert', width: 'wide', pressHeight: 'high', lineHeight: 'high', onLoss: 'counterpress', buildUp: 'short' },
    scouting: '3-2-5 に変形して5つのレーンを埋める、ボール保持の強豪。',
    weakness: '5人の前線には5枚の最終ラインと密集した中央で対抗し、奪ったら背後へ速攻を。',
  },
  gegen: {
    tactics: { formation: '4-3-3', pressHeight: 'high', pressIntensity: 'high', lineHeight: 'high', onLoss: 'counterpress', tempo: 'fast' },
    scouting: '失った瞬間に囲みに来るゲーゲンプレス。切り替えが最速。',
    weakness: '5枚の最終ラインで備え、囲まれる前のロングボールと、奪った直後の速攻で上回りましょう。',
  },
} satisfies Record<string, Style>;

export type StyleId = keyof typeof STYLES;

/** 学習ステージとストーリーで攻略の鍵を共有する。 */
export const STYLE_STAGE: Record<StyleId, number> = {
  flat442: 1, diamond: 2, bus: 3, counter: 4, hunters: 5, wingbacks: 6,
  zone4231: 7, manmark: 8, falseNine: 9, positional: 10, gegen: 11,
};
// ストーリーは全スタイル共通の補正。学習ステージの強い個別補正は持ち込まない。
export const STORY_WEAKNESS = 0.65;

export interface StoryOpponent {
  name: string;
  color: string;
  style: StyleId;
  skill: number;
}

export interface Chapter {
  id: number;
  /** 舞台(JFL、J3 …)。 */
  league: string;
  title: string;
  /** league: 勝ち点で昇格を争う。cup: 一発勝負の勝ち抜き(引き分けは PK 戦)。 */
  format: 'league' | 'cup';
  /** league の昇格に必要な勝ち点。 */
  target?: number;
  /** この章でのあなたのクラブの地力。クラブが大きくなるほど上がる。 */
  mySkill: number;
  intro: string;
  clear: string;
  fail: string;
  /** 試合ごとの見出し(cup の「準決勝」など)。 */
  roundNames?: string[];
  opponents: StoryOpponent[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1, league: 'JFL', title: '町クラブの挑戦', format: 'league', target: 7, mySkill: 1.05,
    intro: '地域リーグから上がってきたばかりのクラブに、あなたは監督として招かれた。スタンドは身内ばかり、予算も最下位。それでも戦術なら、どのクラブにも負けない。まずは JFL を勝ち抜き、J3 への切符をつかもう。',
    clear: 'JFL を突破し、J3 昇格が決まった。町の商店街に、クラブの旗が並び始めた。',
    fail: '勝ち点が足りず、昇格を逃した。相手の形をもう一度よく見て、来季こそ。',
    opponents: [
      { name: '浜風FC', color: '#F2694C', style: 'flat442', skill: 0.82 },
      { name: '北嶺ユナイテッド', color: '#E8C547', style: 'counter', skill: 0.84 },
      { name: '港町SC', color: '#F2694C', style: 'diamond', skill: 0.85 },
      { name: '緑ヶ丘FC', color: '#4CC38A', style: 'bus', skill: 0.87 },
    ],
  },
  {
    id: 2, league: 'J3', title: 'プロの洗礼', format: 'league', target: 7, mySkill: 1.08,
    intro: 'ついに J リーグの一員になった。だが相手は全員プロ。走る量も、ミスを突く速さも JFL とは違う。前から来る相手、引いて守る相手。どう崩し、どう守るかを使い分けよう。',
    clear: 'J3 を勝ち抜き、J2 昇格。新しいスポンサーが付き、補強もできた。',
    fail: 'プロの壁は厚かった。シーズンをやり直して、昇格をつかみ直そう。',
    opponents: [
      { name: '白鷺SC', color: '#F4F1E8', style: 'hunters', skill: 0.88 },
      { name: '岬アスレティック', color: '#F2694C', style: 'wingbacks', skill: 0.9 },
      { name: '霧島FC', color: '#9B7BE0', style: 'counter', skill: 0.91 },
      { name: '雷鳥ユナイテッド', color: '#E8C547', style: 'zone4231', skill: 0.93 },
    ],
  },
  {
    id: 3, league: 'J2', title: '長いシーズン', format: 'league', target: 10, mySkill: 1.12,
    intro: 'J2 は1年が長く、相手は研究してくる。あなたのクラブの戦い方も、もう知られている。相手ごとに戦術を変える監督だけが、J1 への階段を上れる。',
    clear: 'J2 を勝ち抜き、悲願の J1 昇格。満員のスタジアムに、あなたの名前が響いた。',
    fail: '昇格争いから脱落した。相手ごとの弱点を突けていたか、振り返ってみよう。',
    opponents: [
      { name: '大河FC', color: '#F2694C', style: 'falseNine', skill: 0.95 },
      { name: '樹海ヴィクトリー', color: '#4CC38A', style: 'bus', skill: 0.97 },
      { name: '鋼鉄シティ', color: '#B0B7C3', style: 'manmark', skill: 0.98 },
      { name: '青嵐SC', color: '#E8C547', style: 'diamond', skill: 1.0 },
      { name: '紅葉アスレティック', color: '#E04F5F', style: 'hunters', skill: 1.01 },
    ],
  },
  {
    id: 4, league: 'J1', title: '頂点への挑戦', format: 'league', target: 12, mySkill: 1.15,
    intro: '日本の頂点、J1。相手の多くは代表選手をそろえ、戦術も洗練されている。優勝しなければ、アジアへの扉は開かない。',
    clear: 'J1 優勝。昇格組の快進撃に国中が沸き、アジアへの挑戦権を手にした。',
    fail: '優勝には届かなかった。強豪の型を見抜き、もう一度シーズンに挑もう。',
    opponents: [
      { name: '王都FC', color: '#E04F5F', style: 'zone4231', skill: 0.99 },
      { name: '東邦ユナイテッド', color: '#F4F1E8', style: 'positional', skill: 1.01 },
      { name: '黒潮マリンズ', color: '#2E4A7A', style: 'counter', skill: 1.02 },
      { name: '旭日SC', color: '#E8C547', style: 'gegen', skill: 1.03 },
      { name: '古都ヴィッセ', color: '#9B7BE0', style: 'manmark', skill: 1.05 },
    ],
  },
  {
    id: 5, league: 'アジア', title: 'アジアの覇権', format: 'cup', mySkill: 1.17,
    roundNames: ['準々決勝', '準決勝', '決勝'],
    intro: 'アジア王者決定戦。各国の王者が集まる一発勝負のトーナメントだ。負ければ終わり、引き分けなら PK 戦。リードしたら守り切る判断も、監督の仕事になる。',
    clear: 'アジア王者に輝いた。次は世界の舞台。世界中のクラブ王者が待っている。',
    fail: 'トーナメントで敗退した。一発勝負の怖さを胸に、もう一度挑もう。',
    opponents: [
      { name: 'デザート・ファルコンズ', color: '#E8C547', style: 'bus', skill: 1.03 },
      { name: 'タイガー・シティ', color: '#F2694C', style: 'hunters', skill: 1.06 },
      { name: 'ゴールデン・ドラゴンズ', color: '#E04F5F', style: 'positional', skill: 1.05 },
    ],
  },
  {
    id: 6, league: '世界', title: '世界制覇', format: 'cup', mySkill: 1.19,
    roundNames: ['準々決勝', '準決勝', '決勝'],
    intro: '世界クラブ王者決定戦。南米の王者、そして欧州の巨人。地力では相手が上だ。戦術で差を埋め、世界の頂点に立とう。',
    clear: '世界一。JFL の小さなクラブは、あなたの戦術で世界の頂点に立った。',
    fail: '世界の壁に跳ね返された。でも差はわずか。もう一度挑もう。',
    opponents: [
      { name: 'アトレティコ・セレステ', color: '#7FC8F8', style: 'counter', skill: 1.35 },
      { name: 'ノルテ・ロイヤルズ', color: '#F4F1E8', style: 'gegen', skill: 1.4 },
      { name: 'アルカディア', color: '#9B7BE0', style: 'positional', skill: 1.45 },
    ],
  },
];

export const styleOf = (id: StyleId): Style => STYLES[id];

export function opponentSetup(o: StoryOpponent): TeamSetup {
  return { name: o.name, short: o.name.slice(0, 4), color: o.color, tactics: tactic(STYLES[o.style].tactics), skill: o.skill, skillMod: lessonSkillMod(STYLE_STAGE[o.style], STORY_WEAKNESS) };
}

export const chapterOf = (id: number) => CHAPTERS.find((c) => c.id === id)!;

export function roundLabel(c: Chapter, i: number) {
  return c.format === 'cup' ? c.roundNames?.[i] ?? `${i + 1}回戦` : `第${i + 1}節`;
}
