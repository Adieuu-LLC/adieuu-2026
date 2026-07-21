/**
 * Lightweight checks for category settings modal layout + inherit/force copy wiring.
 * Full Dialog render is covered indirectly via shared ChannelRoleMultiselect /
 * ChannelSettingsEncryption props; Ark Dialog + happy-dom is flaky for portals.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(import.meta.dir, 'CategorySettingsModal.tsx'), 'utf8');

describe('CategorySettingsModal source contract', () => {
  test('uses channel-aligned confirm-dialog body/footer classes', () => {
    expect(src).toContain('confirm-dialog-body create-channel-modal-body');
    expect(src).toContain('confirm-dialog-footer');
    expect(src).not.toContain('confirm-dialog-actions');
  });

  test('wires inherit and force children controls', () => {
    expect(src).toContain('onInheritFromParentChange={handleInheritAclChange}');
    expect(src).toContain('onInheritFromParentChange={handleInheritCipherChange}');
    expect(src).toContain('forceChildrenAcl');
    expect(src).toContain('forceChildrenCipher');
    expect(src).toContain('spaces.createCategory.forceChildrenLabel');
    expect(src).toContain('forcedByName={forceAclName}');
    expect(src).toContain('forcedByName={forceCipherName}');
  });
});
