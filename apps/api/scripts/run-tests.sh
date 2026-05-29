#!/usr/bin/env bash
# Run the API test suite with per-file isolation, then every edge test file.
#
# Requires Bun >= 1.3.13 (`bun test --isolate` resets globals and mock.module
# between test files so partial mocks cannot leak across the suite).
#
# Edge tests: any file under src/ named *.edge.manual.ts
# (not matched by default `bun test` glob — run explicitly with ./path).
# Each edge file runs in its own process so global mocks (e.g. crypto) stay isolated.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! bun test --help 2>&1 | grep -q -- '--isolate'; then
  echo "error: bun test --isolate requires Bun >= 1.3.13 (install/upgrade: https://bun.sh)" >&2
  exit 1
fi

run_isolated_suite() {
  local tests=("$@")
  if [[ ${#tests[@]} -gt 0 ]]; then
    bun test --isolate "${tests[@]}"
  fi
}

if [[ $# -eq 0 ]]; then
  mapfile -t _all_tests < <(find src -name '*.test.ts' -type f | LC_ALL=C sort)
  run_isolated_suite "${_all_tests[@]}"
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
    run_isolated_suite "${_explicit_tests[@]}"
  else
    bun test --isolate "$@"
  fi
fi

while IFS= read -r -d '' f; do
  echo "Running edge test: $f"
  bun test "./$f"
done < <(find src -name '*.edge.manual.ts' -print0 2>/dev/null | sort -z)
