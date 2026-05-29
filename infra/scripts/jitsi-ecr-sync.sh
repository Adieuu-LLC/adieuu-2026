#!/usr/bin/env bash
#
# Pulls official Jitsi Docker images from Docker Hub and pushes them to ECR.
#
# Usage:
#   ./infra/scripts/jitsi-ecr-sync.sh [JITSI_TAG]
#
# Defaults to "stable-9823" (latest stable at time of writing). Override with
# the first positional arg or JITSI_TAG env var.
#
# Prerequisites:
#   - AWS CLI v2 configured with ECR push permissions
#   - Docker (or Podman with docker alias)
#   - Terraform already applied (ECR repos must exist)
#
# This script is idempotent: re-running with the same tag is a no-op if the
# image already exists in ECR.

set -euo pipefail

JITSI_TAG="${1:-${JITSI_TAG:-stable-9823}}"

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

PROJECT_PREFIX="${PROJECT_PREFIX:-adieuu-production}"
SIGNAL_REPO="${PROJECT_PREFIX}-jitsi-signal"
JVB_REPO="${PROJECT_PREFIX}-jitsi-jvb"

SIGNAL_SOURCE="jitsi/web:${JITSI_TAG}"
JVB_SOURCE="jitsi/jvb:${JITSI_TAG}"

echo "--- Jitsi ECR Sync ---"
echo "Tag:      ${JITSI_TAG}"
echo "Registry: ${ECR_REGISTRY}"
echo "Signal:   ${SIGNAL_SOURCE} -> ${SIGNAL_REPO}"
echo "JVB:      ${JVB_SOURCE} -> ${JVB_REPO}"
echo ""

echo "Authenticating with ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

sync_image() {
  local source="$1"
  local ecr_repo="$2"
  local ecr_tag="${3:-${JITSI_TAG}}"
  local ecr_uri="${ECR_REGISTRY}/${ecr_repo}:${ecr_tag}"

  echo ""
  echo "Pulling ${source}..."
  docker pull --platform linux/arm64 "${source}"

  echo "Tagging as ${ecr_uri}..."
  docker tag "${source}" "${ecr_uri}"

  echo "Pushing to ECR..."
  docker push "${ecr_uri}"

  # Also tag as 'latest' for the default image_tag in Terraform
  local ecr_latest="${ECR_REGISTRY}/${ecr_repo}:latest"
  docker tag "${source}" "${ecr_latest}"
  docker push "${ecr_latest}"

  echo "Done: ${ecr_repo}"
}

sync_image "${SIGNAL_SOURCE}" "${SIGNAL_REPO}"
sync_image "${JVB_SOURCE}" "${JVB_REPO}"

echo ""
echo "All Jitsi images synced to ECR."
