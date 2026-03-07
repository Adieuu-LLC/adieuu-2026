# Forward Secrecy Implementation Plan

## Overview

This document captures the design decisions and implementation plan for adding partial forward secrecy to DM messages via X3DH-style pre-key exchange. The cryptographic primitives and API endpoints are already implemented; the remaining work is integrating the pre-key flow into the UI/service layer and adding key lifecycle management.

For the full architectural rationale, see `e2e-chat-architecture.md` Section 3.4.

---

## Design Decisions

### 1. Pre-Key Exchange Without Double Ratchet

We use an X3DH-style key exchange (SPK + OTPK) to wrap per-message session keys. This provides forward secrecy at the pre-key rotation granularity rather than per-message. Double Ratchet is deferred to v2 as a clean additive step on top of this foundation.

**Rationale:** The crypto layer (`packages/crypto/src/prekeys/`) is explicitly designed for this upgrade path. The current approach covers the most impactful threat model (compromised long-term keys don't reveal old messages) without the complexity of ratchet state synchronization across multiple devices.

### 2. Per-Message FS Toggle (Sender-Controlled)

Forward secrecy is not all-or-nothing. The sender decides per-message whether to use pre-key wrapping (FS-on) or static device key wrapping (FS-off):

- **FS-off (`preKeyType: 'static'`):** Message can be re-decrypted from server at any time using static device keys. Useful for general conversation history where server-side re-readability matters (e.g., lower-powered devices, users who want persistent history).
- **FS-on (`preKeyType: 'spk'` or `'otpk'`):** Message is decrypted once and stored locally. Pre-key private keys are eventually deleted, making the server-stored ciphertext permanently undecryptable.

The toggle is implemented as a sender-side UI control in the message composer. Default is FS-on.

**Metadata trade-off:** The `preKeyType` field is visible in message metadata, meaning an observer with server access can distinguish FS from non-FS messages. This was accepted because:
- All content is E2E encrypted regardless
- The threat model (server access + device key compromise) is narrow
- Hiding the distinction would require double-wrapping every message, notably increasing payload size per recipient device

### 3. SPK Rotation Tiers

Users configure rotation via a "Security level" setting rather than raw time values:

| Level | Rotation Interval | Max Retained SPKs | Hard-Delete Cap |
|-------|-------------------|-------------------|-----------------|
| Standard | 24h | 5 | 7 days |
| High | 4h | 8 | 48h |
| Maximum | 1h | 12 | 24h |

Rotation is triggered by both:
- **On app open:** If current SPK age exceeds the rotation interval, rotate immediately
- **In-app timer:** `setInterval` at the rotation interval while the app is running

This covers both users who leave the app open indefinitely and users who open it periodically.

### 4. Manual Rotation

Users can trigger immediate SPK rotation from security settings. This calls the same rotation function as the automatic path, bypassing and resetting the time check. Useful as a "panic button" if a user suspects compromise or observes unexpected behavior.

### 5. Configurable SPK Deletion Policy

Users choose how aggressively old SPK private keys are deleted:

- **`after-sync` (default):** Pending-message-aware. Old SPK private keys are retained until all messages encrypted under them have been decrypted. Safety caps (max retained SPKs, hard-delete time cap) still apply as a backstop for abandoned devices.
- **`timed` (stricter):** Pure timer-based. Old SPK private keys are deleted after a fixed interval following retirement (equal to the rotation interval of the current security tier), regardless of pending messages.

**Rationale for defaulting to `after-sync`:** Pure time-based deletion creates a hard UX cliff -- a user offline longer than the deletion window loses messages. Most users won't understand or expect this. Pending-message-aware deletion ensures users always receive their messages, while the safety cap provides eventual forward secrecy on abandoned devices.

**Rationale for offering `timed`:** High-threat-model users may prefer a tighter forward secrecy window and accept the trade-off that messages arriving after the deletion window are permanently unreadable. This is a conscious opt-in with clear warnings in the UI.

### 6. OTPK Batch Sizes by Platform

All platforms use OTPKs (same code path), with batch sizes tuned to storage durability:

| Platform | OTPK Batch Size | Rationale |
|----------|----------------|-----------|
| Desktop | 50 | Durable local storage (safeStorage/TEE) |
| Web | 5-10 | IndexedDB is volatile (cache clears, private browsing) |
| Mobile | 50 | Secure enclave / Keystore |

Replenishment threshold: upload a fresh batch when remaining count drops below 10 (desktop/mobile) or 3 (web).

### 7. Backward Compatibility

The `preKeyType` field on `SerializedWrappedKey` enables graceful coexistence:
- Static-key messages and pre-key messages can coexist in the same conversation
- Old clients default to `preKeyType: 'static'`
- No migration or flag day required

---

## Current State (What's Done)

| Component | Status |
|-----------|--------|
| `packages/crypto`: SPK/OTPK generation (`generateSignedPreKey`, `generateOneTimePreKeys`) | Done |
| `packages/crypto`: X3DH-style key exchange (`preKeyExchange`, `preKeyDecapsulate`) | Done |
| `packages/crypto`: Pre-key session key wrapping (`wrapSessionKeyWithPreKeys`, `unwrapSessionKeyWithPreKeys`) | Done |
| `packages/crypto`: Pre-key unit tests (SPK-only, SPK+OTPK, both profiles) | Done |
| `packages/shared`: API types (`SerializedWrappedKey` with pre-key fields, `PreKeyType`, pre-key API params) | Done |
| `packages/shared`: API client methods (`uploadPreKeys`, `claimPreKeys`, `getPreKeyCount`) | Done |
| `apps/api`: Pre-key upload/claim/count endpoints | Done |
| `apps/api`: Pre-key MongoDB model and repository | Done |
| `packages/ui`: `serializeWrappedKey` updated with `preKeyType` + required `deviceId` | Done |
| `packages/ui`: `preKeyStorage.ts` local pre-key storage (dual-backend, encrypted at rest) | Done |
| `packages/ui`: `preKeyService.ts` pre-key generation + upload on device setup | Done |
| `packages/ui`: `dmMessageService` encrypt branching (static vs pre-key per device) | Done |
| `packages/ui`: `dmMessageService` decrypt branching (static vs pre-key, `PreKeyPrivateKeys` input) | Done |
| `packages/ui`: `useDmMessages` pre-key claim + SPK verification on send (`forwardSecrecy` param) | Done |
| `packages/ui`: `useDmMessages` pre-key private key lookup on decrypt | Done |
| `packages/ui`: OTPK private key deletion after decrypt | Deferred (needs local message storage) |
| `packages/ui`: Local message storage for FS messages | Not started |
| `packages/ui`: SPK rotation + key lifecycle | Not started |
| `packages/ui`: OTPK replenishment | Not started |
| `packages/ui`: FS toggle UI | Not started |
| `apps/api`: SPK signature verification on upload | Done |

---

## Implementation Phases

### Phase 1: Pre-Key Storage and Upload -- DONE

**Goal:** Devices generate pre-keys on registration/login and upload them to the server.

#### 1.1 Local Pre-Key Storage -- DONE

- [x] `preKeyStorage.ts`: dual-backend (SecureStorage/IndexedDB), encrypted at rest with wrapping key
- [x] SPK: `StoredSignedPreKey` with `{ keyId, identityId, deviceId, ecdhPrivateKeyEncrypted, kemPrivateKeyEncrypted, status, createdAt, retiredAt? }`
- [x] OTPK: `StoredOneTimePreKey` with `{ keyId, identityId, deviceId, ecdhPrivateKeyEncrypted, kemPrivateKeyEncrypted, createdAt }`
- [x] Desktop: safeStorage backend via `setPreKeyStorageBackend()`
- [x] Web: IndexedDB fallback (same pattern as device key storage)

#### 1.2 Pre-Key Generation on Device Setup -- DONE

- [x] `preKeyService.ts`: `generateAndUploadPreKeys()` generates SPK + platform-appropriate OTPK batch
- [x] Stores private keys locally via `preKeyStorage`
- [x] Uploads public halves via `api.identity.uploadPreKeys()`
- [x] Called in `useIdentity.tsx` after both identity creation and new device login
- [x] Non-blocking: errors logged but don't prevent device setup

#### 1.3 SPK Signature Verification (Server-Side) -- DONE

- [x] `pre-key.controller.ts`: verifies SPK signature against `identity.signingPublicKey` on upload
- [x] Returns `400 Bad Request` on invalid signature

---

### Phase 2: Pre-Key Claiming and Encryption -- DONE

**Goal:** When sending a DM with FS enabled, claim pre-keys and use pre-key wrapping.

#### 2.1 Update Send Flow in `useDmMessages.ts` -- DONE

- [x] Added `forwardSecrecy?: boolean` to `SendDmMessageInput` (defaults to `true`)
- [x] When FS on: calls `claimPreKeys()` for recipient, verifies SPK signatures client-side
- [x] Builds mixed recipient list: pre-key wrapping for recipient devices, static for sender devices
- [x] Graceful fallback: if claim fails or SPK verification fails, falls back to static wrapping
- [x] When FS off: uses `getPublicKeys()` with static device keys (existing path, unchanged)

#### 2.2 Update `encryptDmMessage` in `dmMessageService.ts` -- DONE

- [x] Added `PreKeyRecipientData` interface with SPK/OTPK public keys and key IDs
- [x] Per-recipient branching: `wrapSessionKeyWithPreKeys()` when `preKeyData` present, `wrapSessionKey()` otherwise
- [x] Separate serializers: `serializeStaticWrappedKey()` and `serializePreKeyWrappedKey()`
- [x] Pre-key serializer maps `spkKemCiphertext` -> `kemCiphertext`, includes `signedPreKeyId`, `oneTimePreKeyId`, `oneTimeKemCiphertext`

#### 2.3 FS Toggle UI

- [ ] Add a toggle/button in the message composer for FS on/off
- [ ] Persist user's default preference (per-conversation or global)
- [ ] Visual indicator on sent messages showing FS status

---

### Phase 3: Pre-Key Decryption -- PARTIALLY DONE

**Goal:** Recipients decrypt FS-protected messages using stored pre-key private keys.

#### 3.1 Update `decryptDmMessage` in `dmMessageService.ts` -- DONE

- [x] Added `PreKeyPrivateKeys` interface with SPK + optional OTPK private keys
- [x] Branches on `wrappedKey.preKeyType`:
  - `'static'` (or absent): existing `findAndUnwrapSessionKey()` (unchanged)
  - `'spk'` / `'otpk'`: reconstructs `PreKeyWrappedKey` from serialized format, calls `unwrapSessionKeyWithPreKeys()`
- [x] Clear error messages for missing keys and wrong keys

#### 3.1b Update `useDmMessages.ts` Decrypt Flow -- DONE

- [x] `decryptMessages` now accepts `wrappingKey` parameter
- [x] Before decrypting, finds target wrapped key and checks `preKeyType`
- [x] If FS: looks up SPK private key via `findAndDecryptSignedPreKey()`, optionally OTPK via `findAndDecryptOneTimePreKey()`
- [x] Graceful degradation: missing SPK -> error message; missing OTPK -> warns, attempts SPK-only

#### 3.2 OTPK Private Key Deletion -- DEFERRED

**Blocked on:** Phase 3.3 (Local Message Storage). Deleting OTPK private keys before the decrypted message content is persisted locally would cause data loss -- on the next fetch, the server still has the ciphertext but the OTPK key is gone, making the message permanently unreadable.

**Current behavior:** OTPK private keys are retained after decrypt. This is less secure (OTPK messages remain re-decryptable) but avoids data loss. FS still functions through SPK rotation (Phase 4): when SPK private keys are eventually deleted, older FS messages become undecryptable from the server.

- [ ] After local message storage is implemented: delete OTPK private key after successful decrypt + local persist
- [ ] Mark the OTPK as consumed to prevent re-use

#### 3.3 Local Message Storage for FS Messages -- DEFERRED

**Rationale:** This is a distinct subsystem (IndexedDB-based message cache with query, expiry, and clearing logic) that can be built independently. Phases 1-4 function correctly without it -- FS messages are decryptable as long as the pre-key private keys exist locally. The main consequence of deferring is that OTPK deletion (3.2) is also deferred.

- [ ] IndexedDB store for decrypted FS message content, keyed by message ID
- [ ] Check local cache before attempting server-side decryption
- [ ] Queryable for conversation history display
- [ ] Handle local storage cleared (messages lost; display appropriate notice)
- [ ] Once implemented, unblock OTPK deletion (3.2)

---

### Phase 4: SPK Rotation and Key Lifecycle

**Goal:** Automate SPK rotation, implement pending-message-aware deletion, and add manual rotation.

#### 4.1 Rotation Timer and On-Open Check

- [ ] On app open: check current SPK age against rotation interval; rotate if overdue
- [ ] While app is running: schedule `setInterval` at the rotation interval
- [ ] Rotation function: generate new SPK, upload to server, mark old SPK as "retired" locally

#### 4.2 Security Level Setting

- [ ] Add "Security level" setting in identity/privacy preferences
- [ ] Options: Standard (24h), High (4h), Maximum (1h)
- [ ] Persist per-identity
- [ ] Changing the level takes effect on next rotation check

#### 4.3 Manual Rotation

- [ ] Add "Rotate keys now" action in security settings
- [ ] Calls the same rotation function, bypasses time check
- [ ] Confirmation dialog explaining what this does

#### 4.4 SPK Deletion Policy Setting

- [ ] Add "Key deletion policy" setting in security preferences
  - `after-sync` (default): "Delete old keys after messages are received (recommended)"
  - `timed`: "Delete old keys on a fixed schedule (stricter, may lose unread messages)"
- [ ] Display clear warning when selecting `timed` mode explaining the trade-off
- [ ] Persist per-identity alongside security level

#### 4.5 Deletion Logic (Both Policies)

- [ ] `after-sync` policy:
  - After message sync completes, check each retired SPK
  - Query: are there any undelivered/undecrypted messages referencing this SPK's key ID?
  - If none: delete the retired SPK's private key
  - If yes: retain
  - Apply safety caps: if retired SPK count exceeds tier max, delete oldest regardless
  - Apply hard-delete cap: delete retired SPKs older than the tier's time cap regardless
- [ ] `timed` policy:
  - After SPK retirement, schedule deletion timer equal to the current tier's rotation interval
  - When timer fires: delete retired SPK private key unconditionally
  - No pending-message check; forward secrecy window is strict

**Estimated effort:** High

---

### Phase 5: OTPK Replenishment

**Goal:** Keep the server stocked with fresh OTPKs.

#### 5.1 Replenishment Trigger

- [ ] After decrypting a message that consumed an OTPK, check remaining count
- [ ] Call `api.identity.getPreKeyCount()` (or track locally)
- [ ] If below threshold (10 desktop/mobile, 3 web): generate and upload fresh batch
- [ ] Also check on app open (in case OTPKs were consumed while offline on another device)

#### 5.2 Replenishment Batch Generation

- [ ] Generate N new OTPKs (platform-dependent batch size)
- [ ] Store private keys locally
- [ ] Upload public halves to server
- [ ] Handle upload failure (retry, don't block message flow)

**Estimated effort:** Low-Medium

---

## Dependency Graph

```
Phase 1 (storage + upload) .............. DONE
    |
    +---> Phase 2 (claim + encrypt) ..... DONE (UI toggle pending)
    |         |
    |         +---> Phase 5 (OTPK replenishment)
    |
    +---> Phase 3 (decrypt) ............. DONE (3.2/3.3 deferred)
              |
              +---> Phase 4 (rotation + lifecycle)
              |
              +---> Phase 5 (OTPK replenishment)
              |
              +---> Phase 3.3 (local message storage)
                        |
                        +---> Phase 3.2 (OTPK deletion)
```

Phases 1-3 (core decrypt path) are complete. Phase 4 (SPK rotation) is the next critical piece -- it provides the forward secrecy guarantee by eventually deleting old SPK private keys. Phase 5 (OTPK replenishment) can follow. Phase 3.3 (local message storage) and 3.2 (OTPK deletion) are deferred but not blocking: FS messages work end-to-end, and OTPK keys are simply retained longer than ideal until local storage is in place.

---

## Configuration Defaults

```typescript
interface ForwardSecrecyConfig {
  securityLevel: 'standard' | 'high' | 'maximum';
  spkDeletionPolicy: 'after-sync' | 'timed'; // default: 'after-sync'
  defaultFsEnabled: boolean; // default: true
}

const SECURITY_LEVEL_CONFIG = {
  standard: {
    spkRotationIntervalMs: 24 * 60 * 60 * 1000,    // 24h
    maxRetiredSpks: 5,
    hardDeleteCapMs: 7 * 24 * 60 * 60 * 1000,      // 7 days
  },
  high: {
    spkRotationIntervalMs: 4 * 60 * 60 * 1000,     // 4h
    maxRetiredSpks: 8,
    hardDeleteCapMs: 48 * 60 * 60 * 1000,           // 48h
  },
  maximum: {
    spkRotationIntervalMs: 1 * 60 * 60 * 1000,     // 1h
    maxRetiredSpks: 12,
    hardDeleteCapMs: 24 * 60 * 60 * 1000,           // 24h
  },
} as const;

const PLATFORM_OTPK_CONFIG = {
  desktop: { batchSize: 50, replenishThreshold: 10 },
  web:     { batchSize: 10, replenishThreshold: 3 },
  mobile:  { batchSize: 50, replenishThreshold: 10 },
} as const;
```

---

## Files Changed / To Be Changed

| File | Changes | Status |
|------|---------|--------|
| `packages/ui/src/services/preKeyStorage.ts` (new) | Pre-key local storage, dual-backend, encrypted at rest | Done |
| `packages/ui/src/services/preKeyService.ts` (new) | Pre-key generation + upload on device setup | Done |
| `packages/ui/src/services/dmMessageService.ts` | Encrypt/decrypt branching on `preKeyType`, `PreKeyRecipientData`, `PreKeyPrivateKeys` | Done |
| `packages/ui/src/hooks/useDmMessages.ts` | Pre-key claim flow, SPK verification, FS toggle param, pre-key lookup on decrypt | Done |
| `packages/ui/src/hooks/useIdentity.tsx` | Pre-key generation calls on identity creation + new device login | Done |
| `packages/ui/src/index.ts` | Export `setPreKeyStorageBackend` | Done |
| `apps/desktop/src/renderer/main.tsx` | Initialize pre-key storage backend | Done |
| `apps/api/src/routes/identity/pre-key.controller.ts` | SPK signature verification on upload | Done |
| `packages/ui/src/hooks/usePreKeys.ts` (new) | Pre-key lifecycle hook (rotation timer, replenishment) | Phase 4/5 |
| `packages/ui/src/services/localMessageStorage.ts` (new) | IndexedDB cache for decrypted FS messages | Phase 3.3 (deferred) |
| `packages/ui/src/components/` | FS toggle UI in composer, security level setting, deletion policy setting | Phase 2.3/4 |

---

## Testing Strategy

### Unit Tests -- Partially Done
- [x] Encrypt with SPK-only: produces `preKeyType: 'spk'`, correct key IDs
- [x] Encrypt with SPK+OTPK: produces `preKeyType: 'otpk'`, includes `oneTimeKemCiphertext`
- [x] Mixed wrapping: pre-key for recipient, static for sender in same message
- [x] Independent ephemeral keys per pre-key wrapped recipient
- [x] Encrypt+decrypt round-trip with SPK-only
- [x] Encrypt+decrypt round-trip with SPK+OTPK
- [x] Mixed wrapping round-trip: both recipient (FS) and sender (static) decrypt correctly
- [x] FS message fails without pre-key private keys (clear error)
- [x] FS message fails with wrong pre-key private keys (clear error)
- [x] Backward compatibility: static messages decrypt with unchanged code path
- [ ] SPK rotation logic (time checks, timer scheduling) -- Phase 4
- [ ] Deletion policy: `after-sync` (mock pending message queries, safety cap enforcement) -- Phase 4
- [ ] Deletion policy: `timed` (verify unconditional deletion after interval) -- Phase 4
- [ ] OTPK replenishment threshold checks -- Phase 5

### Integration Tests
- [ ] Full send/receive cycle: claim pre-keys -> encrypt -> deliver -> decrypt -> verify OTPK deletion
- [ ] SPK rotation during active conversation
- [ ] Mixed FS/non-FS messages in same conversation
- [ ] New device setup: FS messages unavailable, static messages accessible

### Security Tests
- [ ] Verify `after-sync`: old SPK private keys are deleted after pending messages drained
- [ ] Verify `timed`: old SPK private keys are deleted unconditionally after interval
- [ ] Verify OTPK private keys are deleted after single use
- [x] Verify pre-key upload rejects invalid SPK signatures (server-side)
- [ ] Verify claimed OTPKs are atomically consumed (no double-claim)
