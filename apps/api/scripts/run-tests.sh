#!/usr/bin/env bash
# Run the default Bun test suite, then every isolated edge test file.
#
# Edge tests: any file under src/ named *.edge.manual.ts
# (not matched by default `bun test` glob — run explicitly with ./path).
# Each edge file runs in its own process so global mocks (e.g. crypto) stay isolated.
set -euo pipefail
cd "$(dirname "$0")/.."

# Bun's mock.restore() in afterAll is global — it tears down ALL module mocks process-wide.
# Run verification.controller.test.ts in its own process so other files' afterAll cleanup
# cannot interfere with its mock.module() registrations mid-flight.
if [[ $# -eq 0 ]]; then
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
  bun test "${_main_tests[@]}"
  if [[ ${#_verification_tests[@]} -gt 0 ]]; then
    bun test "${_verification_tests[@]}"
  fi
else
  bun test "$@"
fi

while IFS= read -r -d '' f; do
  echo "Running edge test: $f"
  bun test "./$f"
done < <(find src -name '*.edge.manual.ts' -print0 2>/dev/null | sort -z)
