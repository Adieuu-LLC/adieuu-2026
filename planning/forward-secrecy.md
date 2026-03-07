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
- Hiding the distinction would require double-wrapping every message, increasing payload size per recipient device

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

Users can trigger immediate SPK rotation from security settings. This calls the same rotation function as the automatic path, bypassing the time check. Useful as a "panic button" if a user suspects compromise or observes unexpected behavior.

### 5. Pending-Message-Aware SPK Deletion

Old SPK private keys are not deleted on a pure timer. Instead, deletion is tied to message receipt:

1. SPK rotated -> old SPK marked "retired" locally
2. Client syncs and decrypts pending messages using retired SPKs
3. After sync: if no pending messages reference a retired SPK, delete its private key
4. Safety caps prevent unbounded accumulation (per tier table above)

**Rationale:** Pure time-based deletion creates a hard UX cliff -- a user offline longer than the grace period loses messages. Pending-message-aware deletion ensures users always receive their messages, while the safety cap provides eventual forward secrecy on abandoned devices.

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
| `packages/ui`: `dmMessageService` encrypt/decrypt (still uses static keys) | Needs update |
| `packages/ui`: Pre-key upload on device registration/login | Not started |
| `packages/ui`: Pre-key claim before sending | Not started |
| `packages/ui`: SPK rotation + key lifecycle | Not started |
| `packages/ui`: OTPK replenishment | Not started |
| `packages/ui`: FS toggle UI | Not started |
| `apps/api`: SPK signature verification on upload | TODO in controller |

---

## Implementation Phases

### Phase 1: Pre-Key Storage and Upload

**Goal:** Devices generate pre-keys on registration/login and upload them to the server.

#### 1.1 Local Pre-Key Storage

- [ ] Define local storage schema for pre-key private keys (alongside device keys)
  - SPK: `{ keyId, ecdhPrivateKey, kemPrivateKey, createdAt, status: 'active' | 'retired', retiredAt? }`
  - OTPK: `{ keyId, ecdhPrivateKey, kemPrivateKey, createdAt, consumed: boolean }`
- [ ] Implement storage/retrieval in the device key store (encrypted at rest, same protection as device keys)
- [ ] Desktop: safeStorage/TEE-backed
- [ ] Web: IndexedDB (same as current device key storage)

#### 1.2 Pre-Key Generation on Device Setup

- [ ] After device key generation/import, generate initial pre-key bundle:
  - 1 signed pre-key (SPK)
  - N one-time pre-keys (OTPKs), where N is platform-dependent batch size
- [ ] Store private keys locally
- [ ] Call `api.identity.uploadPreKeys()` with public halves
- [ ] Handle upload failure (retry logic, don't block device setup)

#### 1.3 SPK Signature Verification (Server-Side)

- [ ] Complete the existing TODO in `pre-key.controller.ts`: verify SPK signature against identity's signing public key on upload
- [ ] Reject uploads with invalid signatures

**Estimated effort:** Medium

---

### Phase 2: Pre-Key Claiming and Encryption

**Goal:** When sending a DM with FS enabled, claim pre-keys and use pre-key wrapping.

#### 2.1 Update Send Flow in `useDmMessages.ts`

- [ ] Add FS toggle state to send flow (default: on)
- [ ] When FS is on: call `api.identity.claimPreKeys()` instead of `api.identity.getPublicKeys()`
- [ ] Build recipient key list from claimed pre-keys (includes SPK, optional OTPK, pre-key IDs)
- [ ] When FS is off: continue using `getPublicKeys()` with static device keys (existing path)

#### 2.2 Update `encryptDmMessage` in `dmMessageService.ts`

- [ ] Accept pre-key data in `EncryptMessageInput` (SPK public keys, OTPK public keys, key IDs, pre-key type)
- [ ] Branch on pre-key type:
  - `'static'`: use existing `wrapSessionKeyForRecipients()` (no change)
  - `'spk'` / `'otpk'`: use `wrapSessionKeyWithPreKeys()` from `@adieuu/crypto`
- [ ] Pass `preKeyType`, `signedPreKeyId`, `oneTimePreKeyId`, `oneTimeKemCiphertext` to `serializeWrappedKey()`

#### 2.3 FS Toggle UI

- [ ] Add a toggle/button in the message composer for FS on/off
- [ ] Persist user's default preference (per-conversation or global)
- [ ] Visual indicator on sent messages showing FS status

**Estimated effort:** Medium-High

---

### Phase 3: Pre-Key Decryption

**Goal:** Recipients decrypt FS-protected messages using stored pre-key private keys.

#### 3.1 Update `decryptDmMessage` in `dmMessageService.ts`

- [ ] Read `preKeyType` from incoming `SerializedWrappedKey`
- [ ] Branch on pre-key type:
  - `'static'`: use existing `findAndUnwrapSessionKey()` (no change)
  - `'spk'` / `'otpk'`: look up corresponding SPK/OTPK private keys from local storage, use `unwrapSessionKeyWithPreKeys()`
- [ ] Handle missing private key gracefully (key was deleted or device was reset)
- [ ] Store decrypted message in local message database

#### 3.2 OTPK Private Key Deletion

- [ ] After successfully decrypting a message that consumed an OTPK, delete that OTPK's private key from local storage
- [ ] Mark the OTPK as consumed to prevent re-use

#### 3.3 Local Message Storage for FS Messages

- [ ] Ensure FS-decrypted messages are persisted locally (they cannot be re-derived from server)
- [ ] Local storage should be queryable for conversation history display
- [ ] Handle the case where local storage is cleared (messages are lost; display appropriate notice)

**Estimated effort:** Medium-High

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

#### 4.4 Pending-Message-Aware Deletion

- [ ] After message sync completes, check each retired SPK:
  - Query: are there any undelivered/undecrypted messages referencing this SPK's key ID?
  - If none: delete the retired SPK's private key
  - If yes: retain
- [ ] Apply safety caps: if retired SPK count exceeds tier max, delete oldest regardless
- [ ] Apply hard-delete cap: delete retired SPKs older than the tier's time cap regardless

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
Phase 1 (storage + upload)
    |
    +---> Phase 2 (claim + encrypt)
    |         |
    |         +---> Phase 5 (OTPK replenishment)
    |
    +---> Phase 3 (decrypt)
              |
              +---> Phase 4 (rotation + lifecycle)
              |
              +---> Phase 5 (OTPK replenishment)
```

Phases 2 and 3 can be developed in parallel once Phase 1 is done. Phase 4 depends on Phase 3 (retirement tracking requires the decrypt path to report which SPKs it used). Phase 5 depends on Phase 3 (replenishment triggers on OTPK consumption).

---

## Configuration Defaults

```typescript
interface ForwardSecrecyConfig {
  securityLevel: 'standard' | 'high' | 'maximum';
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

## Files Likely Touched

| File | Changes |
|------|---------|
| `packages/ui/src/services/dmMessageService.ts` | Encrypt/decrypt branching on `preKeyType` |
| `packages/ui/src/hooks/useDmMessages.ts` | Pre-key claim flow, FS toggle state |
| `packages/ui/src/services/deviceKeyService.ts` (or similar) | Pre-key local storage, rotation, deletion |
| `packages/ui/src/hooks/usePreKeys.ts` (new) | Pre-key lifecycle hook (rotation timer, replenishment) |
| `packages/ui/src/components/` | FS toggle UI in composer, security level setting |
| `apps/api/src/routes/identity/controller.ts` | SPK signature verification (existing TODO) |
| `packages/shared/src/api/client.ts` | Types already done; may need minor additions |

---

## Testing Strategy

### Unit Tests
- SPK rotation logic (time checks, timer scheduling)
- Pending-message-aware deletion (mock pending message queries)
- OTPK replenishment threshold checks
- Encrypt/decrypt round-trip with all three `preKeyType` values
- Backward compatibility: decrypt `'static'` messages with new code path

### Integration Tests
- Full send/receive cycle: claim pre-keys -> encrypt -> deliver -> decrypt -> verify OTPK deletion
- SPK rotation during active conversation
- Mixed FS/non-FS messages in same conversation
- New device setup: FS messages unavailable, static messages accessible

### Security Tests
- Verify old SPK private keys are deleted after pending messages drained
- Verify OTPK private keys are deleted after single use
- Verify pre-key upload rejects invalid SPK signatures
- Verify claimed OTPKs are atomically consumed (no double-claim)
