# Local Key Storage

## Overview

Strategies for securely storing user private keys in the web application context. Unlike native platforms (desktop, mobile) where we have access to file systems, TEEs, or secure enclaves, web browsers present unique challenges for protecting cryptographic key material.

This document outlines available options, their security trade-offs, and recommended implementation approaches.

---

## The Web Security Challenge

| Platform | Key Storage Options | XSS Risk |
|----------|-------------------|----------|
| Desktop | Filesystem, OS keychain, TPM | N/A |
| Mobile | Keystore (Android), Keychain (iOS), TEE | N/A |
| Web | IndexedDB, Cookies, Web Crypto | High |

Web applications face a fundamental limitation: any JavaScript running on the page (including XSS payloads) can potentially access stored key material. The goal is to minimize both the attack surface and the impact of a successful XSS attack. In general, it's going to always be better to use a Desktop or Mobile app, since they have access to the filesystem and TEEs, which are not available on the web.

---

## 1. Web Crypto API with Non-Extractable Keys

**Security Level: High** - Closest thing to enclave protection on the web.

### How It Works

The Web Crypto API allows key generation with `extractable: false`. The key material exists only within the browser's crypto subsystem and can never be read by JavaScript - only used for cryptographic operations.

```typescript
// Generate a non-extractable key pair
const keyPair = await crypto.subtle.generateKey(
  {
    name: "ECDH",
    namedCurve: "P-256",
  },
  false, // extractable = false - key material NEVER exposed to JS
  ["deriveKey", "deriveBits"]
);

// For signing keys
const signingKeyPair = await crypto.subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256",
  },
  false,
  ["sign", "verify"]
);

// Store the CryptoKey object in IndexedDB
// Even XSS can't read the raw key bytes - only USE the key
const db = await openDB("adieuu-keys", 1);
await db.put("keys", keyPair.privateKey, "identity-private");
await db.put("keys", keyPair.publicKey, "identity-public");
```

### Using Stored Keys

```typescript
// Retrieve and use the key
const privateKey = await db.get("keys", "identity-private");

// Derive a shared secret (for E2E encryption)
const sharedSecret = await crypto.subtle.deriveBits(
  {
    name: "ECDH",
    public: recipientPublicKey,
  },
  privateKey,
  256
);

// Sign a message
const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  signingKey,
  messageBuffer
);
```

### Security Properties

| Property | Behavior |
|----------|----------|
| Key Extraction | Impossible - browser enforces at native level |
| XSS Key Theft | Cannot exfiltrate key bytes |
| XSS Key Use | Attacker CAN use key during active attack |
| Persistence | Survives browser restarts |
| Cross-Device | Not possible - keys are device-bound |
| Backup/Export | Not possible |

### Pros

- XSS attacks cannot steal key material (only use it during active exploitation)
- Native browser crypto implementation (fast, secure)
- Keys persist across sessions in IndexedDB

### Cons

- Keys are permanently device-bound
- Cannot be backed up or exported
- If browser storage is cleared, keys are lost forever
- No multi-device sync possible

---

## 2. Encrypted Keys in IndexedDB (Password-Protected)

**Security Level: Medium** - Portable but requires user password.

### How It Works

Generate extractable keys, then encrypt them with a key derived from a user password using PBKDF2 or similar KDF.

```typescript
// Convert password to key material
const passwordKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveKey"]
);

// Derive a wrapping key from the password
const salt = crypto.getRandomValues(new Uint8Array(16));
const wrappingKey = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt,
    iterations: 600000, // High iteration count for brute-force resistance
    hash: "SHA-256",
  },
  passwordKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["wrapKey", "unwrapKey"]
);

// Generate the actual identity keys (extractable for wrapping)
const identityKeyPair = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true, // extractable = true (so we can wrap it)
  ["deriveKey", "deriveBits"]
);

// Wrap (encrypt) the private key
const iv = crypto.getRandomValues(new Uint8Array(12));
const wrappedKey = await crypto.subtle.wrapKey(
  "pkcs8",
  identityKeyPair.privateKey,
  wrappingKey,
  { name: "AES-GCM", iv }
);

// Store wrapped key + metadata
await db.put("keys", {
  wrappedKey,
  salt,
  iv,
  algorithm: "ECDH",
  curve: "P-256",
}, "identity-wrapped");
```

### Unwrapping Keys

```typescript
async function unwrapPrivateKey(password: string): Promise<CryptoKey> {
  const stored = await db.get("keys", "identity-wrapped");
  
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: stored.salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["unwrapKey"]
  );
  
  // Unwrap as non-extractable for use
  return crypto.subtle.unwrapKey(
    "pkcs8",
    stored.wrappedKey,
    wrappingKey,
    { name: "AES-GCM", iv: stored.iv },
    { name: "ECDH", namedCurve: "P-256" },
    false, // Make non-extractable after unwrapping
    ["deriveKey", "deriveBits"]
  );
}
```

### Security Properties

| Property | Behavior |
|----------|----------|
| Key Extraction | Possible with password |
| XSS Key Theft | Can steal encrypted blob; needs password to decrypt |
| XSS Password Capture | Can intercept password if user enters during attack |
| Persistence | Survives browser restarts |
| Cross-Device | Yes, via encrypted backup |
| Backup/Export | Yes |

### Pros

- Keys can be exported/backed up for multi-device use
- Password brute-force is expensive (high PBKDF2 iterations)
- Encrypted blob is useless without password

### Cons

- XSS can intercept password entry
- Security depends on password strength
- User must remember additional password

---

## 3. WebAuthn PRF Extension

**Security Level: High** - Hardware-backed key derivation.

### How It Works

The WebAuthn PRF (Pseudo-Random Function) extension allows deriving a secret from a hardware authenticator. This secret can then be used to encrypt/decrypt stored keys.

```typescript
// Registration: Set up the credential with PRF support
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Adieuu", id: "adieuu.app" },
    user: {
      id: new TextEncoder().encode(userId),
      name: userEmail,
      displayName: userDisplayName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },  // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    extensions: {
      prf: {}, // Request PRF extension support
    },
  },
});

// Check if PRF is supported
const prfSupported = credential.getClientExtensionResults().prf?.enabled;
```

### Using PRF to Derive Encryption Key

```typescript
async function deriveKeyFromWebAuthn(): Promise<CryptoKey> {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: credentialId }],
      extensions: {
        prf: {
          eval: {
            first: new TextEncoder().encode("adieuu-key-encryption-v1"),
          },
        },
      },
    },
  });

  const prfOutput = assertion.getClientExtensionResults().prf?.results?.first;
  
  if (!prfOutput) {
    throw new Error("PRF extension not supported or failed");
  }

  // Import PRF output as key material
  return crypto.subtle.importKey(
    "raw",
    prfOutput,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );
}
```

### Full Flow

```typescript
// Store encrypted private key
async function storeKeyWithWebAuthn(privateKey: CryptoKey): Promise<void> {
  const wrappingKey = await deriveKeyFromWebAuthn();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const wrappedKey = await crypto.subtle.wrapKey(
    "pkcs8",
    privateKey,
    wrappingKey,
    { name: "AES-GCM", iv }
  );
  
  await db.put("keys", { wrappedKey, iv }, "identity-webauthn-wrapped");
}

// Retrieve and unwrap
async function retrieveKeyWithWebAuthn(): Promise<CryptoKey> {
  const stored = await db.get("keys", "identity-webauthn-wrapped");
  const wrappingKey = await deriveKeyFromWebAuthn();
  
  return crypto.subtle.unwrapKey(
    "pkcs8",
    stored.wrappedKey,
    wrappingKey,
    { name: "AES-GCM", iv: stored.iv },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );
}
```

### Security Properties

| Property | Behavior |
|----------|----------|
| Key Extraction | Only with authenticator present |
| XSS Key Theft | Cannot - requires physical authenticator interaction |
| Hardware Bound | Yes - requires same authenticator |
| Persistence | Survives browser restarts |
| Cross-Device | Possible with roaming authenticators (e.g., YubiKey) |

### Browser Support

| Browser | PRF Support |
|---------|-------------|
| Chrome | 116+ |
| Safari | 17+ |
| Firefox | Not yet (as of early 2026) |
| Edge | 116+ (Chromium) |

### Pros

- Hardware-backed security
- No password to remember
- XSS cannot obtain key material without physical authenticator

### Cons

- Browser support still limited
- Requires WebAuthn-capable authenticator
- Firefox users excluded (for now)
- PRF extension is relatively new

---

## 4. File-Based Import Each Session

**Security Level: Very High** - No persistent web storage.

### How It Works

User imports their key file from local filesystem at the start of each session. Keys only exist in memory.

```typescript
// File picker for key import
async function importKeyFromFile(): Promise<CryptoKey> {
  const [fileHandle] = await window.showOpenFilePicker({
    types: [{
      description: "Adieuu Key File",
      accept: { "application/octet-stream": [".chadkey"] },
    }],
  });
  
  const file = await fileHandle.getFile();
  const encryptedKeyData = await file.arrayBuffer();
  
  // Prompt for password to decrypt the key file
  const password = await promptForPassword();
  
  // Decrypt and import
  return decryptAndImportKey(encryptedKeyData, password);
}

// On page unload, clear keys from memory
window.addEventListener("beforeunload", () => {
  // Clear any in-memory key references
  clearKeyCache();
});
```

### Security Properties

| Property | Behavior |
|----------|----------|
| Key Extraction | Only from local file |
| XSS Key Theft | Can access in-memory key during session only |
| Persistence | None - must reimport each session |
| Cross-Device | Yes - user manages key file |

### Pros

- Minimal attack surface
- No persistent storage to compromise
- User has full control over key file

### Cons

- Terrible UX - import required every session
- File can be lost if not backed up
- Mobile web support is limited

---

## 5. Recommended Hybrid Approach

Combine multiple strategies for optimal security and UX.

### Implementation Strategy

```
+------------------+
|  Key Generation  |
+--------+---------+
         |
         v
+--------+---------+     +-------------------+
| Non-extractable  |---->| IndexedDB Storage |
| CryptoKey        |     | (daily use)       |
+--------+---------+     +-------------------+
         |
         v
+--------+---------+     +-------------------+
| Extractable      |---->| Encrypted Backup  |
| Copy for Backup  |     | File Download     |
+--------+---------+     +-------------------+
```

### Key Generation Flow

```typescript
interface KeyBundle {
  identity: CryptoKeyPair;        // Non-extractable, stored in IDB
  backupBlob: ArrayBuffer;        // Encrypted export for user download
  publicKeyExport: ArrayBuffer;   // For server registration
}

async function generateKeyBundle(backupPassword: string): Promise<KeyBundle> {
  // 1. Generate extractable keys first (for backup)
  const extractableKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  
  // 2. Export public key for server
  const publicKeyExport = await crypto.subtle.exportKey(
    "spki",
    extractableKeys.publicKey
  );
  
  // 3. Create encrypted backup
  const backupBlob = await createEncryptedBackup(
    extractableKeys.privateKey,
    backupPassword
  );
  
  // 4. Re-import as non-extractable for daily use
  const privateKeyBytes = await crypto.subtle.exportKey(
    "pkcs8",
    extractableKeys.privateKey
  );
  
  const nonExtractablePrivate = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false, // Non-extractable
    ["deriveKey", "deriveBits"]
  );
  
  // 5. Store non-extractable key in IndexedDB
  await storeKeyInIndexedDB(nonExtractablePrivate);
  
  return {
    identity: {
      privateKey: nonExtractablePrivate,
      publicKey: extractableKeys.publicKey,
    },
    backupBlob,
    publicKeyExport,
  };
}
```

### Backup File Creation

```typescript
async function createEncryptedBackup(
  privateKey: CryptoKey,
  password: string
): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  
  const wrappedKey = await crypto.subtle.wrapKey(
    "pkcs8",
    privateKey,
    wrappingKey,
    { name: "AES-GCM", iv }
  );
  
  // Create backup file format
  // [version (1 byte)] [salt (16 bytes)] [iv (12 bytes)] [wrapped key]
  const backup = new Uint8Array(1 + 16 + 12 + wrappedKey.byteLength);
  backup[0] = 0x01; // Version 1
  backup.set(salt, 1);
  backup.set(iv, 17);
  backup.set(new Uint8Array(wrappedKey), 29);
  
  return backup.buffer;
}

function downloadBackupFile(blob: ArrayBuffer, filename: string): void {
  const url = URL.createObjectURL(new Blob([blob]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### User Flow

1. **First Time Setup**
   - Generate keys
   - Show backup passphrase (or let user choose)
   - Force download of encrypted backup file
   - Store non-extractable key in IndexedDB

2. **Returning User (Same Device/Browser)**
   - Load non-extractable key from IndexedDB
   - If IndexedDB is cleared, prompt for backup import

3. **New Device/Browser**
   - Import backup file
   - Enter backup passphrase
   - Store as non-extractable in IndexedDB

---

## 6. Security Comparison Matrix

| Approach | XSS Key Theft | Multi-Device | UX | Browser Support |
|----------|--------------|--------------|-----|-----------------|
| Non-extractable (IDB) | No | No | Good | Excellent |
| Password-wrapped | With password | Yes | Medium | Excellent |
| WebAuthn PRF | No | Limited | Good | Limited |
| File import | During session | Yes | Poor | Good |
| Hybrid | No (daily) | Yes (backup) | Good | Excellent |

---

## 7. Implementation Recommendations

### For Adieuu Web App

1. **Primary Storage**: Non-extractable keys in IndexedDB
   - Best XSS protection for daily use
   - Keys cannot be exfiltrated

2. **Mandatory Backup**: Encrypted backup file on key generation
   - User downloads `.chadkey` file
   - Protected by strong passphrase (show once, user writes down)
   - Required before allowing app use

3. **Recovery Flow**: Import from backup file
   - Triggered when IndexedDB keys are missing
   - User provides backup file + passphrase

4. **Future Enhancement**: WebAuthn PRF when browser support improves
   - Offer as optional upgrade for supported browsers
   - Hardware-backed key protection

### Security Warnings to Display

```typescript
const SECURITY_WARNINGS = {
  backupRequired: `
    Your encryption keys protect your private messages.
    Download and securely store your backup file.
    Without this backup, you cannot recover your messages on a new device.
  `,
  
  noBackup: `
    You have not downloaded your key backup.
    If you clear browser data or switch devices, your messages will be unrecoverable.
  `,
  
  publicComputer: `
    Do not use Adieuu on shared or public computers.
    Your encryption keys would be stored in this browser.
  `,
};
```

---

## 8. Future Considerations

- [ ] Investigate Origin-bound keys proposal
- [ ] Monitor WebAuthn PRF browser adoption
- [ ] Consider linked-device model (web subordinate to mobile app)
- [ ] Evaluate hardware wallet integration for power users
- [ ] Research upcoming Web Incubator CG proposals for key storage
