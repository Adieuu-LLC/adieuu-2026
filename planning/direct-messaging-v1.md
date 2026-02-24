This document is a subset of our e2e-chat-architecture.md document. It captures the architectural decisions more specifically for the v1 Direct Messaging system in Adieuu. It's worth emphasisizing that engagement is always among Identities, never between the underlying Users (which is to say that Users are cryptographically separated from their Identities).

**Core Principles:**
- User and Identity remain cryptographically separate
- Server never sees plaintext messages or private keys
- Multi-device support without complex sync protocols
- Post-quantum resistance via hybrid encryption

---

## 1. Cryptographic Primitives

### 1.1 Algorithms

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| Key Agreement (Classical) | X25519 | Fast ECDH, 32-byte keys |
| Key Agreement (PQC) | ML-KEM-768 | NIST standardized, ~1KB ciphertexts |
| Signing | Ed25519 | Fast signatures, 64 bytes |
| Symmetric Encryption | ChaCha20-Poly1305 | AEAD, 256-bit keys |
| Key Derivation | HKDF-SHA3-256 | Post-quantum friendly |
| Password KDF | Argon2id | Memory-hard, for key wrapping |

### 1.1.1 CNSA Suite 2.0 Profile (Optional)

For users or deployments requiring NSA CNSA Suite 2.0 compliance (e.g., government/defense contractors), an alternative algorithm profile is available:

| Purpose | Default Profile | CNSA 2.0 Profile | Notes |
|---------|-----------------|------------------|-------|
| Key Agreement (Classical) | X25519 | X25519 | Hybrid; classical layer |
| Key Agreement (PQC) | ML-KEM-768 | ML-KEM-1024 | ~1.5KB ciphertexts |
| Signing | Ed25519 | ML-DSA-87 | ~4.6KB signatures |
| Symmetric Encryption | ChaCha20-Poly1305 | AES-256-GCM | AEAD, 256-bit keys |
| Hashing / KDF | HKDF-SHA3-256 | HKDF-SHA-384 | SHA-2 family required |
| Password KDF | Argon2id | Argon2id | Not specified by CNSA |

**CNSA 2.0 Trade-offs:**
- **Larger signatures**: ML-DSA-87 signatures are ~4.6KB vs Ed25519's 64 bytes (~72x larger)
- **Larger KEM ciphertexts**: ML-KEM-1024 is ~1568 bytes vs ML-KEM-768's ~1088 bytes
- **Higher compute**: AES-256 may be slower on devices without AES-NI hardware acceleration
- **Future-proof**: Full post-quantum resistance including signatures

**Implementation Approach:**
```typescript
type CryptoProfile = 'default' | 'cnsa2';

interface CryptoProfileConfig {
  kem: 'ML-KEM-768' | 'ML-KEM-1024';
  signature: 'Ed25519' | 'ML-DSA-87';
  symmetric: 'ChaCha20-Poly1305' | 'AES-256-GCM';
  kdf: 'HKDF-SHA3-256' | 'HKDF-SHA-384';
}

const PROFILES: Record<CryptoProfile, CryptoProfileConfig> = {
  default: {
    kem: 'ML-KEM-768',
    signature: 'Ed25519',
    symmetric: 'ChaCha20-Poly1305',
    kdf: 'HKDF-SHA3-256',
  },
  cnsa2: {
    kem: 'ML-KEM-1024',
    signature: 'ML-DSA-87',
    symmetric: 'AES-256-GCM',
    kdf: 'HKDF-SHA-384',
  },
};
```

**Profile Selection:**
- Per-Identity setting (stored with identity metadata)
- DMs negotiate profile at conversation start (see 1.1.2)
- Messages include profile indicator for decryption routing
- Balanced profile recommended for consumer use (smaller payloads, faster)
- CNSA 2.0 profile for regulated/enterprise deployments

**Note:** Disclaimer to Adieuu Users: CNSA 2.0 compliance requires third-party validation (CAVP/CMVP/NIAP), which Adieuu does not presently have but may seek to attain later. We wanted to go ahead and ensure our architecture allows for CNSA 2.0 on the technical side, and we'll handle the red tape later.

### 1.1.2 Profile Negotiation in DMs

DM conversations require both parties to agree on a single crypto profile. Each Identity stores their preferred profile, but the active profile for a conversation is negotiated.

**Conversation Initiation:**
When Identity A initiates a DM with Identity B and their preferred profiles differ:

1. Initiator is notified of the profile mismatch
2. Initiator chooses one of:
   - **Adopt recipient's profile**: Conversation uses recipient's preferred profile
   - **Request recipient adopt**: Sends a profile change request to recipient

If profiles match, the conversation proceeds with no negotiation required.

**Mid-Conversation Profile Changes:**
Either party may request a profile change at any time:

1. Requester proposes new profile
2. Other party must explicitly accept
3. Upon acceptance, conversation switches to new profile
4. **Important**: Previous message history becomes unreadable (old messages were encrypted with keys derived under the previous profile)

**Storage Model:**
```
Identity:
  preferredCryptoProfile: CryptoProfile  // User's default preference

Conversation:
  activeCryptoProfile: CryptoProfile     // Negotiated profile for this DM
  profileHistory: [{                     // Audit trail
    profile: CryptoProfile,
    changedAt: Date,
    initiatedBy: IdentityId
  }]
```

**Rationale:**
- Respects each Identity's security preferences
- Explicit consent required for any profile used
- Profile changes are deliberate actions with clear consequences
- Audit trail supports transparency and debugging


### 1.2 Hybrid Encryption Flow

Messages use hybrid encryption combining classical and post-quantum algorithms:

```
SENDER encrypts message to RECIPIENT:

1. Generate random session key (32 bytes)
   sessionKey = random()

2. Encrypt message content (done ONCE)
   ciphertext = ChaCha20-Poly1305(sessionKey, nonce, plaintext)

3. For EACH device (sender + recipient devices):
   a. X25519: ecdh_shared = X25519(ephemeral_private, device.ecdhPublic)
   b. ML-KEM: (kem_shared, kem_ct) = ML-KEM.Encapsulate(device.kemPublic)
   c. Derive: wrapping_key = HKDF-SHA3-256(ecdh_shared || kem_shared)
   d. Wrap: wrapped_key = AES-GCM(wrapping_key, sessionKey)

4. Sign everything (Ed25519 internally hashes, no external pre-hash needed)
   signature = Ed25519.Sign(senderSigningKey, ciphertext || wrappedKeys)

5. Send: { ciphertext, nonce, wrappedKeys[], ephemeralPublicKeys, kemCiphertexts, signature }
```

### 1.3 Why Hybrid?
- **X25519 alone**: Likely vulnerable to future quantum or otherwise unknown attacks
- **ML-KEM alone**: Relatively new, potential undiscovered weaknesses
- **Hybrid**: Secure if EITHER algorithm remains unbroken

## 2. Key Hierarchy

### 2.1 Identity and Device Keys

Each Identity has a signing key for authentication, plus per-device encryption keys:

```
Identity (@alice)
├── Identity Signing Key (Ed25519)
│   └── Signs messages, proves sender authenticity
│   └── Shared across all devices (from encrypted bundle)
│
└── Devices[]
    ├── Device 1
    │   ├── ECDH Key (X25519) - key agreement
    │   └── KEM Key (ML-KEM-768) - post-quantum encapsulation
    ├── Device 2
    │   ├── ECDH Key (X25519)
    │   └── KEM Key (ML-KEM-768)
    └── ...
```

**Why per-device encryption keys?**
- Enables decryption on any device without key synchronization
- Device compromise only exposes that device's encryption keys
- Signing key remains identity-level for consistent sender authentication

**Device Registration:**
1. User logs into new device with identity passphrase
2. Device generates its own ECDH/KEM key pair locally
3. Device registers its public keys with the server
4. Private keys stored locally (IndexedDB, non-extractable)

### 2.2 Key Storage

**Server-Side (Signing Key Bundle):**
```
EncryptedKeyBundle collection:
  bundleId: SHA3-256(identity._id || "adieuu-key-bundle-v1")  // Obfuscated
  encryptedBundle: AES-GCM(key, signingPrivateKey)
  salt: Uint8Array(16)
  nonce: Uint8Array(12)
  useSeparatePassphrase: boolean
  createdAt, updatedAt
```

The `bundleId` is derived from the identity ID, not stored directly. This obfuscates bundle ownership - an attacker with DB access cannot trivially link bundles to identities.

**Passphrase Options:**
- **Default**: `key = Argon2id(identity_passphrase, salt)`
- **Advanced** (opt-in): `key = Argon2id(separate_bundle_passphrase, salt)`

Users may opt-in to a separate bundle passphrase during identity creation ("Use additional passphrase for encryption keys" checkbox). With separate passphrases, compromising the identity passphrase alone does not expose the signing key.

**Client-Side (Device Keys):**
```
IndexedDB:
  - Device ECDH private key (non-extractable CryptoKey)
  - Device KEM private key (non-extractable CryptoKey)
  - Cached signing key (non-extractable, decrypted from bundle)
```

**Properties:**
- New device login: Enter passphrase(s) → decrypt signing key → generate device encryption keys → register device
- No QR scanning required
- Device keys never leave the device
- Risk: Offline brute-force if database leaked (mitigated by strong passphrase + high KDF cost)

### 2.3 Identity Storage Model

```typescript
interface IdentityDocument {
  _id: ObjectId;
  ident: string;                    // Existing: derived identity hash
  username: string;
  displayName: string;
  // ... existing profile fields ...

  preferredCryptoProfile: CryptoProfile;  // 'default' | 'cnsa2'
  
  signingPublicKey: string;         // Ed25519 public key (base64)
  
  devices: [{
    deviceId: string;               // Unique device identifier
    name: string;                   // User-friendly name ("iPhone", "Work Laptop")
    ecdhPublicKey: string;          // X25519 public key (base64)
    kemPublicKey: string;           // ML-KEM public key (base64)
    registeredAt: Date;
    lastActiveAt: Date;
  }];
}
```

When sending a message to an identity, the sender fetches all device public keys and wraps the session key for each.


## 3. Direct Messages (DMs)

### 3.1 Encryption Model: Per-Message Session Key 

Each message gets a fresh random session key:

```
Alice (2 devices) → Bob (3 devices)

1. sessionKey = random(32 bytes)

2. ciphertext = encrypt(sessionKey, "Hello Bob!")

3. wrappedKeys = [
     wrap(sessionKey, alice.device1.pub),  // Alice can read on all devices
     wrap(sessionKey, alice.device2.pub),
     wrap(sessionKey, bob.device1.pub),    // Bob can read on all devices
     wrap(sessionKey, bob.device2.pub),
     wrap(sessionKey, bob.device3.pub),
   ]

4. signature = sign(alice.signingKey, ciphertext || wrappedKeys)

### 3.2 Multi-Device Behavior
- Sender's other devices CAN read sent messages (included in wrappedKeys)
- Recipient's all devices CAN read received messages
- No sync protocol needed - server delivers to all devices

### 3.3 Message Metadata and Features

**Message Storage Model:**
```typescript
interface EncryptedMessage {
  _id: ObjectId;
  conversationId: ObjectId;
  fromIdentityId: ObjectId;
  fromDeviceId: string;
  
  // Encrypted payload
  ciphertext: string;           // Base64
  nonce: string;                // Base64
  wrappedKeys: WrappedKey[];
  signature: string;            // Base64
  cryptoProfile: CryptoProfile;
  
  // Metadata (server-managed)
  createdAt: Date;
  expiresAt?: Date;             // Optional TTL
  clientMessageId: string;      // Deduplication
  replyToId?: ObjectId;         // Threading
  
  // Deletion tracking
  deletedForEveryone: boolean;
  deletedFor: ObjectId[];       // Identities who deleted for self
}
```

**Ordering:** Eventual consistency with server timestamps (see e2e-chat-architecture.md section 10.8).

**Persistence:**
- Default: No expiration
- Optional: Sender-specified TTL via `expiresAt`
- Server purges expired messages

**Deletion:**
- **Sender**: Can delete for everyone (`deletedForEveryone = true`)
- **Recipient**: Can delete for self (added to `deletedFor[]`)
- Deleted messages return tombstone to clients, not full payload

### 3.4 Reactions

Reactions are encrypted mini-messages referencing the original:

```typescript
interface EncryptedReaction {
  _id: ObjectId;
  messageId: ObjectId;          // Message being reacted to
  conversationId: ObjectId;
  fromIdentityId: ObjectId;
  
  // Encrypted payload (contains emoji/reaction type)
  ciphertext: string;
  nonce: string;
  wrappedKeys: WrappedKey[];
  signature: string;
  
  createdAt: Date;
}
```

**Flow:**
1. Reactor encrypts reaction (emoji) with fresh session key
2. Wrap session key for all devices (both participants)
3. Sign with reactor's identity signing key
4. Store as separate record linked to original message

**Why encrypt reactions?**
- Reactions reveal sentiment about specific messages
- Unencrypted reactions would leak partial conversation context
- Consistent security model across all content

### 3.5 Message Editing (Post-MVP)

Editing requires re-encryption with fresh keys:

```
EDIT FLOW:
1. Generate new session key
2. Encrypt edited content
3. Wrap for all devices (sender + recipient)
4. Sign with identity signing key
5. Store as edit record linked to original

STORAGE:
  Original message remains (with editedAt timestamp)
  Edit stored as child record with:
    - parentMessageId
    - version number
    - full encrypted payload
  
UI:
  Show latest version with "edited" indicator
  Optional: expand to see edit history
```

**Deferred because:**
- Adds versioning complexity
- Edge cases with deletion + edit races
- Profile change during edit history

### 3.6 Deferred Features

| Feature | Status | Notes |
|---------|--------|-------|
| Delivery receipts | Post-MVP | Server confirms delivery to device |
| Read receipts | Post-MVP | Client confirms message viewed |
| Typing indicators | Post-MVP | Real-time presence |

## 4. User Identity-Level Options/Customization
These options should all be available and stored per-Identity
- User can choose their preferred cryptographic profile (balanced or CNSA 2.0; balanced is default and the only option for now)
- User can choose their preferred key storage options (balanced or maximum security; balanced is default and the only option for now)
