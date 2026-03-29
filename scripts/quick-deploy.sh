#!/usr/bin/env bash
# Quick-deploy containerised services (api, chat) from a local checkout.
#
# Builds Docker images, pushes to ECR, and forces ECS Fargate to roll out.
# Terraform outputs supply registry URLs, cluster name, and service names
# so nothing is hard-coded.
#
# Usage:
#   ./scripts/quick-deploy.sh              # deploy all services
#   ./scripts/quick-deploy.sh api          # deploy only api
#   ./scripts/quick-deploy.sh chat         # deploy only chat
#   ./scripts/quick-deploy.sh api chat     # deploy specific services
#   ./scripts/quick-deploy.sh --no-wait    # skip waiting for ECS stability
#   ./scripts/quick-deploy.sh --yes api    # skip confirmation prompt
#
# Prerequisites:
#   - AWS CLI v2 configured with credentials that can push to ECR and update ECS
#   - Docker running locally
#   - Terraform state accessible in infra/aws/terraform/

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/aws/terraform"

KNOWN_SERVICES=(api chat)
SERVICES=()
SKIP_CONFIRM=false
WAIT_FOR_STABLE=true

bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[0;32m%s\033[0m' "$*"; }
red()   { printf '\033[0;31m%s\033[0m' "$*"; }
dim()   { printf '\033[2m%s\033[0m' "$*"; }

info()  { echo "  $(green ">") $*"; }
warn()  { echo "  $(red "!") $*" >&2; }
step()  { echo ""; echo "  $(bold "$*")"; }

die() { warn "$@"; exit 1; }

usage() {
  echo "Usage: $(basename "$0") [--yes] [--no-wait] [service ...]"
  echo ""
  echo "Services: ${KNOWN_SERVICES[*]} (default: all)"
  echo ""
  echo "Options:"
  echo "  --yes       Skip confirmation prompt"
  echo "  --no-wait   Skip waiting for ECS services to stabilise"
  exit 1
}

is_known_service() {
  local needle="$1"
  for s in "${KNOWN_SERVICES[@]}"; do
    [[ "$s" == "$needle" ]] && return 0
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)       SKIP_CONFIRM=true; shift ;;
    --no-wait)   WAIT_FOR_STABLE=false; shift ;;
    --help|-h)   usage ;;
    -*)          die "Unknown flag: $1" ;;
    *)
      is_known_service "$1" || die "Unknown service: $1 (known: ${KNOWN_SERVICES[*]})"
      SERVICES+=("$1")
      shift
      ;;
  esac
done

[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=("${KNOWN_SERVICES[@]}")

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight"

command -v aws    >/dev/null 2>&1 || die "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
command -v docker >/dev/null 2>&1 || die "Docker not found."
docker info       >/dev/null 2>&1 || die "Docker daemon is not running."

[[ -d "$TF_DIR" ]] || die "Terraform directory not found: $TF_DIR"

# Verify Terraform state is accessible.
if ! terraform -chdir="$TF_DIR" output -json >/dev/null 2>&1; then
  die "Cannot read Terraform outputs. Run 'terraform init' in $TF_DIR first."
fi

tf_out() {
  terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null
}

AWS_REGION="$(tf_out aws_region)"
ECR_API_URL="$(tf_out ecr_api_repository_url)"
ECR_CHAT_URL="$(tf_out ecr_chat_repository_url)"
ECS_CLUSTER="$(tf_out ecs_cluster_name)"
ECS_SERVICE_API="$(tf_out ecs_service_api_name)"
ECS_SERVICE_CHAT="$(tf_out ecs_service_chat_name)"

[[ -n "$AWS_REGION" ]]   || die "Could not read aws_region from Terraform outputs."
[[ -n "$ECS_CLUSTER" ]]  || die "Could not read ecs_cluster_name from Terraform outputs."

DEPLOY_SHA="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
DEPLOY_SHA_FULL="$(git -C "$ROOT" rev-parse HEAD)"
DIRTY=""
if ! git -C "$ROOT" diff --quiet HEAD 2>/dev/null; then
  DIRTY="-dirty"
fi
IMAGE_TAG="${DEPLOY_SHA}${DIRTY}"

info "Region:      $AWS_REGION"
info "Cluster:     $ECS_CLUSTER"
info "Commit:      $DEPLOY_SHA_FULL${DIRTY:+ (uncommitted changes)}"
info "Image tag:   $IMAGE_TAG  +  latest"
info "Services:    ${SERVICES[*]}"

# Map service name -> ECR URL and ECS service name.
ecr_url_for() {
  case "$1" in
    api)  echo "$ECR_API_URL"  ;;
    chat) echo "$ECR_CHAT_URL" ;;
  esac
}

ecs_service_for() {
  case "$1" in
    api)  echo "$ECS_SERVICE_API"  ;;
    chat) echo "$ECS_SERVICE_CHAT" ;;
  esac
}

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
if [[ "$SKIP_CONFIRM" != true ]]; then
  echo ""
  printf "  Deploy $(bold "${SERVICES[*]}") to $(bold "$ECS_CLUSTER")? [y/N] "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }
fi

# ---------------------------------------------------------------------------
# ECR login
# ---------------------------------------------------------------------------
step "Authenticating with ECR"

ECR_REGISTRY="${ECR_API_URL%%/*}"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY" 2>&1 \
  | while IFS= read -r line; do info "$line"; done

# ---------------------------------------------------------------------------
# Build, tag, push
# ---------------------------------------------------------------------------
FONTAWESOME_BUILD_ARG=""
if [[ -n "${FONTAWESOME_TOKEN:-}" ]]; then
  FONTAWESOME_BUILD_ARG="--build-arg FONTAWESOME_TOKEN=${FONTAWESOME_TOKEN}"
fi

for svc in "${SERVICES[@]}"; do
  step "Building $svc"

  ECR_URL="$(ecr_url_for "$svc")"
  [[ -n "$ECR_URL" ]] || die "No ECR URL for $svc. Check Terraform outputs."

  # shellcheck disable=SC2086
  docker build --platform linux/amd64 \
    -f "$ROOT/apps/$svc/Dockerfile" \
    $FONTAWESOME_BUILD_ARG \
    -t "${svc}:${IMAGE_TAG}" \
    "$ROOT"

  docker tag "${svc}:${IMAGE_TAG}" "${ECR_URL}:${IMAGE_TAG}"
  docker tag "${svc}:${IMAGE_TAG}" "${ECR_URL}:latest"

  step "Pushing $svc"
  docker push "${ECR_URL}:${IMAGE_TAG}"
  docker push "${ECR_URL}:latest"
  info "Pushed ${ECR_URL}:${IMAGE_TAG}"
  info "Pushed ${ECR_URL}:latest"
done

# ---------------------------------------------------------------------------
# Force ECS redeployment
# ---------------------------------------------------------------------------
for svc in "${SERVICES[@]}"; do
  step "Deploying $svc to ECS"

  ECS_SVC="$(ecs_service_for "$svc")"
  [[ -n "$ECS_SVC" ]] || die "No ECS service name for $svc. Check Terraform outputs."

  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$ECS_SVC" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --output text \
    --query 'service.serviceName' \
    | while IFS= read -r name; do info "Triggered redeployment: $name"; done
done

# ---------------------------------------------------------------------------
# Wait for stability (optional)
# ---------------------------------------------------------------------------
if [[ "$WAIT_FOR_STABLE" == true ]]; then
  step "Waiting for ECS services to stabilise"
  info "$(dim "This may take a few minutes. Ctrl+C to skip (deploy will continue in AWS).")"

  for svc in "${SERVICES[@]}"; do
    ECS_SVC="$(ecs_service_for "$svc")"
    info "Waiting on $svc ($ECS_SVC)..."
    if aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$ECS_SVC" \
        --region "$AWS_REGION" 2>/dev/null; then
      info "$(green "$svc") is stable."
    else
      warn "$svc did not stabilise within the timeout. Check the AWS console."
    fi
  done
fi

step "Done"
info "Deployed: ${SERVICES[*]}"
info "Tag:      $IMAGE_TAG"
echo ""
