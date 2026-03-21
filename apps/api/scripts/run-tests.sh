#!/usr/bin/env bash
# Run the default Bun test suite, then every isolated edge test file.
#
# Edge tests: any file under src/ named *.edge.manual.ts
# (not matched by default `bun test` glob — run explicitly with ./path).
# Each edge file runs in its own process so global mocks (e.g. crypto) stay isolated.
set -euo pipefail
cd "$(dirname "$0")/.."

bun test "$@"

while IFS= read -r -d '' f; do
  echo "Running edge test: $f"
  bun test "./$f"
done < <(find src -name '*.edge.manual.ts' -print0 2>/dev/null | sort -z)
