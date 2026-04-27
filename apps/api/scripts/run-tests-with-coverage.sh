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

# Reporter/outfile flags only: split default suite. Explicit file args: isolate known flaky suites when possible.
_reporter_only=1
_main_passthrough_args=()
for _a in "$@"; do
  case "$_a" in
    *.ts|*.tsx|src/*) _reporter_only=0 ;;
    *) _main_passthrough_args+=("$_a") ;;
  esac
done

is_isolated_test() {
  local name
  name="$(basename "$1")"
  # geo.service.test.ts mocks ./iplocate.client globally (Bun's mock.module is
  # process-wide), which leaks into iplocate.client.test.ts depending on file
  # load order. Run it in its own process so the mock cannot leak.
  [[ "$name" == 'verification.controller.test.ts' ||
     "$name" == 'block.service.test.ts' ||
     "$name" == 'identity-keys-access.service.test.ts' ||
     "$name" == 'geo.service.test.ts' ||
     "$name" == 'identity-session.test.ts' ||
     "$name" == 'identity.service.test.ts' ]]
}

run_split_with_coverage() {
  local tests=("$@")
  local main_tests=()
  local isolated_tests=()
  local f
  local idx=0

  for f in "${tests[@]}"; do
    if is_isolated_test "$f"; then
      isolated_tests+=("$f")
    else
      main_tests+=("$f")
    fi
  done

  if [[ ${#main_tests[@]} -gt 0 ]]; then
    bun test --coverage --coverage-reporter=lcov --coverage-dir="$API_ROOT/coverage/main" \
      "${main_tests[@]}" "${_main_passthrough_args[@]}"
  fi

  for f in "${isolated_tests[@]}"; do
    idx=$((idx + 1))
    local isolated_dir="$API_ROOT/coverage/isolated-$idx"
    mkdir -p "$isolated_dir"
    bun test --coverage --coverage-reporter=lcov --coverage-dir="$isolated_dir" "$f"
  done
}

if [[ $# -eq 0 ]] || [[ "$_reporter_only" -eq 1 ]]; then
  mapfile -t _all_tests < <(find src -name '*.test.ts' -type f | LC_ALL=C sort)
  # Run global-mock-sensitive suites in their own processes so afterAll restore
  # cannot race with module registration in parallel files.
  run_split_with_coverage "${_all_tests[@]}"
else
  _explicit_tests=()
  _passthrough_args=()
  for arg in "$@"; do
    case "$arg" in
      --) ;;
      *.test.ts|./*.test.ts|src/*.test.ts|./src/*.test.ts)
        _explicit_tests+=("$arg")
        ;;
      *)
        _passthrough_args+=("$arg")
        ;;
    esac
  done

  if [[ ${#_explicit_tests[@]} -gt 0 && ${#_passthrough_args[@]} -eq 0 ]]; then
    run_split_with_coverage "${_explicit_tests[@]}"
  else
    bun test --coverage --coverage-reporter=lcov --coverage-dir="$API_ROOT/coverage/main" "$@"
  fi
fi
unset _a _reporter_only

mapfile -t EDGE < <(find src -name '*.edge.manual.ts' 2>/dev/null | sort)
INFOS=()
shopt -s nullglob
for info in "$API_ROOT"/coverage/main/lcov.info "$API_ROOT"/coverage/verification/lcov.info "$API_ROOT"/coverage/isolated-*/lcov.info; do
  if [[ -f "$info" ]]; then
    INFOS+=("$info")
  fi
done
shopt -u nullglob

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
