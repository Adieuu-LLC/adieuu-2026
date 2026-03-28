#!/usr/bin/env bash
# Builds a Lambda layer ZIP containing sharp for linux-x64 (nodejs20.x).
# Uses npm deliberately: Lambda requires a flat node_modules layout
# that pnpm's symlink structure cannot provide.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
SHARP_VERSION="0.33.0"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/nodejs"

cd "$BUILD_DIR/nodejs"
npm init -y --silent > /dev/null 2>&1
npm install --os=linux --cpu=x64 "sharp@^${SHARP_VERSION}" --omit=dev --silent

cd "$BUILD_DIR"
zip -qr "$SCRIPT_DIR/sharp-layer.zip" nodejs/

rm -rf "$BUILD_DIR"

echo "Layer built: $SCRIPT_DIR/sharp-layer.zip"
