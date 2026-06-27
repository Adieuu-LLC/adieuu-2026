#!/bin/bash
set -e

INSTALL_DIR="/opt/Adieuu"
POLKIT_DIR="/usr/share/polkit-1/actions"
POLICY_FILE="com.adieuu.desktop.update.policy"

if [ -f "${INSTALL_DIR}/${POLICY_FILE}" ] && [ -d "${POLKIT_DIR}" ]; then
  cp "${INSTALL_DIR}/${POLICY_FILE}" "${POLKIT_DIR}/${POLICY_FILE}"
  chmod 644 "${POLKIT_DIR}/${POLICY_FILE}"
fi

if command -v update-desktop-database > /dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
