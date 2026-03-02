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
| Export file stolen at rest | Outer encryption with a user-chosen export password (Argon2id + AES-GCM). Inner key material is also passphrase-encrypted. |
| Export password brute-forced | High Argon2id cost params (same or higher than identity passphrase derivation). |
| User forgets export password | We cannot recover. UX must emphasise this clearly. |
| Attacker intercepts export file in transit | File is encrypted; no plaintext ever leaves the device. |
| Imported keys for wrong identity overwrite real keys | Import validates identity ID matches and uses merge-or-skip semantics (never silent overwrite). |
| Export file tampered with | AES-GCM provides authenticated encryption; tampered data fails to decrypt. |

---

## 3. Export File Format

```
Adieuu Key Backup v1 (binary)
-------------------------------------------------------
Header (JSON, UTF-8, length-prefixed):
  {
    "v": 1,
    "format": "adieuu-key-backup",
    "createdAt": "ISO-8601",
    "identityCount": <number>,
    "kdf": {
      "algorithm": "argon2id",
      "timeCost": 3,
      "memoryCost": 65536,
      "parallelism": 1,
      "salt": "<base64, 16 bytes>"
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
    "identities": [
      {
        "identityId": "<id>",
        "devices": [
          {
            "deviceId": "<id>",
            "ecdhPrivateKeyEncrypted": { "ciphertext": "...", "nonce": "..." },
            "kemPrivateKeyEncrypted": { "ciphertext": "...", "nonce": "..." },
            "createdAt": "ISO-8601"
          },
          ...
        ]
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

Note: the encrypted payload contains `StoredDeviceKeys` records. The private
keys within those records are **already** encrypted with the identity
passphrase-derived wrapping key (Argon2id + AES-GCM). The outer export
encryption is an independent layer. To actually use the keys after import, the
user still needs their identity passphrase.

---

## 4. Export Flow

### 4a. UI (Settings > Security or Identity > Devices)

1. User clicks "Export Key Backup".
2. Modal prompts: "Choose an export password to protect this backup."
   - Password field + confirmation field.
   - Minimum length: 12 characters.
   - Prominent warning: "If you forget this password, the backup cannot be recovered."
3. User can choose which identities to include (default: all).
4. On submit:
   a. Derive encryption key from export password via Argon2id.
   b. Collect all `StoredDeviceKeys` for selected identities.
   c. Serialize to JSON, encrypt with AES-256-GCM.
   d. Build the binary file (header + ciphertext).
   e. Trigger a file download / native save dialog.
5. Success toast: "Key backup exported successfully."

### 4b. Platform Differences

| | Desktop | Web |
|---|---------|-----|
| Save method | Native save dialog (`dialog.showSaveDialog` via IPC) | Browser download (`Blob` + anchor click) |
| Default filename | `adieuu-keys-YYYY-MM-DD.adieuu-keys` | Same |
| Key source | Per-identity secure files | IndexedDB |

---

## 5. Import Flow

### 5a. UI (Settings > Security or Identity > Devices)

1. User clicks "Import Key Backup".
2. File picker opens (accepts `.adieuu-keys`).
3. Modal prompts: "Enter the export password used when creating this backup."
4. On submit:
   a. Read file, parse header.
   b. Validate `format === 'adieuu-key-backup'` and `v === 1`.
   c. Derive decryption key from password + header KDF params.
   d. Decrypt payload with AES-256-GCM.
   e. Parse decrypted JSON.
   f. For each identity:
      - If keys for this identity already exist locally, show a merge
        confirmation: "Keys for identity X already exist on this device.
        Skip / Merge (add missing devices) / Replace."
      - If no local keys, import directly.
   g. Store imported keys via `storeDeviceKeys` (passthrough -- the inner
      encryption is preserved, so no re-encryption is needed).
5. Success toast: "Imported N device key(s) for M identity/identities."

### 5b. Error Handling

| Error | User-facing message |
|-------|---------------------|
| Wrong password | "Incorrect export password. The backup could not be decrypted." |
| Corrupt file | "The backup file is damaged or not a valid Adieuu key backup." |
| Unsupported version | "This backup was created with a newer version of Adieuu. Please update." |
| No keys in file | "The backup file contains no device keys." |

---

## 6. Security Considerations

- **Double encryption:** Inner (identity passphrase) + outer (export password).
  An attacker needs both passwords to access raw private keys.
- **No plaintext on disk:** Export file is always encrypted. The decrypted
  payload exists only in memory during import.
- **Memory cleanup:** After import, clear any decrypted key material from
  memory using `clearBytes()`.
- **Export password strength:** Enforce minimum 12 characters. Consider
  showing a strength meter.
- **No server involvement:** Export/import is entirely local. No key material
  is transmitted over the network.
- **Replay protection:** Each export has a unique salt and nonce. Identical
  exports produce different ciphertext.
- **Identity binding:** Each key record includes `identityId`. Import
  validates that records belong to an identity the user controls. If the user
  has never logged into that identity on this device, import still works (the
  keys are stored, but remain unusable until the user logs into that identity
  and provides the correct passphrase).

---

## 7. Implementation Plan

### Phase 1: Export Service

**New file:** `packages/ui/src/services/keyBackupService.ts`

```
exportKeyBackup(
  identityIds: string[],
  exportPassword: string,
): Promise<Uint8Array>
```

- Reads `StoredDeviceKeys` for each identity.
- Derives export key via Argon2id (from `@adieuu/crypto`).
- Encrypts with AES-256-GCM.
- Returns the binary `.adieuu-keys` blob.

### Phase 2: Import Service

```
parseKeyBackupHeader(
  data: Uint8Array,
): KeyBackupHeader

importKeyBackup(
  data: Uint8Array,
  exportPassword: string,
): Promise<KeyBackupPayload>
```

- Parses header, derives key, decrypts, validates.
- Returns parsed identities + devices for the UI to confirm merge semantics.

```
applyKeyBackupImport(
  payload: KeyBackupPayload,
  mergeStrategy: Record<string, 'skip' | 'merge' | 'replace'>,
): Promise<{ imported: number; skipped: number }>
```

- Applies the import based on user-chosen merge strategy per identity.

### Phase 3: UI Components

- `ExportKeyBackupModal` -- password input, identity selector, progress.
- `ImportKeyBackupModal` -- file picker, password input, merge confirmation.
- Buttons in Identity > Devices page (both web and desktop).
- i18n strings for all prompts, errors, and confirmations.

### Phase 4: Desktop Enhancements

- Native save/open dialog IPC (use existing `fileSystem.pickFile` /
  `fileSystem.saveFile` from capabilities).
- Consider auto-prompting export after first key generation on desktop.

---

## 8. UX Notes

- Export/import should be available on **both web and desktop** since web
  users are most at risk of key loss (cache clear).
- The export modal should strongly recommend storing the backup file in a
  safe location (password manager, encrypted drive, etc.).
- Import should be non-destructive by default (skip existing, merge new
  devices) to prevent accidental data loss.
- Consider periodic reminder to export if the user has never exported
  (e.g., after 7 days of having keys, show a one-time prompt).

---

## 9. Testing Checklist

- [ ] Unit: `exportKeyBackup` produces valid binary with correct header.
- [ ] Unit: `importKeyBackup` with correct password returns expected payload.
- [ ] Unit: `importKeyBackup` with wrong password throws.
- [ ] Unit: Corrupt file throws descriptive error.
- [ ] Unit: Round-trip: export -> import produces identical `StoredDeviceKeys`.
- [ ] Unit: Merge strategies (skip, merge, replace) work correctly.
- [ ] Integration (web): Export downloads file, import reads it back.
- [ ] Integration (desktop): Export uses native save dialog, import uses
  native open dialog.
- [ ] Security: Exported file contains no plaintext key material.
- [ ] Security: Different exports of the same data produce different ciphertext.
