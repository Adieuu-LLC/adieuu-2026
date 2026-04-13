#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-large-files.sh
#
# Lists tracked files whose line count exceeds a threshold (default 750).
# Intended for maintainability sweeps (see .cursor/rules/avoid-creating-large-files.mdc).
#
# Skips common binary extensions where line counts are meaningless, and lock files
# (generated; line count is not a maintainability signal).
#
# Usage (works from any directory inside the repo):
#   bash scripts/check-large-files.sh
#   MIN_LINES=500 bash scripts/check-large-files.sh
#   bash scripts/check-large-files.sh --min-lines 1000
#   bash scripts/check-large-files.sh --strict   # exit 1 if any file exceeds threshold
# ---------------------------------------------------------------------------
set -euo pipefail

MIN_LINES="${MIN_LINES:-750}"
STRICT=0

usage() {
  sed -n '1,20p' "$0" | tail -n +2
  echo "Options: --min-lines N  --strict  -h|--help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --min-lines) MIN_LINES="$2"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if ! [[ "$MIN_LINES" =~ ^[0-9]+$ ]] || [[ "$MIN_LINES" -lt 1 ]]; then
  echo "MIN_LINES must be a positive integer, got: ${MIN_LINES}" >&2
  exit 2
fi

# git ls-files is cwd-relative; wc needs paths from repo root. Anchor so the script
# behaves the same whether invoked from the monorepo root or a subdirectory.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Not inside a git work tree; cannot list tracked files." >&2
  exit 1
}
cd "$REPO_ROOT" || {
  echo "Cannot cd to repository root: ${REPO_ROOT}" >&2
  exit 1
}

# Binary / asset extensions: line counts from wc are not useful.
BINARY_RE='\.(mp3|m4a|wav|aac|flac|ogg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|gz|br|wasm)$'

# Lock / shrinkwrap files (any path segment): generated, huge, not reviewed like source.
LOCK_RE='(^|/)(pnpm-lock\.yaml|npm-shrinkwrap\.json|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock)$'

FILES=()
while IFS= read -r -d '' f; do
  [[ -f "$f" ]] || continue
  [[ "$f" =~ $BINARY_RE ]] && continue
  [[ "$f" =~ $LOCK_RE ]] && continue
  FILES+=("$f")
done < <(git ls-files -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No files to check (are you in a git repository, or only binaries?)." >&2
  exit 1
fi

# wc emits "total" as last line; we strip it and sort by first field (line count).
TMP="$(mktemp)"
# shellcheck disable=SC2086
printf '%s\0' "${FILES[@]}" | xargs -0 wc -l >"$TMP"

LIST="$(
  awk -v min="$MIN_LINES" '
    $2 == "total" { next }
    $1 > min { n = $1; $1 = ""; sub(/^ /, ""); printf "%6d  %s\n", n, $0 }
  ' "$TMP" | sort -nr
)"
rm -f "$TMP"

OVER=0
if [[ -n "$LIST" ]]; then
  printf '%s\n' "$LIST"
  OVER="$(printf '%s\n' "$LIST" | wc -l | tr -d ' ')"
fi

if [[ "$STRICT" -eq 1 ]] && [[ "$OVER" -gt 0 ]]; then
  echo >&2
  echo "Found $OVER file(s) with more than $MIN_LINES lines." >&2
  exit 1
fi

if [[ "$OVER" -eq 0 ]]; then
  echo "No tracked text-like files exceed ${MIN_LINES} lines."
fi
