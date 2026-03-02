# Device Key Backup, Export & Import

## 1. Problem

Users' device encryption keys are critical for reading and sending DMs. If keys
are lost (cleared cache on web, uninstalled app, damaged disk), all messages
encrypted to that device become permanently unreadable. Users need a way to:

- **Export** a portable backup of their device keys.
- **Import** a previously exported backup on the same or a new device.
- Do so securely, without creating an unprotected copy of key material.

---

## 2. Threat Model

| Threat | Mitigation |
|--------|------------|
| Export file stolen at rest | Outer encryption with a user-chosen export password (Argon2id HIGH_SECURITY + HKDF + AES-GCM). Inner key material is also passphrase-encrypted. |
| Export password brute-forced | Argon2id HIGH_SECURITY params (256 MB, timeCost 4) -- stronger than identity passphrase derivation. |
| User forgets export password | We cannot recover. UX must emphasise this clearly. |
| Attacker intercepts export file in transit | File is encrypted; no plaintext ever leaves the device. |
| Imported keys for wrong identity overwrite real keys | Import validates identity ID matches the current signed-in identity and uses merge-or-skip semantics (never silent overwrite). |
| Export file tampered with | AES-GCM provides authenticated encryption; tampered data fails to decrypt. |
| Wrapping salt missing on new device | Export includes the wrapping salt so imported keys can be decrypted with the identity passphrase. |

---

## 3. Export File Format

Export is **per-identity** -- the user exports all device keys for the currently
signed-in identity. Each identity's keys are encrypted with that identity's
passphrase, so exporting keys for an identity you are not signed into would
produce unusable data. The format is extensible for future key types (community
ciphers, group sender keys, etc.).

```
Adieuu Key Backup v1 (binary)
-------------------------------------------------------
Header (JSON, UTF-8, length-prefixed):
  {
    "v": 1,
    "format": "adieuu-key-backup",
    "createdAt": "ISO-8601",
    "kdf": {
      "algorithm": "argon2id",
      "timeCost": 4,
      "memoryCost": 262144,
      "parallelism": 4,
      "salt": "<base64, 32 bytes>"
    },
    "hkdf": {
      "algorithm": "hkdf-sha3-256",
      "info": "adieuu-key-backup-v1"
    },
    "encryption": {
      "algorithm": "AES-256-GCM",
      "nonce": "<base64, 12 bytes>"
    }
  }
-------------------------------------------------------
Encrypted payload (AES-256-GCM ciphertext + 16-byte tag):
  Plaintext is JSON:
  {
    "payloadVersion": 1,
    "identityId": "<id>",
    "wrappingSalt": "<base64>",
    "devices": [
      {
        "deviceId": "<id>",
        "ecdhPrivateKeyEncrypted": { "ciphertext": "...", "nonce": "..." },
        "kemPrivateKeyEncrypted": { "ciphertext": "...", "nonce": "..." },
        "createdAt": "ISO-8601"
      },
      ...
    ]
  }
-------------------------------------------------------
```

**Binary layout:**

```
[4 bytes: header length as uint32 big-endian]
[header JSON bytes]
[remaining: AES-GCM ciphertext]
```

File extension: `.adieuu-keys`

**Key derivation chain:**

```
export password
  -> Argon2id (HIGH_SECURITY: 256 MB, timeCost 4, parallelism 4, 32-byte salt)
  -> 32-byte IKM
  -> HKDF-SHA3-256(ikm, salt, info='adieuu-key-backup-v1')
  -> 32-byte AES-256-GCM key
```

Note: the encrypted payload contains `StoredDeviceKeys` records. The private
keys within those records are **already** encrypted with the identity
passphrase-derived wrapping key (Argon2id + AES-GCM). The outer export
encryption is an independent layer. To actually use the keys after import, the
user still needs their identity passphrase.

The `wrappingSalt` is included so that after import the user can derive the
same wrapping key from their passphrase. Without it, imported keys would be
undecryptable even with the correct passphrase.

The `payloadVersion` field enables future extensions (e.g. adding
`communityCiphers`, `groupSenderKeys`) without changing the outer format.

---

## 4. Export Flow

### 4a. UI (Identity > Devices)

1. User clicks "Export Key Backup".
2. Modal prompts: "Choose an export password to protect this backup."
   - Password field + confirmation field.
   - Minimum length: 8 characters (matches identity passphrase minimum).
   - Prominent warning: "If you forget this password, the backup cannot be recovered."
3. Export is scoped to the currently signed-in identity (no identity selector).
4. On submit:
   a. Derive encryption key: Argon2id HIGH_SECURITY -> HKDF-SHA3-256.
   b. Collect all `StoredDeviceKeys` for the current identity.
   c. Read the wrapping salt for the current identity.
   d. Serialize to JSON (including `wrappingSalt`), encrypt with AES-256-GCM.
   e. Build the binary file (header + ciphertext).
   f. Trigger a file download via `fileSystem.saveFile`.
5. Success toast: "Key backup exported successfully."

### 4b. Platform Differences

| | Desktop | Web |
|---|---------|-----|
| Save method | Browser-style download (`Blob` + anchor click) | `showSaveFilePicker` with anchor fallback |
| Default filename | `adieuu-keys-YYYY-MM-DD.adieuu-keys` | Same |
| Key source | Per-identity secure files (TEE) | IndexedDB |

---

## 5. Import Flow

### 5a. UI (Identity > Devices)

1. User clicks "Import Key Backup".
2. File picker opens (accepts `.adieuu-keys`).
3. Modal prompts: "Enter the export password used when creating this backup."
4. On submit:
   a. Read file, parse header.
   b. Validate `format === 'adieuu-key-backup'` and `v === 1`.
   c. Derive decryption key from password + header KDF params + HKDF.
   d. Decrypt payload with AES-256-GCM.
   e. Parse decrypted JSON.
   f. Validate `identityId` matches the currently signed-in identity.
   g. Check which devices already exist locally (by `deviceId`):
      - If keys for some devices already exist, show merge confirmation:
        "N of M devices already exist on this device.
        Skip existing / Replace existing."
      - If no overlap, import directly.
   h. Import the wrapping salt: if no local salt exists for this identity,
      store the exported salt. If a local salt already exists, keep the
      local salt and re-wrap imported keys (decrypt with exported salt +
      passphrase, re-encrypt with local salt + passphrase).
   i. Store imported keys via the device key storage layer (passthrough
      when salts match; re-encrypted when salts differ).
5. Success toast: "Imported N device key(s)."

### 5b. Error Handling

| Error | User-facing message |
|-------|---------------------|
| Wrong password | "Incorrect export password. The backup could not be decrypted." |
| Corrupt file | "The backup file is damaged or not a valid Adieuu key backup." |
| Unsupported version | "This backup was created with a newer version of Adieuu. Please update." |
| No keys in file | "The backup file contains no device keys." |
| Identity mismatch | "This backup is for a different identity. Sign in to the correct identity and try again." |

---

## 6. Security Considerations

- **Double encryption:** Inner (identity passphrase) + outer (export password).
  An attacker needs both passwords to access raw private keys.
- **No plaintext on disk:** Export file is always encrypted. The decrypted
  payload exists only in memory during import.
- **Memory cleanup:** After import, clear any decrypted key material from
  memory using `clearBytes()`.
- **Export password strength:** Enforce minimum 8 characters (matching identity
  passphrase minimum).
- **No server involvement:** Export/import is entirely local. No key material
  is transmitted over the network.
- **Replay protection:** Each export has a unique salt and nonce. Identical
  exports produce different ciphertext.
- **Domain separation:** HKDF with `KDF_INFO.KEY_BACKUP` info string ensures
  the derived AES key cannot collide with keys derived for other purposes,
  even if the same password and salt are reused.
- **Identity binding:** The payload includes `identityId`. Import validates
  that it matches the currently signed-in identity. This prevents accidentally
  importing keys for the wrong identity.
- **Wrapping salt included:** The export includes the per-identity wrapping
  salt so that imported keys can be decrypted with the identity passphrase on
  the target device.

---

## 7. Implementation Plan

### Phase 1: Export & Import Service

**New file:** `packages/ui/src/services/keyBackupService.ts`

```
exportKeyBackup(
  identityId: string,
  wrappingSalt: Uint8Array,
  exportPassword: string,
): Promise<Uint8Array>
```

- Reads `StoredDeviceKeys` for the identity via `getDeviceKeysForIdentity`.
- Reads the wrapping salt for the identity.
- Derives export key: Argon2id HIGH_SECURITY -> HKDF-SHA3-256.
- Encrypts with AES-256-GCM.
- Returns the binary `.adieuu-keys` blob.

```
parseKeyBackupHeader(
  data: Uint8Array,
): KeyBackupHeader
```

- Parses and validates the header from the binary file.

```
decryptKeyBackup(
  data: Uint8Array,
  exportPassword: string,
): Promise<KeyBackupPayload>
```

- Parses header, derives key, decrypts, validates.
- Returns parsed payload for the UI to confirm merge semantics.

```
applyKeyBackupImport(
  payload: KeyBackupPayload,
  mergeStrategy: 'skip' | 'replace',
): Promise<{ imported: number; skipped: number }>
```

- Applies the import based on user-chosen merge strategy.
- Merge is per-device: for each device in the payload, if a local record
  with the same `deviceId` exists, apply the strategy (skip or replace).
  If not, always import.

### Phase 2: UI Components

- `ExportKeyBackupModal` -- password input, progress indicator.
- `ImportKeyBackupModal` -- file picker, password input, merge confirmation.
- Buttons in Identity > Devices page (both web and desktop).
- i18n strings for all prompts, errors, and confirmations.

---

## 8. UX Notes

- Export/import should be available on **both web and desktop** since web
  users are most at risk of key loss (cache clear).
- The export modal should strongly recommend storing the backup file in a
  safe location (password manager, encrypted drive, etc.).
- Import should be non-destructive by default (skip existing devices) to
  prevent accidental data loss.
- Consider periodic reminder to export if the user has never exported
  (e.g., after 7 days of having keys, show a one-time prompt).

---

## 9. Testing Checklist

- [ ] Unit: `exportKeyBackup` produces valid binary with correct header.
- [ ] Unit: `decryptKeyBackup` with correct password returns expected payload.
- [ ] Unit: `decryptKeyBackup` with wrong password throws.
- [ ] Unit: Corrupt file throws descriptive error.
- [ ] Unit: Round-trip: export -> import produces identical `StoredDeviceKeys`.
- [ ] Unit: Merge strategies (skip, replace) work correctly.
- [ ] Integration (web): Export downloads file, import reads it back.
- [ ] Integration (desktop): Export downloads file, import reads it back.
- [ ] Security: Exported file contains no plaintext key material.
- [ ] Security: Different exports of the same data produce different ciphertext.
- [ ] Security: HKDF domain separation produces distinct keys from same Argon2 output.
