# Desktop Device Key Storage (TEE + File) - Implementation Plan

Store device encryption keys on the desktop app using OS-level encryption (Electron safeStorage) persisted to the local filesystem, so keys survive cache clears and are protected by the OS keychain. Web continues to use IndexedDB.

**Goal:** On desktop, device keys are written to a file under `userData`, encrypted with Electron's safeStorage (macOS Keychain, Windows DPAPI, Linux libsecret). This avoids key loss from "clear cache" and raises the bar for local attackers.

**Dependencies:** Existing E2E device key flow (Phase 1 DM impl). No API changes.

---

## 1. Architecture Overview

### 1.1 Current State

- **Web:** `packages/ui/src/services/deviceKeyStorage.ts` stores device keys in IndexedDB (`adieuu-device-keys`). Keys are encrypted with a passphrase-derived wrapping key before storage. Clearing browser/origin storage wipes keys.
- **Desktop:** Same code path; Electron renderer uses IndexedDB (same as web). Desktop capabilities define `secureStorage` and `fileSystem` but both are placeholders (IndexedDB and stubs).

### 1.2 Target State

- **Web:** Unchanged. Continue using IndexedDB in `deviceKeyStorage.ts`.
- **Desktop:** Device keys stored in main process:
  1. Renderer produces the same **passphrase-encrypted** payload (existing `StoredDeviceKeys` shape).
  2. Payload is sent to main via IPC.
  3. Main encrypts that payload with `safeStorage.encryptString()` and writes the resulting buffer to a file in `app.getPath('userData')`, e.g. `device-keys.enc`.
  4. Read: main reads file, decrypts with `safeStorage.decryptString()`, returns payload to renderer.

So we get:

- **Durability:** File in userData is not cleared with browser cache.
- **TEE:** File contents are encrypted with OS keychain/DPAPI/libsecret; other processes cannot decrypt without the OS secret.
- **Passphrase:** Still required to use keys (unchanged); we only change *where* the encrypted blob lives.

### 1.3 Store Shape on Desktop

The existing `SecureStorage` interface is key-value: `getKey(keyId)`, `setKey(keyId, value)`, `deleteKey(keyId)`, `hasKey(keyId)`. There is no "list by prefix." To avoid changing the interface, we store the **entire device-keys store** under a single key:

- **keyId:** `adieuu-device-keys` (constant)
- **value:** UTF-8 JSON of `Record<identityId, StoredDeviceKeys[]>` (same as the logical IndexedDB content).

So one encrypted file per desktop app install holds all device keys for all identities. Every read/write is get/set of that single blob. Typical size is small (one or few identities, one or few devices each).

### 1.4 TEE When Available, Fallback Otherwise

We **always** use OS-level encryption (TEE) when the platform provides it: check `safeStorage.isEncryptionAvailable()` and use `safeStorage.encryptString`/`decryptString` for the file contents whenever it returns true. There is no user-facing option to disable TEE.

On some Linux setups `safeStorage.isEncryptionAvailable()` can be false (no secret service available). In that case only:

- Write the **passphrase-encrypted** payload to the same file path without OS encryption. Keys still survive cache clear; security is "encrypted file + passphrase" only. Document this in UI/settings if we ever expose it.

---

## 2. Code Changes by Area

### 2.1 Main Process (Electron)

**File:** `apps/desktop/src/main.ts` (and optionally a new module for IPC handlers, e.g. `apps/desktop/src/ipc/secureStorage.ts`).

**Add:**

1. **Imports:** `app`, `safeStorage` from `electron`; `fs.promises`, `path` for file I/O.

2. **Constants:**
   - `DEVICE_KEYS_FILENAME = 'device-keys.enc'`
   - `KEY_STORAGE_DIR = 'keys'` (subdir of userData)

3. **Path helper:** Resolve path to encrypted file: `path.join(app.getPath('userData'), KEY_STORAGE_DIR, DEVICE_KEYS_FILENAME)`. Ensure `keys` directory exists when writing.

4. **IPC handlers (main process only):**
   - `secure-storage:set(keyId, payloadBase64)`  
     - Decode base64 to Buffer.  
     - If `safeStorage.isEncryptionAvailable()`: encrypted = `safeStorage.encryptString(payloadBase64)` (or encrypt the Buffer by encoding to string first).  
     - Else: use payload as-is (still base64 or raw buffer).  
     - Write to the file path above (create dir if needed).  
     - For keyId we only use `adieuu-device-keys`; other keyIds can be ignored or stored in the same file under a simple key-value map if we want future reuse.
   - `secure-storage:get(keyId)`  
     - Read file; if missing, return null.  
     - If safeStorage available: decrypt with `safeStorage.decryptString(encryptedBuffer)`, return decrypted string (or base64) to renderer.  
     - Else: return file contents (passphrase-encrypted blob) to renderer.  
   - `secure-storage:delete(keyId)`  
     - Delete the file (or clear the in-file entry if we use a multi-key file). For single-file design: delete the file.  
   - `secure-storage:has(keyId)`  
     - Return true if the file exists and has size > 0.  
   - `secure-storage:isEncryptionAvailable`  
     - Return `safeStorage.isEncryptionAvailable()` so the renderer can choose fallback.

**Note:** Electron safeStorage works with strings. So we should serialize the payload to string (e.g. base64 or JSON) before `encryptString`, and after `decryptString` return that string to the renderer so it can decode to `Uint8Array` or parse JSON as needed. The existing `SecureStorage` interface uses `Uint8Array`; the desktop implementation can base64-encode before sending and decode in the renderer.

5. **File-system IPC (for optional future use and for fallback path):**
   - `file-system:read-local(path)`  
     - path is relative to userData. Read file, return contents as base64 (or ArrayBuffer) to renderer.  
   - `file-system:write-local(path, dataBase64)`  
     - path relative to userData; create dirs if needed; write decoded buffer.  
   - `file-system:delete-local(path)`  
     - Unlink file; return boolean success.  
   - `file-system:list-local(path)`  
     - List directory contents (relative to userData); return string[].

Register all handlers in `main.ts` (or in an imported `registerIpcHandlers()` from a dedicated module).

### 2.2 Preload

**File:** `apps/desktop/src/preload.ts`.

**Changes:**

- Extend the allowlist for `invoke` to include the new channels used by capabilities, for example:
  - `secure-storage:set`, `secure-storage:get`, `secure-storage:delete`, `secure-storage:has`, `secure-storage:isEncryptionAvailable`
  - `file-system:read-local`, `file-system:write-local`, `file-system:delete-local`, `file-system:list-local`

Keep the allowlist explicit (no wildcards) for security.

### 2.3 Desktop Capabilities

**File:** `apps/desktop/src/renderer/platform/capabilities.ts`.

**Changes:**

1. **secureStorage:** Replace the current IndexedDB implementation with IPC calls.
   - `getKey(keyId)`: invoke `secure-storage:get` with keyId. Decode returned string/base64 to `Uint8Array`. Return null if backend returns null/empty.
   - `setKey(keyId, key)`: encode key as base64, invoke `secure-storage:set` with keyId and base64.
   - `deleteKey(keyId)`: invoke `secure-storage:delete` with keyId.
   - `hasKey(keyId)`: invoke `secure-storage:has` with keyId.
   - Use `window.electron.invoke` (or the existing exposed IPC) for these. Ensure only the allowlisted channels are used.

2. **fileSystem (readLocalFile, writeLocalFile, deleteLocalFile, listLocalFiles):** Implement via the new file-system IPC. Paths are relative to userData; main resolves with `path.join(app.getPath('userData'), relativePath)`.

3. **Optional:** Expose `secure-storage:isEncryptionAvailable` so the app can show "encrypted with OS keychain" vs "encrypted with passphrase only" in diagnostics/settings.

### 2.4 Device Key Storage Abstraction (packages/ui)

**File:** `packages/ui/src/services/deviceKeyStorage.ts`.

**Goal:** Keep the same public API; on desktop, use platform secureStorage for the backing store instead of IndexedDB.

**Approach:** Introduce an optional storage backend that can be provided by the platform. When running on desktop with a backend that implements "full store" get/set, use it; otherwise use IndexedDB (web or desktop fallback).

**Option A (recommended):** Platform injects a "device key store" backend only on desktop.

- Add a module-level or context-driven backend: e.g. `setDeviceKeyStorageBackend(backend)` called from the desktop app entry when platform is desktop, or pass backend via a React context / dependency that `deviceKeyStorage` reads.
- Backend interface (minimal):  
  `getFullStore(): Promise<Record<string, StoredDeviceKeys[]>>`  
  `setFullStore(store: Record<string, StoredDeviceKeys[]>): Promise<void>`  
  `clear(): Promise<void>`
- In `deviceKeyStorage.ts`:
  - If backend is set (desktop): implement `getDeviceKeysForIdentity`, `getStoredDeviceKeys`, `storeDeviceKeys`, `deleteDeviceKeys`, `deleteAllDeviceKeysForIdentity`, `hasDeviceKeys`, `clearAllDeviceKeys` by reading/writing the full store via backend. Crypto (encrypt/decrypt with wrapping key) stays in the UI package; only persistence is delegated.
  - If backend is not set (web): keep current IndexedDB implementation unchanged.

**Option B:** Use existing `SecureStorage` from capabilities without a new backend type.

- In `deviceKeyStorage.ts`, accept an optional `secureStorage: SecureStorage | null` (or get it from a hook/context). When provided:
  - Use a single key `adieuu-device-keys`.
  - get: `secureStorage.getKey('adieuu-device-keys')` -> decode to UTF-8 string -> `JSON.parse` -> `Record<identityId, StoredDeviceKeys[]>`.
  - set: build the record, `JSON.stringify`, encode to Uint8Array, `secureStorage.setKey('adieuu-device-keys', data)`.
  - Implement all public functions by reading this record, modifying, and writing back (same as Option A but using existing SecureStorage interface).
- Callers must pass capabilities.secureStorage when platform is desktop. This requires `deviceKeyStorage` to be called from a place that has access to platform (e.g. useIdentity, which already has platform/config). So we could add an overload or a separate entry point like `createDeviceKeyStorage(capabilities)` that returns an object with the same function names, or we make the functions take an optional storage as last argument. Cleaner: inject storage at app init. So in the desktop app bootstrap, set a global or context "device key storage" implementation that uses capabilities.secureStorage under the hood with the single-blob convention.

**Recommended:** Option B using injection at app init. Add in `deviceKeyStorage.ts`:

- `setDeviceKeyStorageBackend(backend: DeviceKeyStorageBackend): void` where `DeviceKeyStorageBackend` has `getKey(id): Promise<Uint8Array | null>`, `setKey(id, data: Uint8Array): Promise<void>`, `deleteKey(id): Promise<void>`, `hasKey(id): Promise<boolean>`. That is exactly the existing `SecureStorage` interface. So we can do:
- `setDeviceKeyStorageBackend(secureStorage: SecureStorage | null)`. When non-null, use key `adieuu-device-keys` and the single-blob JSON format; when null, use IndexedDB.
- All existing functions branch on whether this backend is set; if set, they operate on the in-memory structure read/written via getKey/setKey.

**Concrete changes in deviceKeyStorage.ts:**

1. Add a variable: `let secureStorageBackend: SecureStorage | null = null`.
2. Export `setDeviceKeyStorageBackend(backend: SecureStorage | null): void`.
3. Add helpers: `async function getFullStore(): Promise<Record<string, StoredDeviceKeys[]>>` and `async function setFullStore(store): Promise<void>`. When backend is set: getKey('adieuu-device-keys'), parse JSON, return; setKey with JSON.stringify. When backend is null: use IndexedDB (current logic). For IndexedDB we don't have "full store" directly; we'd need to either keep the current IndexedDB implementation in the "backend null" branch (so getFullStore reads all from IndexedDB by scanning identity index, setFullStore writes each record). That could get messy. Simpler: when backend is set, **all** operations use the backend (single blob). When backend is null, **all** operations use IndexedDB. No mixing. So getFullStore/setFullStore are only used when backend is set; when backend is null we keep the current IndexedDB implementation per function.
4. In each exported function, at the top: if (secureStorageBackend) { ... use getFullStore/setFullStore and in-memory record; } else { ... current IndexedDB implementation. }
5. For getStoredDeviceKeys(deviceId) with backend: we don't have identityId. So we need to iterate the full store: for each identityId, for each record in store[identityId], if record.deviceId === deviceId return record. Same as current IndexedDB index lookup by deviceId (we'd need to scan in IndexedDB too if we had only identityId index; currently we have keyPath deviceId so get(deviceId) is direct. So with backend we scan. Fine for small data.)

**Types:** `SecureStorage` is in `packages/ui/src/config/types.ts`. Import it in deviceKeyStorage and use it for the backend type. The UI package must not depend on Electron; so the backend is an interface only. The desktop app, when it mounts, calls `setDeviceKeyStorageBackend(capabilities.secureStorage)` so the implementation of that interface is the one that does IPC.

### 2.5 Desktop App Bootstrap

**File:** `apps/desktop/src/renderer/main.tsx` (or wherever the root component and PlatformProvider are mounted).

- After platform is known to be desktop and capabilities are available (e.g. inside the same tree that has PlatformProvider), call `setDeviceKeyStorageBackend(capabilities.secureStorage)` once. So we need to get capabilities in a place that runs before any identity/login; typically the same place that passes capabilities to PlatformProvider. So: when creating the desktop app root, after desktopCapabilities is created, call `setDeviceKeyStorageBackend(desktopCapabilities.secureStorage)`. That way the first login or any device key access uses the TEE-backed storage.

### 2.6 Migration / First Run

- **First run on desktop after this change:** No migration. New logins will create keys in the new store. Existing desktop users who had keys in IndexedDB only: on next login, `hasDeviceKeys(identityId)` will look at the backend first (if set). Backend is empty, so we'd see "no keys" and go through new-device flow (generate new keys, register device, store in backend). So existing IndexedDB keys would be orphaned (old messages encrypted for old device would be unreadable on this "new" device). To avoid that we could run a one-time migration: if backend is set and backend has no data, try reading from IndexedDB and if we find keys, write them to the backend once, then clear IndexedDB. That way existing desktop users keep reading old DMs. Plan: add a small migration in deviceKeyStorage or in desktop bootstrap: when backend is set and backend.hasKey('adieuu-device-keys') is false, call a function that reads all keys from IndexedDB (using the current IndexedDB code path), builds the full store object, and writes it via backend.setKey. Then clear IndexedDB for device keys. So we need to expose a way to "read full store from IndexedDB" and "write full store to backend" once. Document this in the plan as a one-time migration step.

---

## 3. File Summary

| Area | File(s) | Change |
|------|---------|--------|
| Main | `apps/desktop/src/main.ts` | Register IPC handlers for secure-storage and file-system. Optionally move handlers to `apps/desktop/src/ipc/secureStorage.ts` and `fileSystem.ts`. |
| Preload | `apps/desktop/src/preload.ts` | Allow new IPC channels in invoke allowlist. |
| Capabilities | `apps/desktop/src/renderer/platform/capabilities.ts` | Implement secureStorage via IPC; implement readLocalFile, writeLocalFile, deleteLocalFile, listLocalFiles via IPC. |
| Device key storage | `packages/ui/src/services/deviceKeyStorage.ts` | Add optional SecureStorage backend; when set, use single-key blob for full store; when null, keep IndexedDB. Add one-time migration from IndexedDB to backend on desktop. |
| Bootstrap | `apps/desktop/src/renderer/main.tsx` (or equivalent) | Call setDeviceKeyStorageBackend(desktopCapabilities.secureStorage) after capabilities are available. Run migration if backend empty and IndexedDB has keys. |
| Config/types | `packages/ui/src/config/types.ts` | No change; SecureStorage already has getKey/setKey/deleteKey/hasKey. |

---

## 4. Implementation Phases

### Phase 1: Main + Preload + Capabilities (Desktop-only, no UI change)

1. Implement IPC in main: secure-storage get/set/delete/has + isEncryptionAvailable; file-system read/write/delete/list. Use single file for device keys: path `keys/device-keys.enc` under userData. Implement fallback when safeStorage.isEncryptionAvailable() is false (write passphrase-encrypted payload without OS encryption).
2. Update preload allowlist for these channels.
3. Update desktop capabilities to use IPC for secureStorage and for readLocalFile/writeLocalFile/deleteLocalFile/listLocalFiles.
4. Manual test: from renderer, call capabilities.secureStorage.setKey('adieuu-device-keys', someUint8Array), getKey, hasKey, deleteKey; verify file appears under userData and content is encrypted when safeStorage is available.

**Exit criteria:** Desktop app can read/write a single blob via capabilities.secureStorage; file persists and survives app restart; clearing "cache" (e.g. clearing IndexedDB) does not remove the file.

### Phase 2: Device Key Storage Backend (UI package)

1. Add SecureStorage-backed path in deviceKeyStorage.ts: setDeviceKeyStorageBackend(backend), single-key blob format Record<identityId, StoredDeviceKeys[]>, implement all public APIs by delegating to backend when set.
2. Keep IndexedDB path when backend is null (web and desktop fallback).
3. Add one-time migration: when backend is set and `backend.hasKey('adieuu-device-keys')` is false, read all keys from IndexedDB: open the existing device-keys DB, use object store `getAll()` (no key) to get all `StoredDeviceKeys` records, group by `identityId` into `Record<identityId, StoredDeviceKeys[]>`. If non-empty, encode as JSON, then `backend.setKey('adieuu-device-keys', new TextEncoder().encode(JSON.stringify(record)))`, then clear the IndexedDB keys store so we don't use it again. So migration: open IndexedDB, store.getAll(), build Record<identityId, StoredDeviceKeys[]>, if non-empty then backend.setKey('adieuu-device-keys', encode(JSON.stringify(record))), then clear IndexedDB keys store.
4. Unit tests: deviceKeyStorage tests currently run in browser with IndexedDB. Add tests that set a mock backend (in-memory getKey/setKey) and assert same behavior (store, get by identity, get by deviceId, delete, has, clear). Skip desktop-only backend tests in browser if needed, or run with mock.

**Exit criteria:** All existing deviceKeyStorage tests pass. New tests with mock backend pass. No behavior change on web.

### Phase 3: Desktop Bootstrap + Integration

1. In desktop renderer entry, after PlatformProvider (or wherever capabilities are available), call setDeviceKeyStorageBackend(capabilities.secureStorage).
2. Run migration (Phase 2 step 3) once when backend is set and backend is empty and IndexedDB has device keys.
3. Integration test: desktop app login (new device), verify keys file exists under userData; login again (existing device), verify keys loaded from file; clear IndexedDB from devtools, login again, verify keys still load (from file).

**Exit criteria:** Desktop app uses file-backed secure storage for device keys; keys survive IndexedDB clear; existing desktop users with IndexedDB keys get migrated once to file.

### Phase 4: Documentation + Edge Cases

1. Document in user-facing help or in-app: "Desktop app stores encryption keys in a secure file on your computer; clearing browser cache does not remove them."
2. If safeStorage.isEncryptionAvailable() is false, document (e.g. in settings or docs) that keys are still stored in a local file but protected only by your passphrase on this system.
3. Handle read/write errors (file permission, disk full): surface DeviceKeyStorageError with a clear message and suggest re-login or checking disk/permissions.

**Exit criteria:** Docs updated; error paths handled and tested.

---

## 5. Security Notes

- **Main process:** All key material (passphrase-encrypted blob) passes through the main process only as opaque buffers; main never has the passphrase. safeStorage encrypts/decrypts in process; the key is managed by the OS.
- **File location:** userData is app-specific and user-specific; not shared across apps. Restrict file permissions to current user if the OS allows (e.g. 0600 on Unix).
- **TEE:** We always use safeStorage (OS keychain/DPAPI/libsecret) when `safeStorage.isEncryptionAvailable()` is true; no user toggle. **Fallback (no TEE):** Only when safeStorage is unavailable (e.g. some Linux setups), the file contains only passphrase-encrypted data. An attacker with file access still needs the passphrase.
- **Web:** No change; web remains IndexedDB-only. No new attack surface on web.

---

## 6. Testing Checklist

- [ ] Unit: Main process IPC handlers (secure-storage get/set/delete/has) with a temp directory; safeStorage mock or skip on CI if unavailable.
- [ ] Unit: deviceKeyStorage with mock SecureStorage backend: store, getDeviceKeysForIdentity, getStoredDeviceKeys, hasDeviceKeys, deleteDeviceKeys, deleteAllDeviceKeysForIdentity, clearAllDeviceKeys.
- [ ] Unit: deviceKeyStorage with backend null (IndexedDB) unchanged behavior.
- [ ] Integration (desktop): Fresh install, login as new device, verify file created; login again, verify keys loaded from file.
- [ ] Integration (desktop): Clear IndexedDB, login again, verify keys still load (from file).
- [ ] Migration (desktop): Simulate existing IndexedDB keys, start app with backend set, verify migration copies keys to file and keys still load.
- [ ] Web: No regression; login and DM flow still use IndexedDB.

---

## 7. Phase 4 -- Resilience and UI Warnings

**Goal:** Make safeStorage operations resilient to runtime failures and surface
degraded key storage state to the user via an in-app warning banner.

### 7a. IPC Fallback (`apps/desktop/src/ipc/secureStorage.ts`)

- `secure-storage:set` now wraps `safeStorage.encryptString()` in try/catch.
  If encryption throws, the key is still written to disk with `tee: false`
  (passphrase-only protection) and the error is recorded in module-level state.
- `secure-storage:get` wraps `safeStorage.decryptString()` similarly.
  On failure it throws a descriptive error (cannot silently fall back on reads).
- New `secure-storage:status` channel returns `{ teeAvailable, teeFailed, lastError }`
  so the renderer can query storage health at any time.

### 7b. UI Warning Banner (`packages/ui/src/components/KeyStorageBanner.tsx`)

- `SecureStorage` interface gains optional `getStorageStatus(): Promise<StorageStatus | null>`.
  Web returns `null` (no status info); desktop calls the IPC status channel.
- `KeyStorageBanner` component queries storage status on mount.
  If TEE is unavailable or has failed, it renders a warning `Alert` banner
  at the top of every authenticated page (inside `ProtectedLayoutContent`).
- The banner is **dismissable once per session** (in-memory React state).
  Logging out and back in, or relaunching the app, resets the dismiss state.
- i18n keys: `identity.e2e.keyStorageWarning.teeUnavailable`,
  `identity.e2e.keyStorageWarning.teeFailed`, `identity.e2e.keyStorageWarning.dismiss`.

### 7c. Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/ipc/secureStorage.ts` | Try/catch around safeStorage calls; `status` IPC channel |
| `apps/desktop/src/preload.ts` | Expose `secureStorage.status()` to renderer |
| `apps/desktop/src/renderer/env.d.ts` | `status()` type declaration |
| `apps/desktop/src/renderer/platform/capabilities.ts` | `getStorageStatus()` implementation |
| `packages/ui/src/config/types.ts` | `StorageStatus` type; optional `getStorageStatus` on `SecureStorage` |
| `packages/ui/src/config/index.ts` | Re-export `StorageStatus` |
| `packages/ui/src/components/KeyStorageBanner.tsx` | New banner component |
| `packages/ui/src/app/App.tsx` | Render `KeyStorageBanner` in `ProtectedLayoutContent` |
| `packages/ui/src/styles.scss` | `.key-storage-banner` styles |
| `packages/ui/src/i18n/locales/en.ts` | Warning banner strings |
| `packages/ui/src/index.ts` | Export `KeyStorageBanner`, `StorageStatus` |

---

## 8. Future Work

- **Linux:** If safeStorage is often unavailable, consider prompting user to set up a secret service (e.g. GNOME Keyring) or document the fallback.
- **Backup/export:** Allow exporting an encrypted backup of device keys (e.g. for restore on another machine) using the same passphrase; out of scope for this plan.
- **Multiple key files:** If we later need to store more than one blob (e.g. per-identity files), we can extend the IPC to accept keyId as a path segment in the filename (e.g. `keys/device-keys-<hash(keyId)>.enc`) without changing the SecureStorage interface.
