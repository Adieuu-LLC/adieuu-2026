#!/usr/bin/env bash
# Run the default Bun test suite, then every isolated edge test file.
#
# Edge tests: any file under src/ named *.edge.manual.ts
# (not matched by default `bun test` glob — run explicitly with ./path).
# Each edge file runs in its own process so global mocks (e.g. crypto) stay isolated.
set -euo pipefail
cd "$(dirname "$0")/.."

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

run_split_suites() {
  local tests=("$@")
  local main_tests=()
  local isolated_tests=()
  local f

  for f in "${tests[@]}"; do
    if is_isolated_test "$f"; then
      isolated_tests+=("$f")
    else
      main_tests+=("$f")
    fi
  done

  if [[ ${#main_tests[@]} -gt 0 ]]; then
    bun test "${main_tests[@]}"
  fi
  for f in "${isolated_tests[@]}"; do
    bun test "$f"
  done
}

if [[ $# -eq 0 ]]; then
  mapfile -t _all_tests < <(find src -name '*.test.ts' -type f | LC_ALL=C sort)
  run_split_suites "${_all_tests[@]}"
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

  # When callers pass explicit test files (e.g. security suite), still isolate
  # known global-mock-sensitive suites.
  if [[ ${#_explicit_tests[@]} -gt 0 && ${#_passthrough_args[@]} -eq 0 ]]; then
    run_split_suites "${_explicit_tests[@]}"
  else
    bun test "$@"
  fi
fi

while IFS= read -r -d '' f; do
  echo "Running edge test: $f"
  bun test "./$f"
done < <(find src -name '*.edge.manual.ts' -print0 2>/dev/null | sort -z)
