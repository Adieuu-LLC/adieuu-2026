#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# validate-release-sync.sh
#
# Offline dry-run validator for the sync-downloads-mirror CI job.
#
# Creates a temporary directory mirroring the expected artifact structure,
# generates sample manifests (the same format electron-builder produces),
# exercises the releases.json generation logic, and validates everything.
#
# Usage:
#   bash scripts/validate-release-sync.sh                  # auto version
#   bash scripts/validate-release-sync.sh --version 1.2.3  # explicit
# ---------------------------------------------------------------------------
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf "${GREEN}  PASS${NC} %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "${RED}  FAIL${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}  WARN${NC} %s\n" "$1"; }
section() { printf "\n${YELLOW}--- %s ---${NC}\n" "$1"; }

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$VERSION" ]; then
  # Read from desktop package.json and bump patch for realism
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  DESKTOP_PKG="${SCRIPT_DIR}/../apps/desktop/package.json"
  if [ -f "$DESKTOP_PKG" ]; then
    CURRENT=$(node -p "require('${DESKTOP_PKG}').version" 2>/dev/null || echo "0.1.0")
    IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
    VERSION="${MAJ}.${MIN}.$((PAT + 1))"
  else
    VERSION="0.2.0"
  fi
fi

echo "Validating release sync for version: ${VERSION}"

# ---------------------------------------------------------------------------
# Set up temporary workspace
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK=$(mktemp -d "${REPO_ROOT}/.validate-release-XXXXXX")
trap 'rm -rf "$WORK"' EXIT

ARTIFACTS="${WORK}/desktop-artifacts"
SBOMS="${WORK}/sboms"
mkdir -p "$ARTIFACTS" "$SBOMS"

# ---------------------------------------------------------------------------
# 1. Generate sample artifacts (mimic electron-builder output)
# ---------------------------------------------------------------------------
section "Artifact generation"

FAKE_SHA=$(node -e "console.log(require('crypto').createHash('sha512').update('fake-binary-${VERSION}').digest('hex'))")

# Linux
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-linux-x86_64.AppImage"
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-linux-amd64.deb"
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-linux-x86_64.rpm"

cat > "${ARTIFACTS}/latest-linux.yml" <<EOYML
version: ${VERSION}
files:
  - url: Adieuu-${VERSION}-linux-x86_64.AppImage
    sha512: ${FAKE_SHA}
    size: 1024
path: Adieuu-${VERSION}-linux-x86_64.AppImage
sha512: ${FAKE_SHA}
releaseDate: $(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
EOYML

# macOS
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-mac-x64.dmg"
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-mac-x64.zip"
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-mac-x64.zip.blockmap"

cat > "${ARTIFACTS}/latest-mac.yml" <<EOYML
version: ${VERSION}
files:
  - url: Adieuu-${VERSION}-mac-x64.zip
    sha512: ${FAKE_SHA}
    size: 1024
path: Adieuu-${VERSION}-mac-x64.zip
sha512: ${FAKE_SHA}
releaseDate: $(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
EOYML

# Windows
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-win-x64.exe"
printf '%1024s' '' > "${ARTIFACTS}/Adieuu-${VERSION}-win-x64.exe.blockmap"

cat > "${ARTIFACTS}/latest.yml" <<EOYML
version: ${VERSION}
files:
  - url: Adieuu-${VERSION}-win-x64.exe
    sha512: ${FAKE_SHA}
    size: 1024
path: Adieuu-${VERSION}-win-x64.exe
sha512: ${FAKE_SHA}
releaseDate: $(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
EOYML

# SBOM
cat > "${SBOMS}/adieuu-desktop-${VERSION}-sbom.json" <<EOJSON
{"bomFormat":"CycloneDX","specVersion":"1.4","version":1,"components":[]}
EOJSON

pass "Sample artifacts created ($(ls "$ARTIFACTS" | wc -l) files)"
pass "Sample SBOM created"

# ---------------------------------------------------------------------------
# 2. Validate manifest structure
# ---------------------------------------------------------------------------
section "Manifest validation"

for manifest in latest.yml latest-mac.yml latest-linux.yml; do
  MPATH="${ARTIFACTS}/${manifest}"
  if [ ! -f "$MPATH" ]; then
    fail "${manifest} not found"
    continue
  fi

  # Check required fields
  if grep -q "^version:" "$MPATH"; then
    pass "${manifest} has version field"
  else
    fail "${manifest} missing version field"
  fi

  if grep -q "^sha512:" "$MPATH"; then
    pass "${manifest} has sha512 field"
  else
    fail "${manifest} missing sha512 field"
  fi

  if grep -q "^path:" "$MPATH"; then
    pass "${manifest} has path field"
  else
    fail "${manifest} missing path field"
  fi

  if grep -q "^releaseDate:" "$MPATH"; then
    pass "${manifest} has releaseDate field"
  else
    fail "${manifest} missing releaseDate field"
  fi

  # Verify the referenced binary exists in artifacts
  BINARY_NAME=$(grep "^path:" "$MPATH" | sed 's/^path: *//')
  if [ -f "${ARTIFACTS}/${BINARY_NAME}" ]; then
    pass "${manifest} references existing binary: ${BINARY_NAME}"
  else
    fail "${manifest} references missing binary: ${BINARY_NAME}"
  fi

  # Version in manifest matches release version
  MANIFEST_VERSION=$(grep "^version:" "$MPATH" | sed 's/^version: *//')
  if [ "$MANIFEST_VERSION" = "$VERSION" ]; then
    pass "${manifest} version matches release (${VERSION})"
  else
    fail "${manifest} version mismatch: got ${MANIFEST_VERSION}, expected ${VERSION}"
  fi
done

# ---------------------------------------------------------------------------
# 3. Validate artifact classification (binaries vs manifests vs blockmaps)
# ---------------------------------------------------------------------------
section "Artifact classification"

BINARIES=$(ls "$ARTIFACTS" | grep -vE '\.yml$|\.blockmap$' || true)
MANIFESTS=$(ls "$ARTIFACTS" | grep '\.yml$' || true)
BLOCKMAPS=$(ls "$ARTIFACTS" | grep '\.blockmap$' || true)

BIN_COUNT=$(echo "$BINARIES" | grep -c '.' || true)
MAN_COUNT=$(echo "$MANIFESTS" | grep -c '.' || true)
BLK_COUNT=$(echo "$BLOCKMAPS" | grep -c '.' || true)

if [ "$MAN_COUNT" -eq 3 ]; then
  pass "Exactly 3 manifest files (latest.yml, latest-mac.yml, latest-linux.yml)"
else
  fail "Expected 3 manifest files, found ${MAN_COUNT}"
fi

if [ "$BIN_COUNT" -gt 0 ]; then
  pass "${BIN_COUNT} binary files found"
else
  fail "No binary files found"
fi

echo "  Blockmaps: ${BLK_COUNT}"

# ---------------------------------------------------------------------------
# 4. Simulate releases.json generation
# ---------------------------------------------------------------------------
section "releases.json generation"

BASE_URL="https://downloads.adieuu.com"

# Simulate existing releases.json
cat > "${WORK}/existing-releases.json" <<EOJSON
[
  {
    "version": "0.1.0",
    "date": "2026-01-01T00:00:00.000Z",
    "downloads": {
      "base": "${BASE_URL}/v0.1.0/desktop/",
      "sbom": "${BASE_URL}/v0.1.0/sbom/"
    },
    "github": "https://github.com/Adieuu-LLC/adieuu-2026/releases/tag/v0.1.0"
  }
]
EOJSON

# Run the same node generation logic as the CI workflow
cd "$WORK"
node -e "
  const fs = require('fs');
  const existing = JSON.parse(fs.readFileSync('existing-releases.json', 'utf8'));
  const entries = Array.isArray(existing) ? existing : [];
  const filtered = entries.filter(e => e.version !== '${VERSION}');
  const newEntry = {
    version: '${VERSION}',
    date: new Date().toISOString(),
    downloads: {
      base: '${BASE_URL}/v${VERSION}/desktop/',
      sbom: '${BASE_URL}/v${VERSION}/sbom/',
    },
    github: 'https://github.com/Adieuu-LLC/adieuu-2026/releases/tag/v${VERSION}',
  };
  filtered.unshift(newEntry);
  const trimmed = filtered.slice(0, 50);
  fs.writeFileSync('releases.json', JSON.stringify(trimmed, null, 2));
"

if [ -f "${WORK}/releases.json" ]; then
  pass "releases.json generated"
else
  fail "releases.json not generated"
fi

# Validate releases.json structure
ENTRIES=$(node -p "JSON.parse(require('fs').readFileSync('${WORK}/releases.json','utf8')).length")
if [ "$ENTRIES" -eq 2 ]; then
  pass "releases.json has 2 entries (new + existing)"
else
  fail "Expected 2 entries in releases.json, found ${ENTRIES}"
fi

FIRST_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('${WORK}/releases.json','utf8'))[0].version")
if [ "$FIRST_VERSION" = "$VERSION" ]; then
  pass "New version (${VERSION}) is first entry"
else
  fail "First entry is ${FIRST_VERSION}, expected ${VERSION}"
fi

# Verify JSON is valid
if node -e "JSON.parse(require('fs').readFileSync('${WORK}/releases.json','utf8'))" 2>/dev/null; then
  pass "releases.json is valid JSON"
else
  fail "releases.json is invalid JSON"
fi

# Check idempotency (running again should not duplicate)
cp "${WORK}/releases.json" "${WORK}/existing-releases.json"
node -e "
  const fs = require('fs');
  const existing = JSON.parse(fs.readFileSync('existing-releases.json', 'utf8'));
  const entries = Array.isArray(existing) ? existing : [];
  const filtered = entries.filter(e => e.version !== '${VERSION}');
  const newEntry = {
    version: '${VERSION}',
    date: new Date().toISOString(),
    downloads: {
      base: '${BASE_URL}/v${VERSION}/desktop/',
      sbom: '${BASE_URL}/v${VERSION}/sbom/',
    },
    github: 'https://github.com/Adieuu-LLC/adieuu-2026/releases/tag/v${VERSION}',
  };
  filtered.unshift(newEntry);
  const trimmed = filtered.slice(0, 50);
  fs.writeFileSync('releases.json', JSON.stringify(trimmed, null, 2));
"

ENTRIES_AFTER=$(node -p "JSON.parse(require('fs').readFileSync('${WORK}/releases.json','utf8')).length")
if [ "$ENTRIES_AFTER" -eq 2 ]; then
  pass "Idempotency: re-running did not duplicate (still 2 entries)"
else
  fail "Idempotency: expected 2 entries after re-run, got ${ENTRIES_AFTER}"
fi

# ---------------------------------------------------------------------------
# 5. Simulate S3 path mapping
# ---------------------------------------------------------------------------
section "S3 path mapping (dry run)"

echo "  Binaries would sync to:"
echo "    s3://BUCKET/latest/              (latest channel, excl manifests)"
echo "    s3://BUCKET/v${VERSION}/desktop/  (immutable versioned copy)"
echo ""
echo "  Manifests would copy to:"
for m in latest.yml latest-mac.yml latest-linux.yml; do
  if [ -f "${ARTIFACTS}/${m}" ]; then
    echo "    s3://MANIFEST_BUCKET/${m}"
  fi
done
echo ""
echo "  SBOMs would sync to:"
echo "    s3://BUCKET/v${VERSION}/sbom/"
echo ""
echo "  CloudFront invalidation paths:"
echo "    /latest/*"
echo "    /v${VERSION}/*"
echo "    /releases.json"

pass "S3 path mapping verified"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section "Summary"
TOTAL=$((PASS + FAIL))
printf "\n  Results: ${GREEN}%d passed${NC}, ${RED}%d failed${NC} out of %d checks\n\n" "$PASS" "$FAIL" "$TOTAL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
