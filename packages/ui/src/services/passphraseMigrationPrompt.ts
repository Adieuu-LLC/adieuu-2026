/**
 * Remote passphrase-change migration prompt loop.
 *
 * When device keys fail to decrypt during login/unlock and the server reports a
 * newer `passphraseChangedAt` than this device's last local unlock, the keys are
 * most likely still valid but wrapped under the *old* passphrase (the passphrase
 * was changed on another device). Rather than destroying them and losing message
 * history, prompt the user for their old passphrase and re-wrap local material
 * in place.
 *
 * Extracted from `useIdentity` so the loop is unit-testable in isolation. Both
 * the login and unlock flows delegate to {@link attemptPassphraseMigration}.
 *
 * @module services/passphraseMigrationPrompt
 */

import { clearBytes } from '@adieuu/crypto';
import {
  needsPassphraseMigration,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  setLastIdentityUnlockAt,
} from './deviceKeyStorage';
import { reWrapPassphraseProtectedStores } from './passphraseLocalMigration';
import type { MigrationPromptHandler } from '../hooks/useIdentity.types';

/**
 * Attempts to recover a device whose keys no longer decrypt with the current
 * passphrase, by prompting for the old passphrase and re-wrapping local stores.
 *
 * @param identityId - Identity whose local material should be re-wrapped.
 * @param newPassphrase - The current (new) passphrase; re-wrap target key.
 * @param wrappingKey - The wrapping key already derived from `newPassphrase` by
 *   the caller; used to verify device keys decrypt after re-wrap.
 * @param passphraseChangedAt - Server-reported ISO timestamp of the last
 *   passphrase change (gates whether a prompt is warranted).
 * @param onMigrationPrompt - UI handler that collects the old passphrase or an
 *   opt-out decision. When absent, migration is skipped entirely.
 * @returns The recovered `deviceId` on success, or `null` when migration is not
 *   applicable, was declined, or ultimately failed (the caller then falls back
 *   to delete + regenerate).
 */
export async function attemptPassphraseMigration(
  identityId: string,
  newPassphrase: string,
  wrappingKey: Uint8Array,
  passphraseChangedAt: string | null | undefined,
  onMigrationPrompt?: MigrationPromptHandler,
): Promise<{ deviceId: string } | null> {
  if (!onMigrationPrompt) return null;

  let needsMigration = false;
  try {
    needsMigration = await needsPassphraseMigration(identityId, passphraseChangedAt);
  } catch (err) {
    console.warn('[Identity] migration: failed to read last-unlock timestamp:', err);
  }
  if (!needsMigration) return null;

  let attempt = 0;
  let lastError: 'wrong-passphrase' | 'failed' | undefined;

  for (;;) {
    const decision = await onMigrationPrompt({ identityId, passphraseChangedAt, attempt, lastError });
    if (decision.action === 'skip') return null;

    attempt += 1;

    let migration;
    try {
      migration = await reWrapPassphraseProtectedStores({
        newPassphrase,
        currentPassphrase: decision.oldPassphrase,
        targetIdentityId: identityId,
      });
    } catch (err) {
      console.error('[Identity] migration: re-wrap threw:', err);
      lastError = 'failed';
      continue;
    }

    if (migration.status !== 'migrated') {
      lastError = migration.status === 'no-match' ? 'wrong-passphrase' : 'failed';
      continue;
    }

    // The migrator derives a fresh new wrapping key identical to the one the
    // login/unlock flow already holds; release the duplicate.
    if (migration.newWrappingKey) {
      clearBytes(migration.newWrappingKey);
    }

    // Confirm device keys now decrypt with the (new) wrapping key.
    try {
      const storedKeys = await getDeviceKeysForIdentity(identityId);
      const deviceKeys = storedKeys[0];
      if (!deviceKeys) {
        throw new Error('No device keys after migration');
      }
      const decrypted = await decryptDeviceKeys(deviceKeys, wrappingKey);
      const deviceId = decrypted.deviceId;
      clearBytes(decrypted.ecdhPrivateKey);
      clearBytes(decrypted.kemPrivateKey);
      await setLastIdentityUnlockAt(identityId);
      return { deviceId };
    } catch (err) {
      console.warn('[Identity] migration: re-wrap succeeded but device keys still undecryptable:', err);
      lastError = 'failed';
      continue;
    }
  }
}
