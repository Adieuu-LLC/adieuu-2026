#!/usr/bin/env bash
# Creates infra/aws/terraform/terraform.tfvars from the example if missing.
# Does not print or store secrets; edit terraform.tfvars yourself or use CI with OIDC + Variables.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/aws/terraform"
EXAMPLE="$TF_DIR/terraform.tfvars.example"
TARGET="$TF_DIR/terraform.tfvars"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "Missing example file: $EXAMPLE" >&2
  exit 1
fi

if [[ -f "$TARGET" ]]; then
  echo "Already exists: $TARGET"
  echo "Edit it with your non-secret settings; keep secrets in AWS Secrets Manager / SSM, not in git."
  exit 0
fi

cp "$EXAMPLE" "$TARGET"
echo "Created $TARGET"
echo ""
echo "Next:"
echo "  1. Edit $TARGET (region, project name, environment, CIDRs — no passwords in git)."
echo "  2. cd $TF_DIR && terraform init && terraform plan"
echo ""
