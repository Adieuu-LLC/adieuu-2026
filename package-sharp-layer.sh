#!/usr/bin/env bash
# Rebuild the sharp Lambda layer zip when tracked files under
# infra/aws/lambda/layers/sharp/ change (content SHA-256). Stores fingerprint in
# .sharp-layer-package-fingerprint (gitignored). Use --force to rebuild.
#
# Optional deploy uses `aws lambda publish-layer-version` and attaches the new
# version to media-processor via `update-function-configuration`.
#
# Deploy target prefix: pass --prefix or LAMBDA_NAME_PREFIX (same value as
# Terraform name_prefix), or omit both and infer from terraform.tfvars.
#
# Usage:
#   ./package-sharp-layer.sh                 # incremental (default)
#   ./package-sharp-layer.sh --force         # always rebuild
#   ./package-sharp-layer.sh --dry-run       # show what would run, no builds
#   ./package-sharp-layer.sh --list          # show stale vs clean
#   ./package-sharp-layer.sh --force --deploy --prefix adieuu-staging
#   LAMBDA_NAME_PREFIX=adieuu-staging ./package-sharp-layer.sh --deploy-only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$ROOT/.sharp-layer-package-fingerprint"
SHARP_LAYER_DIR="$ROOT/infra/aws/lambda/layers/sharp"
BUILD_SCRIPT="$SHARP_LAYER_DIR/build.sh"
LAYER_ZIP="$SHARP_LAYER_DIR/sharp-layer.zip"
COMPATIBLE_RUNTIMES="nodejs24.x"

FORCE=0
DRY_RUN=0
LIST_ONLY=0
DEPLOY=0
DEPLOY_ONLY=0
PREFIX="${LAMBDA_NAME_PREFIX:-}"
DEPLOY_AWS_REGION=""

usage() {
  cat <<'EOF'
Rebuild infra/aws/lambda/layers/sharp/sharp-layer.zip when sources change.

  ./package-sharp-layer.sh [--force] [--dry-run] [--list] [--deploy] [--deploy-only]
                           [--prefix NAME] [--region REGION]

  --force        always rebuild the layer zip
  --dry-run      print actions only
  --list         show stale/clean
  --deploy       after packaging, publish layer version and attach to media-processor
  --deploy-only  skip packaging; deploy existing sharp-layer.zip
  --prefix NAME  Terraform name_prefix (project_name-environment), e.g. adieuu-staging
  --region R     pass to aws CLI (optional; else CLI default)

  AWS credentials: use AWS_PROFILE or default profile; IAM needs
  lambda:PublishLayerVersion and lambda:UpdateFunctionConfiguration.

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
      echo "unexpected argument: $1" >&2
      usage 1
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
  # or:  ./package-sharp-layer.sh --deploy --prefix adieuu-staging
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

fingerprint_sharp_layer() {
  if [ ! -d "$SHARP_LAYER_DIR" ]; then
    echo "missing directory: $SHARP_LAYER_DIR" >&2
    return 1
  fi
  (
    find "$SHARP_LAYER_DIR" \( -name build -o -name sharp-layer.zip \) -prune -o \
      -type f -print 2>/dev/null \
      | LC_ALL=C sort \
      | while IFS= read -r f; do
          [ -f "$f" ] && sha256sum "$f"
        done
  ) | sha256sum | awk '{print $1}'
}

read_saved_fp() {
  if [ ! -f "$STATE_FILE" ]; then
    echo ""
    return
  fi
  # shellcheck disable=SC2002
  head -n1 "$STATE_FILE" 2>/dev/null | cut -d= -f2- || true
}

write_saved_fp() {
  local fp="$1"
  local tmp
  tmp="$(mktemp)"
  printf 'sharp=%s\n' "$fp" >"$tmp"
  mv "$tmp" "$STATE_FILE"
}

deploy_sharp_layer() {
  local layer_name="${PREFIX}-sharp"
  local fn="${PREFIX}-media-processor"

  if [ ! -f "$LAYER_ZIP" ]; then
    echo "missing zip (run package first): $LAYER_ZIP" >&2
    return 1
  fi

  local abs
  abs="$(cd "$(dirname "$LAYER_ZIP")" && pwd)/$(basename "$LAYER_ZIP")"

  echo "publish layer ${layer_name} ..."
  local -a publish_cmd=(
    aws lambda publish-layer-version
    --layer-name "$layer_name"
    --description "sharp image processing library for ${COMPATIBLE_RUNTIMES} linux-x64"
    --zip-file "fileb://${abs}"
    --compatible-runtimes "$COMPATIBLE_RUNTIMES"
    --query LayerVersionArn
    --output text
  )
  if [ -n "$DEPLOY_AWS_REGION" ]; then
    publish_cmd+=(--region "$DEPLOY_AWS_REGION")
  fi

  local layer_arn
  layer_arn="$("${publish_cmd[@]}")"

  echo "attach layer to ${fn} (${layer_arn}) ..."
  local -a update_cmd=(
    aws lambda update-function-configuration
    --function-name "$fn"
    --layers "$layer_arn"
  )
  if [ -n "$DEPLOY_AWS_REGION" ]; then
    update_cmd+=(--region "$DEPLOY_AWS_REGION")
  fi
  "${update_cmd[@]}"
  echo "deployed sharp layer -> ${fn}"
}

if [ "$DEPLOY_ONLY" -eq 1 ]; then
  require_deploy_prefix
  require_aws_cli
  deploy_sharp_layer
  exit 0
fi

current_fp="$(fingerprint_sharp_layer)"
saved_fp="$(read_saved_fp)"
stale=0
if [ "$FORCE" -eq 1 ] || [ -z "$saved_fp" ] || [ "$current_fp" != "$saved_fp" ]; then
  stale=1
fi

if [ "$LIST_ONLY" -eq 1 ]; then
  if [ "$stale" -eq 1 ]; then
    printf 'sharp\tstale\t%s\n' "$SHARP_LAYER_DIR"
  else
    printf 'sharp\tclean\t%s\n' "$SHARP_LAYER_DIR"
  fi
  exit 0
fi

if [ "$stale" -eq 0 ]; then
  echo "skip sharp layer (unchanged)"
  if [ "$DEPLOY" -eq 1 ]; then
    echo "nothing was packaged; skipping deploy (use --force to rebuild, or --deploy-only to push existing zip)" >&2
  fi
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "would package sharp layer -> $LAYER_ZIP"
  exit 0
fi

if [ ! -x "$BUILD_SCRIPT" ]; then
  echo "missing or non-executable build script: $BUILD_SCRIPT" >&2
  exit 1
fi

echo "package sharp layer ($SHARP_LAYER_DIR)..."
bash "$BUILD_SCRIPT"
write_saved_fp "$current_fp"
echo "done sharp layer"

if [ "$DEPLOY" -eq 1 ]; then
  require_deploy_prefix
  require_aws_cli
  deploy_sharp_layer
fi
