#!/bin/sh
# 12ステージのバランス検証をステージごとに並列で実行する。使い方: sh scripts/balance-par.sh [試合数]
# UNIVERSAL=0 なら基準判定だけを実行する。
N=${1:-100}
OUT=${OUT:-/tmp}
mkdir -p "$OUT" || exit 1
pids=""
# 中断時は、この検証で起動した子プロセスも終了する。
trap 'kill $pids 2>/dev/null; exit 130' INT TERM
for s in 1 2 3 4 5 6 7 8 9 10 11 12; do
  node --import tsx scripts/balance.ts "$N" "$s" > "$OUT/balance-$s.txt" 2>&1 &
  pids="$pids $!"
done
status=0
for pid in $pids; do wait "$pid" || status=1; done
for s in 1 2 3 4 5 6 7 8 9 10 11 12; do grep -E "^ *$s (OK|NG)" "$OUT/balance-$s.txt" || status=1; done
exit "$status"
