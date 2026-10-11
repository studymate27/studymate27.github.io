#!/usr/bin/env bash
# Pages 결과물 조립: legacy → 사이트 루트, new 빌드 결과 → /app/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$ROOT/legacy/." "$OUT/"

(cd "$ROOT/new" && npm ci && npm test && npm run build)
cp -R "$ROOT/new/dist" "$OUT/app"

echo "built: $OUT"
