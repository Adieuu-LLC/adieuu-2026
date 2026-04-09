#!/usr/bin/env bash
# Same as run-tests.sh, but:
# - Main suite writes coverage to coverage/main/
# - Each *.edge.manual.ts writes to coverage/edge-N/
# - Merges all lcov.info files into coverage/lcov.info using `lcov` when available.
#
# Requires lcov on PATH for merge (e.g. apt install lcov). Without it, copies main only.
set -euo pipefail
cd "$(dirname "$0")/.."
API_ROOT="$(pwd)"

rm -rf coverage
mkdir -p "$API_ROOT/coverage/main"

# Reporter/outfile flags only: reorder for stable mock.module wins. Explicit file args: passthrough.
_reporter_only=1
for _a in "$@"; do
  case "$_a" in
    *.ts|*.tsx|src/*) _reporter_only=0 ;;
  esac
done

if [[ $# -eq 0 ]] || [[ "$_reporter_only" -eq 1 ]]; then
  mapfile -t _all_tests < <(find src -name '*.test.ts' -type f | LC_ALL=C sort)
  _main_tests=()
  _verification_tests=()
  for f in "${_all_tests[@]}"; do
    if [[ "$(basename "$f")" == 'verification.controller.test.ts' ]]; then
      _verification_tests+=("$f")
    else
      _main_tests+=("$f")
    fi
  done
  bun test --coverage --coverage-reporter=lcov --coverage-dir="$API_ROOT/coverage/main" \
    "${_main_tests[@]}" "${_verification_tests[@]}" "$@"
else
  bun test --coverage --coverage-reporter=lcov --coverage-dir="$API_ROOT/coverage/main" "$@"
fi
unset _a _reporter_only

mapfile -t EDGE < <(find src -name '*.edge.manual.ts' 2>/dev/null | sort)
INFOS=()
if [[ -f "$API_ROOT/coverage/main/lcov.info" ]]; then
  INFOS+=("$API_ROOT/coverage/main/lcov.info")
fi

i=0
for f in "${EDGE[@]}"; do
  i=$((i + 1))
  ED="$API_ROOT/coverage/edge-$i"
  mkdir -p "$ED"
  echo "Coverage edge test ($i/${#EDGE[@]}): $f"
  bun test "./$f" --coverage --coverage-reporter=lcov --coverage-dir="$ED"
  if [[ -f "$ED/lcov.info" ]]; then
    INFOS+=("$ED/lcov.info")
  fi
done

mkdir -p "$API_ROOT/coverage"

if [[ ${#INFOS[@]} -eq 0 ]]; then
  echo "error: no lcov.info produced under coverage/main" >&2
  exit 1
fi

if [[ ${#INFOS[@]} -eq 1 ]]; then
  cp "${INFOS[0]}" "$API_ROOT/coverage/lcov.info"
  echo "Wrote $API_ROOT/coverage/lcov.info (single run, no merge)"
  exit 0
fi

if ! command -v lcov >/dev/null 2>&1; then
  echo "warning: lcov not found; install lcov to merge edge coverage. Copying main lcov only." >&2
  cp "$API_ROOT/coverage/main/lcov.info" "$API_ROOT/coverage/lcov.info"
  exit 0
fi

OUT="$API_ROOT/coverage/lcov.info"
lcov_args=()
for info in "${INFOS[@]}"; do
  lcov_args+=(-a "$info")
done
lcov_args+=(-o "$OUT")
lcov "${lcov_args[@]}"
echo "Merged ${#INFOS[@]} lcov files -> $OUT"
