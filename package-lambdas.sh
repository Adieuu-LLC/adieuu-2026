#!/usr/bin/env bash
# Repackage AWS Lambda zips under infra/aws/lambda/* when tracked sources or
# root pnpm-lock.yaml change (content SHA-256). Stores per-lambda fingerprints
# in .lambda-package-fingerprints (gitignored). Use --force to rebuild all.
#
# Optional deploy uses `aws lambda update-function-code` with your default
# credential chain (env AWS_PROFILE, ~/.aws/config, etc.). Function names match
# Terraform locals.name_prefix: "${project_name}-${environment}-<lambda-suffix>"
# e.g. adieuu-staging-media-processor (see infra/aws/terraform/locals.tf).
#
# Deploy target prefix: pass --prefix or LAMBDA_NAME_PREFIX (same value as
# name_prefix), or omit both and the script will infer project_name + environment
# from infra/aws/terraform/terraform.tfvars when that file exists.
#
# Usage:
#   ./package-lambdas.sh                 # incremental (default)
#   ./package-lambdas.sh --force         # always repackage every lambda
#   ./package-lambdas.sh --dry-run       # show what would run, no builds
#   ./package-lambdas.sh --list          # show each lambda stale vs clean
#   ./package-lambdas.sh media-processor # only matching name(s) (see below)
#   ./package-lambdas.sh --force --deploy --prefix adieuu-staging
#   ./package-lambdas.sh --deploy-only --prefix adieuu-staging media-processor
#   LAMBDA_NAME_PREFIX=adieuu-staging ./package-lambdas.sh --deploy-only
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
DEPLOY=0
DEPLOY_ONLY=0
FILTER_NAMES=()
PREFIX="${LAMBDA_NAME_PREFIX:-}"
DEPLOY_AWS_REGION=""

usage() {
  cat <<'EOF'
Repackage infra/aws/lambda/* zips when sources or pnpm-lock.yaml change.

  ./package-lambdas.sh [--force] [--dry-run] [--list] [--deploy] [--deploy-only]
                       [--prefix NAME] [--region REGION] [lambda-name ...]

  --force        repackage every lambda
  --dry-run      print actions only
  --list         show stale/clean per lambda
  --deploy       after packaging, run aws lambda update-function-code for each
                 lambda that was packaged in this run (needs name_prefix: see
                 --prefix / LAMBDA_NAME_PREFIX / terraform.tfvars inference)
  --deploy-only  skip packaging; deploy existing dist/function.zip for filtered
                 lambdas (default: all three if no name filter)
  --prefix NAME  Same as Terraform name_prefix (project_name-environment), e.g.
                 adieuu-staging. Overrides LAMBDA_NAME_PREFIX. If unset, deploy
                 tries to read project_name and environment from
                 infra/aws/terraform/terraform.tfvars.
  --region R     pass to aws lambda update-function-code (optional; else CLI default)

  AWS credentials: use AWS_PROFILE or default profile; IAM needs lambda:UpdateFunctionCode.

EOF
  exit "${1:-0}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --list) LIST_ONLY=1; shift ;;
    --deploy) DEPLOY=1; shift ;;
    --deploy-only) DEPLOY_ONLY=1; shift ;;
    --prefix)
      PREFIX="$2"
      shift 2
      ;;
    --prefix=*)
      PREFIX="${1#*=}"
      shift
      ;;
    --region)
      DEPLOY_AWS_REGION="$2"
      shift 2
      ;;
    --region=*)
      DEPLOY_AWS_REGION="${1#*=}"
      shift
      ;;
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

if [ "$DEPLOY" -eq 1 ] && [ "$DEPLOY_ONLY" -eq 1 ]; then
  echo "use only one of --deploy and --deploy-only" >&2
  exit 1
fi

if [ "$DEPLOY_ONLY" -eq 1 ] && { [ "$FORCE" -eq 1 ] || [ "$LIST_ONLY" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; }; then
  echo "--deploy-only cannot be combined with --force, --list, or --dry-run" >&2
  exit 1
fi

lambda_name_from_path() {
  basename "$1"
}

relpath_for_lambda_name() {
  local n="$1"
  local r
  for r in "${LAMBDA_RELPATHS[@]}"; do
    if [ "$(lambda_name_from_path "$r")" = "$n" ]; then
      printf '%s' "$r"
      return 0
    fi
  done
  return 1
}

# First non-comment line matching `key = value` (HCL string or bare word).
tfvars_simple_value() {
  local file="$1" key="$2"
  local line raw
  [ -f "$file" ] || return 1
  line="$(
    grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null \
      | grep -vE '^[[:space:]]*#' \
      | head -1
  )" || true
  [ -n "$line" ] || return 1
  raw="${line#*=}"
  raw="${raw%%#*}"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  if [[ "$raw" =~ ^\".*\"$ ]]; then
    raw="${raw#\"}"
    raw="${raw%\"}"
  elif [[ "$raw" =~ ^\'.*\'$ ]]; then
    raw="${raw#\'}"
    raw="${raw%\'}"
  fi
  [ -n "$raw" ] || return 1
  printf '%s' "$raw"
}

infer_prefix_from_tfvars() {
  local f="$ROOT/infra/aws/terraform/terraform.tfvars"
  local pn en
  pn="$(tfvars_simple_value "$f" project_name)" || return 1
  en="$(tfvars_simple_value "$f" environment)" || return 1
  PREFIX="${pn}-${en}"
  echo "inferred deploy prefix (Terraform name_prefix): ${PREFIX}" >&2
}

require_deploy_prefix() {
  if [ -z "$PREFIX" ]; then
    infer_prefix_from_tfvars || true
  fi
  if [ -z "$PREFIX" ]; then
    cat <<'EOF' >&2
deploy needs the Terraform name_prefix (same as Lambda name before the suffix):

  export LAMBDA_NAME_PREFIX=adieuu-staging
  # or:  ./package-lambdas.sh --deploy --prefix adieuu-staging
  # or:  add project_name and environment to infra/aws/terraform/terraform.tfvars
       so this script can infer "${project_name}-${environment}".
EOF
    exit 1
  fi
}

require_aws_cli() {
  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI not found; install AWS CLI v2 for --deploy / --deploy-only" >&2
    exit 1
  fi
}

deploy_lambda_zip() {
  local name="$1"
  local relpath="$2"
  local zip="$ROOT/$relpath/dist/function.zip"
  local fn="${PREFIX}-${name}"

  if [ ! -f "$zip" ]; then
    echo "missing zip (run package first): $zip" >&2
    return 1
  fi

  local abs
  abs="$(cd "$(dirname "$zip")" && pwd)/$(basename "$zip")"

  echo "deploy $name -> $fn ..."
  local -a aws_cmd=(aws lambda update-function-code --function-name "$fn" --zip-file "fileb://${abs}")
  if [ -n "$DEPLOY_AWS_REGION" ]; then
    aws_cmd+=(--region "$DEPLOY_AWS_REGION")
  fi
  "${aws_cmd[@]}"
  echo "deployed $fn"
}

deploy_filtered() {
  local name relpath
  for relpath in "${LAMBDA_RELPATHS[@]}"; do
    name="$(lambda_name_from_path "$relpath")"
    if ! lambda_in_filter "$name"; then
      continue
    fi
    deploy_lambda_zip "$name" "$relpath"
  done
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

if [ "$DEPLOY_ONLY" -eq 1 ]; then
  require_deploy_prefix
  require_aws_cli
  deploy_filtered
  exit 0
fi

STALE_COUNT=0
PACKAGED_COUNT=0
PACKAGED_NAMES=()

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
  PACKAGED_NAMES+=("$name")
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

if [ "$DEPLOY" -eq 1 ]; then
  require_deploy_prefix
  require_aws_cli
  if [ "${#PACKAGED_NAMES[@]}" -eq 0 ]; then
    echo "nothing was packaged; skipping deploy (use --force to rebuild, or --deploy-only to push existing zips)" >&2
    exit 0
  fi
  for name in "${PACKAGED_NAMES[@]}"; do
    relp="$(relpath_for_lambda_name "$name")" || {
      echo "internal error: unknown lambda $name" >&2
      exit 1
    }
    deploy_lambda_zip "$name" "$relp"
  done
fi
