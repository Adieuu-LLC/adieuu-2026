/**
 * Integration test for the full passphrase change flow.
 *
 * Uses REAL crypto functions (no mocks) to verify:
 * 1. Create identity with passphrase A → derive ident, bundleId, store bundle
 * 2. Login with passphrase A → derive same ident → find identity
 * 3. Change passphrase to B → derive new ident, migrate bundle
 * 4. Login with passphrase B → derive same new ident → find identity
 * 5. Fetch bundle after change → deriveBundleId(newIdent) matches migrated location
 * 6. Decrypt bundle with passphrase B → key material intact
 *
 * This catches issues where login succeeds but key derivation breaks afterward
 * (the alias "feels lost" because E2E unlock fails post-login).
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { generateIdentityHash, CURRENT_HASH_VERSION } from '../utils/identity-hash';
import { deriveBundleId } from '../utils/crypto';
import {
  deriveKeyFromPassword,
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  randomBytes,
  toBase64,
  fromBase64,
  toHex,
  ARGON2_DEFAULTS,
} from '@adieuu/crypto';

const TEST_ACCOUNT_HASH = createHash('sha256').update('test-user-id-fixed').digest('hex');

/**
 * Simulates the client-side bundle encryption (same as e2eKeyService.encryptKeyBundle).
 */
async function encryptBundle(
  plaintext: Uint8Array,
  passphrase: string,
): Promise<{ encryptedBundle: string; salt: string; nonce: string }> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKeyFromPassword({
    password: passphrase,
    salt,
    memoryCost: ARGON2_DEFAULTS.memoryCost,
    timeCost: ARGON2_DEFAULTS.timeCost,
    parallelism: ARGON2_DEFAULTS.parallelism,
    outputLength: 32,
  });
  const { ciphertext, nonce } = encryptChaCha20Poly1305(derivedKey, plaintext);
  return {
    encryptedBundle: toBase64(ciphertext),
    salt: toBase64(salt),
    nonce: toBase64(nonce),
  };
}

/**
 * Simulates the client-side bundle decryption (same as e2eKeyService.decryptKeyBundle).
 */
async function decryptBundle(
  bundle: { encryptedBundle: string; salt: string; nonce: string },
  passphrase: string,
): Promise<Uint8Array> {
  const salt = fromBase64(bundle.salt);
  const nonce = fromBase64(bundle.nonce);
  const ciphertext = fromBase64(bundle.encryptedBundle);

  const derivedKey = await deriveKeyFromPassword({
    password: passphrase,
    salt,
    memoryCost: ARGON2_DEFAULTS.memoryCost,
    timeCost: ARGON2_DEFAULTS.timeCost,
    parallelism: ARGON2_DEFAULTS.parallelism,
    outputLength: 32,
  });

  return decryptChaCha20Poly1305(derivedKey, ciphertext, nonce);
}

describe('passphrase change integration (real crypto, no mocks)', () => {
  const passphraseA = 'my-original-alias-password';
  const passphraseB = 'my-new-alias-password-42';
  const signingKeyMaterial = randomBytes(32);

  test('full flow: create → login → change → login → decrypt', async () => {
    // =========================================================================
    // STEP 1: Create identity with passphrase A
    // =========================================================================

    const { hash: identA } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );
    const bundleIdA = deriveBundleId(identA);

    // Encrypt the signing key with passphrase A (simulates identity creation)
    const bundleA = await encryptBundle(signingKeyMaterial, passphraseA);

    // Simulated DB state after creation:
    // identity.ident = identA, identity.hashVersion = CURRENT_HASH_VERSION
    // keyBundle.bundleId = bundleIdA, keyBundle.encryptedBundle = bundleA

    // =========================================================================
    // STEP 2: Login with passphrase A (verify ident derivation is consistent)
    // =========================================================================

    const { hash: loginIdentA } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // Login derives the SAME ident → findActiveByIdent succeeds
    expect(loginIdentA).toBe(identA);

    // After login, client fetches bundle: deriveBundleId(identity.ident)
    const fetchBundleIdA = deriveBundleId(loginIdentA);
    expect(fetchBundleIdA).toBe(bundleIdA);

    // Client decrypts bundle with passphrase A
    const decryptedA = await decryptBundle(bundleA, passphraseA);
    expect(toHex(decryptedA)).toBe(toHex(signingKeyMaterial));

    // =========================================================================
    // STEP 3: Change passphrase from A to B
    // =========================================================================

    // 3a. bundleByPassphrase: server derives ident from passphrase A → finds bundle
    const { hash: bundleFetchIdent } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );
    const bundleFetchBundleId = deriveBundleId(bundleFetchIdent);
    expect(bundleFetchBundleId).toBe(bundleIdA);

    // 3b. Client decrypts with passphrase A
    const decryptedForChange = await decryptBundle(bundleA, passphraseA);
    expect(toHex(decryptedForChange)).toBe(toHex(signingKeyMaterial));

    // 3c. Client re-encrypts with passphrase B
    const bundleB = await encryptBundle(decryptedForChange, passphraseB);

    // 3d. Server: changePassphrase service
    // Derives currentIdent from passphrase A
    const { hash: changeCurrentIdent } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );
    expect(changeCurrentIdent).toBe(identA);

    // Derives newIdent from passphrase B
    const { hash: identB } = await generateIdentityHash(
      passphraseB,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // New ident MUST differ from old ident (different passphrase → different hash)
    expect(identB).not.toBe(identA);

    // Compute bundle IDs for migration
    const oldBundleId = deriveBundleId(changeCurrentIdent);
    const newBundleId = deriveBundleId(identB);
    expect(oldBundleId).toBe(bundleIdA);
    expect(newBundleId).not.toBe(oldBundleId);

    // Simulated DB state after migration:
    // identity.ident = identB, identity.hashVersion = CURRENT_HASH_VERSION
    // keyBundle.bundleId = newBundleId, keyBundle.encryptedBundle = bundleB

    // =========================================================================
    // STEP 4: Login with passphrase B (after change)
    // =========================================================================

    const { hash: loginIdentB } = await generateIdentityHash(
      passphraseB,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // Login derives the SAME newIdent → findActiveByIdent succeeds
    expect(loginIdentB).toBe(identB);

    // =========================================================================
    // STEP 5: Fetch bundle after login (key derivation chain intact)
    // =========================================================================

    // Server: getKeyBundleCtrl uses identity.ident (now identB) to derive bundleId
    const postChangeBundleId = deriveBundleId(loginIdentB);
    expect(postChangeBundleId).toBe(newBundleId);

    // =========================================================================
    // STEP 6: Decrypt bundle with passphrase B (E2E unlock succeeds)
    // =========================================================================

    const decryptedB = await decryptBundle(bundleB, passphraseB);
    expect(toHex(decryptedB)).toBe(toHex(signingKeyMaterial));
  });

  test('old passphrase cannot login after change', async () => {
    const { hash: identA } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // After change, identity.ident = identB (derived from passphraseB)
    const { hash: identB } = await generateIdentityHash(
      passphraseB,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // Login attempt with old passphrase A derives identA
    const { hash: loginAttemptIdent } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    // identA !== identB → findActiveByIdent(identA) won't find the identity (ident is now identB)
    expect(loginAttemptIdent).toBe(identA);
    expect(loginAttemptIdent).not.toBe(identB);
  });

  test('old passphrase cannot decrypt new bundle', async () => {
    // Re-encrypted bundle with passphrase B
    const bundleB = await encryptBundle(signingKeyMaterial, passphraseB);

    // Attempt to decrypt with passphrase A should fail
    await expect(decryptBundle(bundleB, passphraseA)).rejects.toThrow();
  });

  test('deriveBundleId is deterministic for same ident', async () => {
    const { hash: ident } = await generateIdentityHash(
      passphraseA,
      TEST_ACCOUNT_HASH,
      CURRENT_HASH_VERSION,
    );

    const id1 = deriveBundleId(ident);
    const id2 = deriveBundleId(ident);
    expect(id1).toBe(id2);
  });

  test('generateIdentityHash is deterministic for same inputs', async () => {
    const result1 = await generateIdentityHash(passphraseA, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    const result2 = await generateIdentityHash(passphraseA, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    expect(result1.hash).toBe(result2.hash);
    expect(result1.version).toBe(result2.version);
  });

  test('different passphrases produce different idents (no collision)', async () => {
    const { hash: h1 } = await generateIdentityHash(passphraseA, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    const { hash: h2 } = await generateIdentityHash(passphraseB, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    expect(h1).not.toBe(h2);
  });

  test('different passphrases produce different bundleIds', async () => {
    const { hash: h1 } = await generateIdentityHash(passphraseA, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    const { hash: h2 } = await generateIdentityHash(passphraseB, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    expect(deriveBundleId(h1)).not.toBe(deriveBundleId(h2));
  });

  test('bundle re-encryption preserves key material through multiple changes', async () => {
    const passphrases = [
      'first-passphrase-secure',
      'second-passphrase-123',
      'third-passphrase-final',
    ];

    let currentBundle = await encryptBundle(signingKeyMaterial, passphrases[0]!);
    let currentIdent: string;

    // Initial creation
    const initial = await generateIdentityHash(passphrases[0]!, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    currentIdent = initial.hash;

    for (let i = 1; i < passphrases.length; i++) {
      const prevPass = passphrases[i - 1]!;
      const nextPass = passphrases[i]!;

      // Client decrypts with current passphrase
      const decrypted = await decryptBundle(currentBundle, prevPass);
      expect(toHex(decrypted)).toBe(toHex(signingKeyMaterial));

      // Client re-encrypts with next passphrase
      currentBundle = await encryptBundle(decrypted, nextPass);

      // Server migrates
      const { hash: newIdent } = await generateIdentityHash(nextPass, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
      expect(newIdent).not.toBe(currentIdent);
      currentIdent = newIdent;
    }

    // After all changes, verify final state
    const lastPass = passphrases[passphrases.length - 1]!;

    // Login with final passphrase derives correct ident
    const { hash: finalLoginIdent } = await generateIdentityHash(lastPass, TEST_ACCOUNT_HASH, CURRENT_HASH_VERSION);
    expect(finalLoginIdent).toBe(currentIdent);

    // Bundle at deriveBundleId(finalIdent) decrypts with final passphrase
    const finalDecrypted = await decryptBundle(currentBundle, lastPass);
    expect(toHex(finalDecrypted)).toBe(toHex(signingKeyMaterial));
  });
});
