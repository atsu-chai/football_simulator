#!/bin/sh
# 12ステージのバランス検証をステージごとに並列で実行する。使い方: sh scripts/balance-par.sh [試合数]
N=${1:-100}
OUT=${OUT:-/tmp}
for s in 1 2 3 4 5 6 7 8 9 10 11 12; do
  npx tsx scripts/balance.ts "$N" "$s" > "$OUT/balance-$s.txt" 2>&1 &
done
wait
for s in 1 2 3 4 5 6 7 8 9 10 11 12; do grep -E "^ *$s (OK|NG)" "$OUT/balance-$s.txt"; done
