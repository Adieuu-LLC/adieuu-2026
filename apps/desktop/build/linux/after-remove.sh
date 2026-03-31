#!/bin/bash
set -e

POLKIT_DIR="/usr/share/polkit-1/actions"
POLICY_FILE="com.adieuu.desktop.update.policy"

if [ -f "${POLKIT_DIR}/${POLICY_FILE}" ]; then
  rm -f "${POLKIT_DIR}/${POLICY_FILE}"
fi

if command -v update-desktop-database > /dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
