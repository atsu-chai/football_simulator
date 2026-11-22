シュート・停止弾・連動の追補検証（2026-11-22）

前回の位置取り版にClaudeの停止弾の安全策だけを適用した状態をbeforeとして、同じ固定シード群で再計測した。前回レポートは停止を含んでいたため、今回の合格証拠には使わない。`ball.ts / resolveShot` の安全策は保持した。

シュート監査は前後とも `audit.ts 36`（3組×36=108試合）。位置・連動は9001 / 12345 / 55555開始の各60試合。全フレーム分布p10/p50/p90、役割別誤差、距離別xG・変換率は [metrics.md](metrics.md)。

| 指標 | 指定の受入範囲 / 参考目安 | before | after |
|---|---:|---:|---:|
| 得点(両チーム合計) | 2.5–3.5 | 3.676 | 2.815 |
| シュート(1チーム) | 11–16 | 13.435 | 12.727 |
| パス成功率% | 80–87 | 85.678 | 86.267 |
| シュート距離(m) | 16–17 | 23.826 | 16.718 |
| ボックス外からのシュート% | 33–38 | 70.675 | 37.941 |
| 25m以上からのシュート% | 8–12 | 58.442 | 12.659 |
| ボックス内シュートの決定率% | 13–15 | 38.425 | 14.068 |
| ボックス外シュートの決定率% | 3–4 | 2.438 | 4.410 |
| ヘディング% | 13–17 | 3.239 | 13.168 |
| クロス(1チーム) | 14–18 | 5.588 | 8.870 |
| CK(1チーム) | 4.5–5.5 | 2.185 | 2.319 |
| シュートあたり xG | 0.10–0.11 | 0.140 | 0.104 |
| ブロック率% | 24–28 | 20.882 | 19.425 |

得点・本数・パス成功率の受入幅は維持。新たに停止と未解決時間、距離15–19m、ボックス外28–45%、25m以上4–18%、ボックス内決定率10–20%、ヘディング8–22%を回帰検知の工学的ガードとして追加した。参考目安への完全一致を意味しない。今回のシュート目安はユーザー指定とaudit.tsの参考範囲であり、DFL位置データからシュート結果を推定した値ではない。

| seed開始 | stranded平均（実測2.012、上限2.562） | coupling RMSE（上限0.25） | 行動・連動 |
|---|---:|---:|---:|
| 9001 | 2.2990 | 0.2406 | 125/125 |
| 12345 | 2.2521 | 0.2407 | 125/125 |
| 55555 | 2.2299 | 0.2481 | 125/125 |

beforeの9001群はstranded=2.8502、coupling RMSE=0.2851。既存125項目の許容差には触れていない。

原因と修正

- `src/engine/ball.ts`：Claudeの停止弾→こぼれ球の安全策を保持。GK・ブロッカーとの接触をtick終点だけで判定すると、高速弾が接触範囲を横切っても見逃していたため、球の移動区間との距離で判定する。ゴール判定もゴール平面の横切り位置を使用する。
- `src/engine/onBall.ts / shoot`：固定24m/sと小さな鉛直速度では、ゴールより前に複数回バウンドして速度を失った。足26m/s・頭18m/sを出発速度とし、目標距離と到達高さから鉛直速度を算出する。0.1秒刻みの重力積分の補正を含め、到達前の余分なバウンドを防ぐ。
- `onBall.ts / computeXg`：一律4.5倍を除去。距離曲線 `0.66 * exp(-(distance-6)/6.3)` に角度・圧力・遮蔽・守備人数・頭/足・スキルを適用。6/11/16/20/25mの中央基準は約0.66/0.30/0.14/0.072/0.032。複数の遮蔽を独立に掛け続ける処理を改め、実際のブロック確率との役割を分けた。学習済みxGモデルではなく、提示目安に対する閉ループ校正である。
- `onBall.ts / decideOnBall`：距離に依存しない0.55のシュート固定加点を除去。xG・正面角度・圧力と距離で評価し、圧力下の低品質なミドルより運ぶ/つなぐ選択を残す。空いたレーンではボックス/深いサイドへの進入と、サイドでの次の配球機会を評価する。
- `onBall.ts / makePass`：浮きクロスは受け手の位置で約1.6mを通る弾道へ変更。受け手の3m先への着地指定では長いクロスが頭上を越えていた。クロスの受け手が実際の加速度と疲労込み速度で届くかも判定する。低いボックス内配球と折り返しをcrossとして扱い、ダイレクトシュートへ接続する。
- `src/engine/coordination.ts`：深いサイド攻撃の前線まで通常ブロック上限で85m付近に止めていた。該当場面の前線に限り、既存DFLモデルのST―重心相対距離p99（30.251m）を使う。通常の中盤位置や後方ユニットの上限は維持する。
- `src/engine/offBall.ts`：奪取後3秒の分岐が裏抜けを開始せず、全員をオフサイドライン手前へ戻していた。オンサイドの前線・保持者の余裕・背後の空間が揃う場合は、通常局面と同じ最大16mの裏抜けを直ちに開始する。パス時点のオフサイド判定と共有ブロックの上限を維持する。
- `src/engine/match.ts`：球速への学習済み応答を位置誤差ゼロ付近で切り、攻撃時は目標と球が同方向のときだけ使っていたため、動くブロックに追従できなかった。前後方向を攻守ともにフィードフォワードし、閉ループゲイン1.4で校正。速度・加速度・戦術の変形は既存の制限を使用する。
- `src/engine/shots.test.ts`：左右・足/頭・6–32mの到達、鋭角のゴール、tick間の接触、全4種の停止弾、ボックスの味方の利用、近距離xG、クロス受け手の高さを回帰検証する。`coordination.test.ts` は深いサイド攻撃でのボックス侵入と奪取直後のオンサイドからの走りを追加。
- `scripts/audit.ts`：距離別の試投数・平均xG・得点率・ヘディング率、完全停止時間、未解決shot時間、shot ledger外の得点差を出力。`check-behaviour-page.mjs` は全450フレームで連続同一live座標を失敗にする。`determinism.ts` は完全状態と次の乱数列を再比較する。

検証

- `npm test`：9ファイル・117/117成功。`npm run build`：TypeScript・Vite成功。
- `audit.ts 36 --check`：108試合、既存3条件と追加7条件がすべて成功。通常の `audit.ts 12 --check`（36試合）も10条件成功。
- `behaviour.ts 60 --check`：9001 / 12345 / 55555の各群で125/125成功。エンジンSHAは3群とも `81ed4c0a642f7f50406b20f9e2899bf5e86f126e5f6de5eb272a306500ced9b6`。
- `compare-real.ts 12 --check`：既存統計・SB設定・配置・移動・戦術効果をすべて通過。高ライン差+19.62m、縦幅差+6.67m、横幅差+9.33m、カウンター時の前線差+1.87m。
- `movement.ts 6 --check`：成功。平均2.544m/s、静止4.77%、90分換算11.35km。
- `restarts.ts 12`：5種類の再開で開始位置から5m超離れた選手は0.0人。
- 決定性：9001 / 12345 / 55555の完全状態・次の乱数8個のSHAが再実行と一致。

全12ステージ

C20の `OUT=/tmp/shot-c20-balance UNIVERSAL=0 sh scripts/balance-par.sh 100` 後、解だけを変更した3・4を同じ全100シードで再検証。他10ケースの入力は同一。相手設定・攻略条件・弱点補正・合格基準は変更していない。ステージ5は総得点5.49から3.14へ戻った。

3は短い配球・広い4-2-3-1（IW2人、SB残留、高いプレス、即時奪回）、4はSBを残す3-5-2のロング/速攻、8は広い4-3-3（偽9番+IW2人、SBオーバーラップ）へ模範解を調整。3・4の探索は先頭20シードの選別が不安定だったため、全100シードから等間隔の50シードへ広げた。

| stage | 初期勝率% | 対策勝率% | 差(pt) | 総得点 | 判定 |
|---|---:|---:|---:|---:|---|
| 1 | 37 | 93 | +56 | 2.90 | OK |
| 2 | 48 | 98 | +50 | 3.66 | OK |
| 3 | 43 | 73 | +30 | 2.07 | OK |
| 4 | 42 | 78 | +36 | 2.22 | OK |
| 5 | 35 | 97 | +62 | 3.14 | OK |
| 6 | 30 | 96 | +66 | 3.06 | OK |
| 7 | 38 | 81 | +43 | 2.51 | OK |
| 8 | 49 | 85 | +36 | 2.43 | OK |
| 9 | 34 | 95 | +61 | 2.38 | OK |
| 10 | 22 | 92 | +70 | 2.68 | OK |
| 11 | 28 | 94 | +66 | 3.17 | OK |
| 12 | 27 | 81 | +54 | 2.40 | OK |

ストーリー

最終解の確定後、`story.ts 30` を全6章で新規実行（章別並列、全24対戦×初期/対策×30=1440試合）。保存した全対戦のskill・style・戦術が現行入力と一致することを照合した。前回のstory結果は流用していない。

| 章 | 初期突破率% | 対策突破率% | 期待勝ち点 初期→対策 / 目標 |
|---|---:|---:|---|
| 1 JFL | 81.8 | 99.5 | 7.8→10.7 / 6 |
| 2 J3 | 54.7 | 90.7 | 6.7→9.4 / 7 |
| 3 J2 | 18.9 | 85.7 | 8.2→12.7 / 11 |
| 4 J1 | 6.4 | 69.7 | 7.2→12.6 / 12 |
| 5 アジア | 19.6 | 72.4 | cup・各引分PK五分 |
| 6 世界 | 8.4 | 46.7 | cup・各引分PK五分 |

突破率は各対戦の観測分布を独立と仮定した推計。JFLは導入として初期設定でも81.8%と易しい。J3以降は対策の差が大きく、世界は対策しても46.7%。J1とアジアはリーグ/cupの形式が異なるため、章ごとの単調減少を受入条件にはしていない。J1目標12は前回位置取り調整時の値を保持し、今回の追補では章目標・相手スキル・共通弱点補正を変更していない。

比較クリップと停止検査

[compare.html](compare.html) はseed 9002、669.2–759.2秒の90秒450フレーム。実測・simともlive 441/450。停止割合が最も近く、得点/HTの配置リセットを跨がない最初の区間を選ぶ既存手順を使用し、動きの良し悪しでは選別しない。全22人と球の座標が同一の連続liveフレームは0組。全座標の有限性、向き、Canvas呼び出しを検査し、0/30/60/89.8秒の座標描画も確認した。人工的に3フレームを同一にしたfixtureでは検査が失敗することを確認した。ブラウザーの画素表示を検査した結果ではない。

108試合の最大完全停止は0.0秒、同じshotが残った最長時間は1.2秒。停止は全22人と球の座標が変わらないlive tickの連続時間で測る。

残る差と計測の限界

クロス8.87/チーム、CK2.32/チームは参考目安14–18、4.5–5.5より少ない。ブロック19.43%も24–28%より少ない。25m以上12.66%とボックス外決定率4.41%は参考上限をやや超える。パス本数約166/チームも目安420–480を再現していない。主監査の3条件と追加ガードの通過を、試合全体の完全な現実一致とは扱わない。

位置指標も完全一致ではない。9001群の球20m内守備人数は旧指標4.734対実測4.131、球の反転は14.8%対11.3%。攻撃時の球相対位置RMSEはAM6.32m、FB8.66m、WG5.75mで、特にFB/WGは今回のシュート再校正前より増えた。各局面の縦横幅p10/p50/p90と重心相対誤差もmetrics.mdに保存し、判定通過だけで改善とみなさない。

追加対照（同じ12シード、AのSBだけ変更、Bは4-4-2固定）では、残留→オーバーラップでクロス9.33→9.92、ヘディング比率10.1%→19.8%、CK2.50→2.17だった。本数不足はSB指定だけでは解消せず、クロス/CKの残差として残す。[対照集計](shooting-cross-contrast.json)。

得点scoreとshot ledgerのgoal件数の差は108試合で18件。クロスの直接流入やブロック後のこぼれ球などを含む。監査の変換率は従来どおりshot ledger、総得点はscoreで計算し、両者を同一とは解釈しない。距離別のxGと観測得点率は同じ固定シード群での校正結果であり、未知試合への評価ではない。

位置回帰は従来どおり7実測試合、16特徴（球・チーム重心の位置と速度、保持経過、攻撃時のCB/CM/ST人数）。最初5試合学習・残り2試合の予測検証、配布係数は7試合再学習。[positioning-fit.json](positioning-fit.json) は予測器の検証であり、閉ループsimの検証ではない。WB→FB、IW→WG、偽9番→ST、DM→CMへ集約する。位置指標は1Hzの8秒連続live・既知保持・安定名簿、旧指標11対11、新指標9–11人/チーム。役割別25m前/後ろ人数はその役割が存在するフレームに条件付け、全体人数・ペアにはゼロのフレームも含む。

再現

```sh
export NODE_USE_SYSTEM_CA=0
RESULT_JSON=/tmp/audit108.json node --import tsx scripts/audit.ts 36 --check
RESULT_JSON=/tmp/audit36.json node --import tsx scripts/audit.ts 12 --check
RESULT_JSON=/tmp/after.json node --import tsx scripts/behaviour.ts 60 --check
SEED_START=12345 RESULT_JSON=/tmp/seed12345.json node --import tsx scripts/behaviour.ts 60 --check
SEED_START=55555 RESULT_JSON=/tmp/seed55555.json node --import tsx scripts/behaviour.ts 60 --check
node --import tsx scripts/compare-real.ts 12 --check
node --import tsx scripts/movement.ts 6 --check
node --import tsx scripts/restarts.ts 12
OUT=/tmp/balance UNIVERSAL=0 sh scripts/balance-par.sh 100
node --import tsx scripts/story.ts 30
node --import tsx scripts/determinism.ts 9001 12345 55555
node --import tsx scripts/behaviour-clip.ts /tmp/behaviour-real-clip.json
node scripts/check-behaviour-page.mjs
npm test
npm run build
```

SEED_STARTを読むのは行動・連動検証。他スクリプトは固有の固定シード（比較/移動/audit/balanceは5000、再開位置7000、story3100）を使う。storyの章別並列実行も同じ各対戦30シードを使用する。

全表の再生成：

```sh
node --import tsx scripts/report-positioning.ts src/data/behaviour.json docs/validation/behaviour/shooting-before-behaviour.json docs/validation/behaviour/positioning-after.json docs/validation/behaviour/positioning-12345.json docs/validation/behaviour/positioning-55555.json docs/validation/behaviour/shooting-before-audit.json docs/validation/behaviour/positioning-audit.json
```

現在の検証対象は `positioning-after/12345/55555`、`positioning-audit*`、`positioning-tactics`、`positioning-movement`、`positioning-balance`、`positioning-solution-search`、`positioning-story`、`positioning-determinism` と `positioning-verification.json`。`positioning-before.json`（50851ce）、従前のstory-calibrationは過去の履歴であり、今回の合格証拠には使わない。

出典：Bassek, Rein, Weber & Memmert (2025), DFL / IDSSE。[データ](https://doi.org/10.6084/m9.figshare.28196177) / [論文](https://doi.org/10.1038/s41597-025-04505-y)、CC BY 4.0。元XMLは読み取り専用。保存するのは役割別係数、匿名集計、既存の匿名比較クリップ。生XML・選手名・元の選手IDは追加しない。入力SHA256は `src/data/behaviour.json`。
