# タクティクス・ラボ

サッカーの戦術を、2Dピッチ上の22人の動きで試して学ぶブラウザゲームです。

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

エンジン(`src/engine/`)はDOMに依存せず、シードが同じなら同じ試合になります。
