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
