# タクティクス・ラボ

サッカーの戦術を、2Dピッチ上の22人の動きで試して学ぶブラウザゲームです。

**遊ぶ:** https://atsu-chai.github.io/football_simulator/

`main` へ push すると、GitHub Actions がテストとビルドを行い、GitHub Pages へ自動で公開します。

```bash
npm install
npm run dev
```

| コマンド | 内容 |
|---|---|
| `npm test` | 単体テスト |
| `npm run build` | 型チェックと本番ビルド |
| `npm run balance -- 100` | 全ステージを1設定100試合ずつ自動実行し、想定解の効果を検証 |
| `npx tsx scripts/search.ts <ステージ> 14` | そのステージで効く戦術を総当たりで探索 |
| `npx tsx scripts/styles.ts 20` | 戦術スタイルどうしの相性表 |
| `npx tsx scripts/realism.ts 8` | パスの距離・浮き球の割合・サポート距離など、動きの現実らしさの指標 |
| `npx tsx scripts/shape.ts 4-3-3 4` | 守備時・攻撃時の各選手の平均位置 |
| `npx tsx scripts/passes.ts 10` | パスの種類ごとの成功率(味方に渡った・奪われた・外に出た) |
| `OUT=/tmp sh scripts/balance-par.sh 100` | 12ステージのバランス検証をステージごとに並列で実行 |
| `npx tsx scripts/story.ts 30 [章]` | ストーリーの各章を、初期設定と相手に合わせた戦術で突破できるか測る |
| `npx tsx scripts/audit.ts 10` | 得点・シュート距離・決定率・パス成功率などを、欧州主要リーグの目安と並べて比べる |
| `npx tsx scripts/solve.ts <ステージ> 24 40` | 攻略の鍵を満たす戦術をランダムに作り、最もよく勝つ模範解答の候補を探す |

エンジン(`src/engine/`)はDOMに依存せず、シードが同じなら同じ試合になります。

選手の基準位置は、DFLの実測トラッキング7試合から抽出した匿名統計を使用します。ボール位置（12×8セル）、保持・非保持・奪取後・喪失後、フォーメーション系統と役割を条件に補間し、その上にライン高・幅・密集度・SB・役割の戦術変形と個別判断を重ねます。生の軌跡を再生する方式ではありません。

出典: Bassek, M., Rein, R., Weber, H. & Memmert, D. (2025), *An integrated dataset of spatiotemporal and event data in elite soccer*, Scientific Data 12, 195. [論文](https://doi.org/10.1038/s41597-025-04505-y) / [DFL・IDSSEデータ](https://doi.org/10.6084/m9.figshare.28196177)。ライセンスは [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。`src/data/tracking.json` は座標の正規化、間引き、集約を行った派生物です。実在選手の氏名と生データは含みません。

```bash
# Python標準ライブラリだけで再抽出（元XMLはリポジトリ外に置く）
python3 scripts/data/extract_tracking.py --input /path/to/idsse
NODE_USE_SYSTEM_CA=0 node --import tsx scripts/compare-real.ts 6 --check
```

比較の定義・実行結果・残る差は [トラッキング検証記録](docs/validation/tracking/README.md) を参照してください。
