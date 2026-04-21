#!/usr/bin/env bash
# Repackage AWS Lambda zips under infra/aws/lambda/* when tracked sources or
# root pnpm-lock.yaml change (content SHA-256). Stores per-lambda fingerprints
# in .lambda-package-fingerprints (gitignored). Use --force to rebuild all.
#
# Usage:
#   ./package-lambdas.sh                 # incremental (default)
#   ./package-lambdas.sh --force         # always repackage every lambda
#   ./package-lambdas.sh --dry-run       # show what would run, no builds
#   ./package-lambdas.sh --list          # show each lambda stale vs clean
#   ./package-lambdas.sh media-processor # only matching name(s) (see below)
#
# Name filter: arguments match the directory basename (e.g. media-processor) or
# a path ending in that segment (e.g. infra/aws/lambda/media-processor).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$ROOT/.lambda-package-fingerprints"
LOCK_FILE="$ROOT/pnpm-lock.yaml"

LAMBDA_RELPATHS=(
  "infra/aws/lambda/media-db-writer"
  "infra/aws/lambda/media-processor"
  "infra/aws/lambda/media-video-moderation-complete"
)

FORCE=0
DRY_RUN=0
LIST_ONLY=0
FILTER_NAMES=()

usage() {
  cat <<'EOF'
Repackage infra/aws/lambda/* zips when sources or pnpm-lock.yaml change.

  ./package-lambdas.sh [--force] [--dry-run] [--list] [lambda-name ...]

  --force    repackage every lambda
  --dry-run  print actions only
  --list     show stale/clean per lambda
EOF
  exit "${1:-0}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --list) LIST_ONLY=1; shift ;;
    -*)
      echo "unknown option: $1" >&2
      usage 1
      ;;
    *)
      FILTER_NAMES+=("$1")
      shift
      ;;
  esac
done

lambda_name_from_path() {
  basename "$1"
}

fingerprint_lambda() {
  local relpath="$1"
  local abspath="$ROOT/$relpath"
  if [ ! -d "$abspath" ]; then
    echo "missing directory: $abspath" >&2
    return 1
  fi
  (
    find "$abspath" \( -name node_modules -o -name dist \) -prune -o \
      -type f ! -name function.zip -print 2>/dev/null \
      | LC_ALL=C sort \
      | while IFS= read -r f; do
          [ -f "$f" ] && sha256sum "$f"
        done
    if [ -f "$LOCK_FILE" ]; then
      sha256sum "$LOCK_FILE"
    fi
  ) | sha256sum | awk '{print $1}'
}

read_saved_fp() {
  local name="$1"
  if [ ! -f "$STATE_FILE" ]; then
    echo ""
    return
  fi
  # shellcheck disable=SC2002
  grep -E "^${name}=" "$STATE_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true
}

write_saved_fp() {
  local name="$1"
  local fp="$2"
  local tmp
  tmp="$(mktemp)"
  if [ -f "$STATE_FILE" ]; then
    grep -E -v "^${name}=" "$STATE_FILE" >"$tmp" || true
  fi
  printf '%s=%s\n' "$name" "$fp" >>"$tmp"
  mv "$tmp" "$STATE_FILE"
}

lambda_in_filter() {
  local name="$1"
  if [ "${#FILTER_NAMES[@]}" -eq 0 ]; then
    return 0
  fi
  local a base
  for a in "${FILTER_NAMES[@]}"; do
    base="$(basename "${a%/}")"
    if [ "$a" = "$name" ] || [ "$base" = "$name" ]; then
      return 0
    fi
    if [[ "$a" == */"$name" ]] || [[ "$a" == */"$name"/* ]]; then
      return 0
    fi
  done
  return 1
}

STALE_COUNT=0
PACKAGED_COUNT=0

for relpath in "${LAMBDA_RELPATHS[@]}"; do
  name="$(lambda_name_from_path "$relpath")"
  if ! lambda_in_filter "$name"; then
    continue
  fi

  current_fp="$(fingerprint_lambda "$relpath")"
  saved_fp="$(read_saved_fp "$name")"
  stale=0
  if [ "$FORCE" -eq 1 ] || [ -z "$saved_fp" ] || [ "$current_fp" != "$saved_fp" ]; then
    stale=1
  fi

  if [ "$LIST_ONLY" -eq 1 ]; then
    if [ "$stale" -eq 1 ]; then
      printf '%s\tstale\t%s\n' "$name" "$relpath"
      STALE_COUNT=$((STALE_COUNT + 1))
    else
      printf '%s\tclean\t%s\n' "$name" "$relpath"
    fi
    continue
  fi

  if [ "$stale" -eq 0 ]; then
    echo "skip $name (unchanged)"
    continue
  fi

  STALE_COUNT=$((STALE_COUNT + 1))
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "would package $name -> $relpath"
    continue
  fi

  echo "package $name ($relpath)..."
  (cd "$ROOT/$relpath" && pnpm run package)
  write_saved_fp "$name" "$current_fp"
  PACKAGED_COUNT=$((PACKAGED_COUNT + 1))
  echo "done $name"
done

if [ "$LIST_ONLY" -eq 1 ]; then
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run: ${STALE_COUNT} lambda(s) would be packaged"
  exit 0
fi

echo "packaged ${PACKAGED_COUNT} lambda(s); skipped unchanged."
