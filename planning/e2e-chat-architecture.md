# E2E Encrypted Chat Architecture

## Overview

This document captures the architectural decisions for end-to-end encrypted messaging between Identities in Adieuu. It's worth emphasisizing that engagement is always among Identities, never between the underlying Users (which is to say that Users are cryptographically separated from their Identities). This design modernizes the legacy ChadderJS approach with post-quantum cryptography and improved key management.

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
- Conversations/Spaces negotiate to the highest common profile
- Messages include profile indicator for decryption routing
- Default profile recommended for consumer use (smaller payloads, faster)
- CNSA 2.0 profile for regulated/enterprise deployments

**Note:** CNSA 2.0 compliance requires third-party validation (CAVP/CMVP/NIAP), not self-declaration. Using CNSA 2.0 algorithms does not automatically confer compliance—formal validation processes apply for NSS deployments.

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

4. Sign everything
   signature = Ed25519.Sign(senderSigningKey, hash(ciphertext || wrappedKeys))

5. Send: { ciphertext, nonce, wrappedKeys[], ephemeralPublicKeys, kemCiphertexts, signature }
```

### 1.3 Why Hybrid?

- **X25519 alone**: Vulnerable to future quantum computers
- **ML-KEM alone**: Relatively new, potential undiscovered weaknesses
- **Hybrid**: Secure if EITHER algorithm remains unbroken

---

## 2. Key Hierarchy

### 2.1 Identity Keys

Each Identity has a single set of keys shared across all their devices:

```
Identity (@alice)
├── Identity Signing Key (Ed25519)
│   └── Signs messages, proves sender authenticity
├── Identity ECDH Key (X25519)
│   └── Used for key agreement in encryption
└── Identity KEM Key (ML-KEM-768)
    └── Post-quantum key encapsulation
```

### 2.2 Key Storage Options

Users can choose their security/convenience trade-off:

#### Option A: Balanced (Default)

```
Server stores:
  encrypted_key_bundle = AES-GCM(
    key: Argon2id(identity_passphrase, salt, iterations=600000),
    plaintext: identity_private_keys
  )

Client stores:
  - Decrypted keys as non-extractable CryptoKey objects (IndexedDB)
  - ML-KEM private key encrypted at rest with derived key
```

**Properties:**
- New device login: Enter passphrase → server sends encrypted bundle → decrypt locally
- No QR scanning required
- Risk: Offline brute-force if database leaked (mitigated by strong passphrase + high KDF cost)

#### Option B: Maximum Security (User opt-in)

```
Server stores:
  - Public keys only
  - NO encrypted private key bundle

Client stores:
  - Private keys (non-extractable)
  - Encrypted backup file (user must download and store)
```

**Properties:**
- New device: QR scan from existing device OR import backup file
- No server-stored encrypted keys to attack
- Risk: Lost backup = lost identity

### 2.3 No Per-Device Keys (Simplification)

Unlike the original proposal, we use **identity-level keys** (not per-device keys) for message encryption. This simplifies multi-device significantly:

- All devices share the same key material
- Any device can decrypt any message (sent or received)
- No complex device-to-device key transfer needed

---

## 3. Direct Messages (DMs)

### 3.1 Encryption Model: Per-Message Session Key (Option A)

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
```

### 3.2 Cost Analysis

| Metric | Value (5 devices) | Notes |
|--------|-------------------|-------|
| Compute time | ~1.7ms | Imperceptible |
| Bandwidth overhead | ~5.6KB | Acceptable for text |
| Message ciphertext | ~message size + 16B | AEAD overhead |

### 3.3 Multi-Device Behavior

- Sender's other devices CAN read sent messages (included in wrappedKeys)
- Recipient's all devices CAN read received messages
- No sync protocol needed - server delivers to all devices

---

## 4. Group Chats (< 50 members)

### 4.1 Encryption Model: Sender Keys

For groups, per-message fan-out becomes expensive. Instead, use Sender Keys:

```
Each member has a sender key (symmetric, 32 bytes):
  - Alice: senderKey_alice
  - Bob: senderKey_bob
  - Carol: senderKey_carol

Initial key distribution:
  - Each member encrypts their sender key to all OTHER members
  - One-time O(N²) cost on group creation

Sending a message:
  messageKey = HKDF(mySenderKey, chainIndex++)
  ciphertext = encrypt(messageKey, plaintext)
  signature = sign(mySigningKey, ciphertext)
  
  Send: { ciphertext, chainIndex, signature }
  
  Cost: O(1) encryption regardless of group size!
```

### 4.2 Membership Changes

**Member Joins:**
1. All existing members send their sender keys to new member (encrypted)
2. New member distributes their sender key to everyone
3. Cost: O(N) key distributions

**Member Removed:**
1. ALL remaining members generate NEW sender keys
2. Distribute to remaining members only
3. Old sender keys become useless
4. Cost: O(N²) key rotations (expensive but rare)

### 4.3 Cost Comparison

| Scenario | Fan-out (Option A) | Sender Keys |
|----------|-------------------|-------------|
| 30 members × 2 devices | 66KB/message | ~200B/message |
| 50 members × 3 devices | 165KB/message | ~200B/message |
| Member removal | Nothing | O(N²) key rotation |

---

## 5. Spaces (Large Communities)

For large communities (100+ members, scaling to 100K+), per-member key management becomes impractical. Instead, Spaces use **Community Ciphers** - shared symmetric keys derived from known entropy.

### 5.1 Community Ciphers Overview

```
COMMUNITY CIPHER CONCEPT
════════════════════════

Instead of individual keys per member:
  - Shared symmetric key derived from "entropy pieces"
  - Anyone who knows the entropy can derive the key
  - Social/physical verification for key sharing (QR scan)
  - O(1) scaling regardless of member count

Entropy pieces (ordered list):
  [0]: "the founding phrase of our community"
  [1]: SHA-256(community_logo.png)
  [2]: SHA-256("https://our-website.com/invite")
           │
           ▼
  cipher_key = HKDF-SHA3-256(
    ikm: entropy[0] || entropy[1] || entropy[2],
    salt: "adieuu-cipher-v1",
    info: "space-cipher"
  )
           │
           ▼
  AES-256-GCM symmetric key for the Space
```

### 5.2 Entropy Types

```typescript
type EntropyPiece = 
  | { type: 'text'; value: string; label?: string }
  | { type: 'file'; hash: string; label?: string }    // SHA-256 of file
  | { type: 'url'; hash: string; label?: string }     // SHA-256 of URL content
  | { type: 'hardware'; value: Uint8Array };          // WebAuthn PRF (future)
```

### 5.3 Cipher Identification

To route messages without revealing the key:

```
cipher_id = SHA-512(HMAC-SHA256(cipher_key, "adieuu-cipher-id"))

Message metadata includes cipher_id:
  - Server can route messages
  - Clients know which cipher to use
  - Key material never exposed
```

### 5.4 Joining a Space

```
METHOD 1: QR Code Scan (Recommended)
────────────────────────────────────
1. Existing member generates QR containing entropy pieces
2. New member scans QR in-person
3. Client derives cipher locally
4. If cipher_id matches Space → access granted

Benefits:
  ✓ Physical presence verification
  ✓ No server involvement in key exchange
  ✓ Social trust model


METHOD 2: Enter Entropy Manually
────────────────────────────────
1. New member receives entropy pieces out-of-band
2. Enters each piece in correct order
3. Client derives cipher
4. If cipher_id matches → access granted

Use case:
  - Remote onboarding
  - Recovery scenarios
```

### 5.5 Epoch-Based Cipher Rotation

Ciphers can be rotated without re-encrypting history:

```
EPOCH MODEL
═══════════

Epoch 1 (founding → rotation event):
  cipher_v1 = derive(entropy_v1...)
  Messages 1-500,000

Epoch 2 (rotation → present):
  cipher_v2 = derive(entropy_v2...)  // New entropy
  Messages 500,001+

Members keep ciphers for all epochs they participated in.
Kicked members have old epoch keys but NOT new ones.
Old messages stay readable with old cipher.
New messages require new cipher.


ROTATION TRIGGERS (Admin-initiated only):
─────────────────────────────────────────
✓ Entropy was leaked publicly
✓ Major security incident
✓ Leadership change with trust reset
✓ Periodic hygiene (optional)

✗ NOT triggered by member removal (use RBAC instead)
```

### 5.6 Hierarchical Channel Ciphers

Channels can require additional ciphers beyond the Space cipher:

```
SPACE: "Crypto Enthusiasts"
├── cipher_space (base access)
│
├── #general (requires: cipher_space only)
│   └── Any Space member can access
│
├── #moderators (requires: cipher_space + cipher_mod)
│   └── Double encryption
│   └── Must have BOTH ciphers
│
└── #founders (requires: cipher_space + cipher_mod + cipher_founders)
    └── Triple encryption
    └── Must have ALL THREE ciphers


DOUBLE ENCRYPTION (Option C - Recommended):
───────────────────────────────────────────
// Encrypt
inner = encrypt(channel_cipher, plaintext)
outer = encrypt(space_cipher, inner)

// Decrypt (must have BOTH keys)
inner = decrypt(space_cipher, outer)
plaintext = decrypt(channel_cipher, inner)

Benefits:
  ✓ Must possess ALL required ciphers
  ✓ Cryptographic access control
  ✓ Scales cleanly to N layers
```

### 5.7 RBAC Layer (Server-Side)

Ciphers provide cryptographic access; RBAC provides administrative control:

```
LAYERED ACCESS CONTROL
══════════════════════

Layer 1: Cipher (Cryptographic)
  - "Ticket for entry"
  - Without cipher: can't decrypt anything
  - Server cannot help (doesn't have key)

Layer 2: RBAC (Administrative)
  - "Bouncer at the door"
  - Kick/ban identities
  - Channel permissions
  - Rate limits, moderation

KICKED MEMBER REALITY:
  - Still has cipher (can derive key)
  - BUT server rejects API calls
  - Can decrypt cached messages offline
  - CANNOT fetch new messages or post
  - For most cases, RBAC is sufficient
```

### 5.8 Message Retention (TTL & Count Limits)

Spaces support automatic message cleanup:

```typescript
interface SpaceRetentionSettings {
  mode: 'ttl' | 'count' | 'both' | 'unlimited';
  ttlSeconds?: 
    | 3600        // 1 hour
    | 86400       // 1 day
    | 604800      // 1 week
    | 2592000     // 30 days
    | 7776000;    // 90 days
  maxMessages?: number;  // e.g., 10000
}
```

**Modes:**
- `ttl`: Messages auto-delete after X seconds
- `count`: Keep only last N messages (rolling window)
- `both`: Whichever limit triggers first
- `unlimited`: No automatic deletion

**Channel Overrides:**
- Channels can be MORE restrictive than Space default
- Cannot be LESS restrictive (prevents permanent channels in ephemeral Space)

### 5.9 Sender Attribution

Space messages are signed for accountability:

```typescript
interface SignedSpaceMessage {
  // Routing
  epochId: string;
  cipherId: string;
  channelCipherId?: string;  // If channel-specific
  
  // Content
  ciphertext: string;
  nonce: string;
  
  // Attribution (required)
  fromIdentityId: string;
  identitySignature: string;  // Ed25519(identityKey, ciphertext)
  
  // Device attestation (optional)
  fromDeviceId?: string;
  deviceSignature?: string;
  
  // Metadata
  createdAt: Date;
  expiresAt?: Date;
}
```

### 5.10 Space Visibility Modes

```
PUBLIC MODE:
  - Space name/description: visible
  - Member count: visible
  - Channel list: encrypted with cipher
  - Messages: encrypted with cipher
  - Discovery: Listed publicly, but content inaccessible

HIDDEN MODE:
  - Everything encrypted (name, description, all metadata)
  - Discovery: Only via cipher_id match
  - "Invisible" without the cipher
```

### 5.11 DMs Between Space Members

Space membership is separate from DM encryption:

```
Alice and Bob meet in a Space
  → They add each other as contacts
  → DMs use standard identity-key encryption (Section 3)
  → ONE conversation, regardless of shared Spaces
  → Space cipher not involved in DMs
```

### 5.12 Local Cipher Storage

```typescript
interface LocalCipherStore {
  ciphers: {
    id: string;                      // Local identifier
    name: string;                    // User-friendly name
    spaceId?: string;                // Associated Space (if known)
    epochId?: string;                // Epoch identifier
    entropyPieces: EntropyPiece[];   // For re-derivation and sharing
    derivedKey: CryptoKey;           // Non-extractable
    cipherId: string;                // SHA-512(HMAC...) for identification
    createdAt: Date;
    lastUsedAt: Date;
  }[];
}
```

### 5.13 Scaling Properties

| Aspect | Sender Keys (Groups) | Community Ciphers (Spaces) |
|--------|---------------------|---------------------------|
| Members | < 50 | 100 - 100,000+ |
| Key storage/member | O(N) sender keys | O(epochs) ciphers |
| Join cost | O(N) key distribution | O(1) entropy sharing |
| Leave cost | O(N²) key rotation | O(1) RBAC only |
| Per-message cost | O(1) | O(1) |
| Per-message size | ~200B | ~200B |
| Sender accountability | ✓ Signature | ✓ Signature |

---

## 6. Message Features

### 6.1 Cooperative Deletion

Senders can request deletion of sent messages:

```
Sender initiates deletion:
1. DELETE /api/messages/:id (removes from server)
2. POST /api/messages/revoke (signed deletion command)

Recipients receive command:
1. Verify sender signature
2. Delete from local storage
3. Clear from current view
4. Display "Message was deleted by sender"
```

**Limitations:**
- Already-viewed messages may have been screenshot/copied
- Modified clients could ignore deletion requests
- Same limitations as Signal, WhatsApp, etc.

### 6.2 Disappearing Messages (Per-Identity Setting)

Each Identity can enable disappearing messages:

```
Identity Settings:
  disappearing_messages: {
    enabled: false,                    // Default: off
    mode: 'ttl' | 'view_count',
    ttl_seconds: 30 | 60 | 300,       // 30s, 1m, 5m
    view_count: 1 | 2 | 'unlimited',
  }
```

**Behavior:**
- Setting applies to messages SENT by this Identity
- Recipient sees countdown/view limit indicator
- Client auto-deletes after expiry
- Server also deletes after TTL (belt and suspenders)

### 6.3 Conversation Wipe

Either party can wipe an entire conversation:

```
Identity requests wipe:
1. Delete all messages from server
2. Send signed WIPE_CONVERSATION command
3. Both clients clear local storage for this conversation

This effectively revokes the conversation by:
- Removing all ciphertext from server
- Requesting clients delete local copies
- No cryptographic keys to "revoke" (keys are per-message)
```

---

## 7. Server Architecture

### 7.1 What Server Stores

| Data | Purpose | Encrypted? |
|------|---------|------------|
| Identity public keys | Key distribution | No (public) |
| Encrypted identity key bundle | Multi-device convenience | Yes (passphrase) |
| Encrypted messages | Delivery | Yes (E2E) |
| Message metadata | Routing | Minimal (from/to IDs, timestamp) |

### 7.2 What Server NEVER Sees

- Private keys (never transmitted)
- Session keys (wrapped with public keys)
- Plaintext messages
- Link between Identity and User

### 7.3 New API Endpoints

```
Identity Key Management:
  POST   /api/identity/keys              # Register public keys
  GET    /api/identity/:id/keys          # Get identity's public keys
  PUT    /api/identity/keys/bundle       # Upload encrypted key bundle
  GET    /api/identity/keys/bundle       # Download encrypted key bundle

Messaging:
  POST   /api/messages                   # Send encrypted message
  GET    /api/messages                   # Fetch messages (polling)
  DELETE /api/messages/:id               # Delete message
  POST   /api/messages/revoke            # Request cooperative deletion
  WS     /api/messages/stream            # Real-time delivery

Groups:
  POST   /api/groups                     # Create group
  GET    /api/groups/:id                 # Get group info
  POST   /api/groups/:id/members         # Add member
  DELETE /api/groups/:id/members/:id     # Remove member
  POST   /api/groups/:id/keys            # Distribute sender keys

Spaces:
  POST   /api/spaces                     # Create space
  GET    /api/spaces/:id                 # Get space info (if accessible)
  PUT    /api/spaces/:id                 # Update space settings
  DELETE /api/spaces/:id                 # Delete space
  
  GET    /api/spaces/discover            # Discover spaces by cipher IDs
  POST   /api/spaces/:id/join            # Request to join (RBAC check)
  POST   /api/spaces/:id/leave           # Leave space
  
  GET    /api/spaces/:id/channels        # List channels
  POST   /api/spaces/:id/channels        # Create channel
  PUT    /api/spaces/:id/channels/:cid   # Update channel
  DELETE /api/spaces/:id/channels/:cid   # Delete channel
  
  POST   /api/spaces/:id/messages        # Send message (with cipher_id)
  GET    /api/spaces/:id/messages        # Fetch messages
  DELETE /api/spaces/:id/messages/:mid   # Delete message
  
  POST   /api/spaces/:id/epochs          # Create new epoch (admin)
  GET    /api/spaces/:id/epochs          # List epochs
  
  GET    /api/spaces/:id/members         # List members (RBAC)
  DELETE /api/spaces/:id/members/:mid    # Kick/ban member (admin)
```

### 7.4 New Data Models

```typescript
// Identity Key Bundle
interface IdentityKeyBundle {
  identityId: ObjectId;
  publicKeys: {
    signing: string;      // Ed25519 public (base64)
    ecdh: string;         // X25519 public (base64)
    kem: string;          // ML-KEM-768 public (base64)
  };
  encryptedPrivateKeys?: string;  // Optional: encrypted bundle
  createdAt: Date;
  updatedAt: Date;
}

// Encrypted Message
interface EncryptedMessage {
  _id: ObjectId;
  conversationId: string;         // Deterministic hash of participant IDs
  fromIdentityId: ObjectId;
  toIdentityId: ObjectId;
  
  ciphertext: string;             // ChaCha20-Poly1305 encrypted
  nonce: string;
  wrappedKeys: {
    identityId: string;
    ephemeralPublicKey: string;   // X25519
    kemCiphertext: string;        // ML-KEM
    wrappedSessionKey: string;    // AES-GCM wrapped
  }[];
  signature: string;              // Ed25519
  
  createdAt: Date;
  expiresAt?: Date;               // For disappearing messages
  viewLimit?: number;
}

// Group
interface Group {
  _id: ObjectId;
  name: string;
  createdBy: ObjectId;            // Identity that created
  members: {
    identityId: ObjectId;
    role: 'admin' | 'member';
    joinedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// Group Sender Keys
interface GroupSenderKey {
  groupId: ObjectId;
  fromIdentityId: ObjectId;
  toIdentityId: ObjectId;
  wrappedSenderKey: string;       // Encrypted to recipient
  chainIndex: number;
  createdAt: Date;
}

// Space
interface Space {
  _id: ObjectId;
  name: string;                   // Plaintext (public) or encrypted (hidden)
  description?: string;
  visibility: 'public' | 'hidden';
  cipherId: string;               // SHA-512(HMAC...) for discovery
  
  createdBy: ObjectId;            // Identity that created
  
  retention: {
    mode: 'ttl' | 'count' | 'both' | 'unlimited';
    ttlSeconds?: number;
    maxMessages?: number;
  };
  
  epochs: {
    epochId: string;
    cipherId: string;
    startedAt: Date;
    endedAt?: Date;               // null = current
  }[];
  currentEpochId: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Space Channel
interface SpaceChannel {
  _id: ObjectId;
  spaceId: ObjectId;
  name: string;
  description?: string;
  
  // Additional cipher required (beyond space cipher)
  additionalCipherId?: string;
  
  // Can override space retention (more restrictive only)
  retention?: {
    mode: 'ttl' | 'count' | 'both' | 'unlimited';
    ttlSeconds?: number;
    maxMessages?: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

// Space Member (RBAC)
interface SpaceMember {
  _id: ObjectId;
  spaceId: ObjectId;
  identityId: ObjectId;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  
  // Permissions
  canPost: boolean;
  canInvite: boolean;
  canModerate: boolean;
  
  // Status
  banned: boolean;
  bannedAt?: Date;
  bannedBy?: ObjectId;
  bannedReason?: string;
  
  joinedAt: Date;
  lastActiveAt: Date;
}

// Space Message
interface SpaceMessage {
  _id: ObjectId;
  spaceId: ObjectId;
  channelId: ObjectId;
  epochId: string;
  
  // Routing
  cipherId: string;               // Space cipher ID
  channelCipherId?: string;       // Additional channel cipher ID
  
  // Content (encrypted)
  ciphertext: string;
  nonce: string;
  
  // Attribution
  fromIdentityId: ObjectId;
  identitySignature: string;
  fromDeviceId?: string;
  deviceSignature?: string;
  
  // Metadata
  createdAt: Date;
  expiresAt?: Date;
}
```

---

## 8. Client Architecture

### 8.1 Crypto Module (`packages/crypto/`)

```
packages/crypto/
├── index.ts
├── keys/
│   ├── generate.ts        # Key pair generation
│   ├── serialize.ts       # Export/import formats
│   └── storage.ts         # IndexedDB + WebCrypto
├── encrypt/
│   ├── hybrid.ts          # X25519 + ML-KEM hybrid (for DMs)
│   ├── symmetric.ts       # ChaCha20-Poly1305 / AES-GCM
│   └── wrap.ts            # Session key wrapping
├── sign/
│   └── ed25519.ts         # Signing and verification
├── kdf/
│   ├── hkdf.ts            # Key derivation
│   └── argon2.ts          # Password-based KDF
└── ciphers/
    ├── derive.ts          # Community Cipher derivation from entropy
    ├── storage.ts         # Local cipher storage (IndexedDB)
    ├── identify.ts        # Cipher ID generation (SHA-512(HMAC...))
    └── compose.ts         # Multi-layer encryption for channels
```

### 8.2 Key Storage (Web/Desktop)

```typescript
// IndexedDB structure - Identity Keys
interface CryptoKeyStore {
  // Identity keys (non-extractable CryptoKey objects)
  'identity-signing': CryptoKey;
  'identity-ecdh': CryptoKey;
  'identity-kem-encrypted': ArrayBuffer;  // ML-KEM (no WebCrypto support)
  
  // Metadata
  'identity-id': string;
  'key-created-at': Date;
}

// IndexedDB structure - Community Ciphers
interface CipherStore {
  ciphers: {
    id: string;                      // Local UUID
    name: string;                    // User-friendly name
    spaceId?: string;                // Associated Space
    epochId?: string;                // Epoch identifier
    
    // Entropy (stored for re-derivation and sharing)
    entropyPieces: {
      type: 'text' | 'file' | 'url' | 'hardware';
      value: string;                 // Text, hash, or base64
      label?: string;                // User note
    }[];
    
    // Derived key (non-extractable)
    derivedKey: CryptoKey;           // AES-GCM-256
    
    // Identification
    cipherId: string;                // SHA-512(HMAC(key, salt))
    
    // Metadata
    createdAt: Date;
    lastUsedAt: Date;
  }[];
}
```

### 8.3 Message Queue

Handle offline scenarios:

```typescript
interface OutboundMessage {
  id: string;
  recipientId: string;
  plaintext: ArrayBuffer;
  status: 'pending' | 'encrypting' | 'sending' | 'sent' | 'failed';
  retryCount: number;
}

// Encrypt and send when online
// Queue locally when offline
// Retry with exponential backoff on failure
```

---

## 9. Real-Time Infrastructure

### 9.1 Architecture Overview

Chat is deployed as a separate service from the REST API for independent scaling:

```
PRODUCTION ARCHITECTURE
═══════════════════════

                         ┌─────────────────┐
                         │   CDN / Edge    │
                         │  (Cloudflare)   │
                         └────────┬────────┘
                                  │
                         ┌────────┴────────┐
                         │     Caddy       │
                         │ (Reverse Proxy) │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
       ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
       │   API       │     │   Chat      │     │   Chat      │
       │  (Bun)      │     │  Server 1   │     │  Server 2   │
       │             │     │  (uWS.js)   │     │  (uWS.js)   │
       │ /api/*      │     │ /ws/*       │     │ /ws/*       │
       └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
              │                   │                   │
              │                   └─────────┬─────────┘
              │                             │
              ▼                             ▼
       ┌─────────────┐               ┌─────────────┐
       │  MongoDB    │◄──────────────│   Redis     │
       │             │               │             │
       │ - Messages  │               │ - Pub/Sub   │
       │ - Users     │               │ - Presence  │
       │ - Spaces    │               │ - Sessions  │
       └─────────────┘               └─────────────┘


DOMAIN ROUTING:
───────────────
api.adieuu.app   → REST API (Bun)
chat.adieuu.app  → WebSocket (uWebSockets.js, load balanced)
```

### 9.2 Why uWebSockets.js

| Library | Messages/sec | Memory/conn | Notes |
|---------|-------------|-------------|-------|
| uWebSockets.js | 1.2M | ~4KB | C++ core, JS bindings |
| Bun WebSockets | 1M | ~5KB | Native to Bun |
| ws (Node.js) | 500K | ~20KB | Pure JS |
| Socket.IO | 150K | ~50KB | Feature-rich but heavy |

**uWebSockets.js chosen for:**
- Highest performance
- Built-in pub/sub
- HTTP + WebSocket in one server
- Proven at scale (Discord, Trello)

### 9.3 Horizontal Scaling with Redis Pub/Sub

Multiple chat server instances coordinate via Redis:

```
CROSS-INSTANCE MESSAGE ROUTING
══════════════════════════════

User A (Server 1) → User B (Server 2):

┌──────────────┐                              ┌──────────────┐
│ Chat Server 1│                              │ Chat Server 2│
│  User A ●────┼──┐                       ┌───┼──● User B    │
└──────────────┘  │                       │   └──────────────┘
                  ▼                       │
            ┌──────────────┐              │
            │    Redis     │──────────────┘
            │   Pub/Sub    │
            │              │
            │  Channel:    │
            │  identity:B  │
            └──────────────┘

Flow:
1. User A sends encrypted message to Server 1
2. Server 1 publishes to Redis channel "identity:{B}"
3. Redis delivers to Server 2 (subscribed for User B)
4. Server 2 pushes to User B's WebSocket
```

### 9.4 WebSocket Authentication

WebSocket connections authenticate using Identity sessions:

```typescript
// Cookie-based authentication (same domain)
server.ws('/ws/chat', {
  upgrade: async (res, req, context) => {
    const cookies = parseCookies(req.getHeader('cookie'));
    const sessionId = cookies['adieuu_identity'];
    
    if (!sessionId) {
      res.writeStatus('401').end();
      return;
    }
    
    const session = await getIdentitySession(sessionId);
    if (!session) {
      res.writeStatus('401').end();
      return;
    }
    
    res.upgrade(
      { identityId: session.identityId },
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'),
      context
    );
  },
  
  open: (ws) => {
    const { identityId } = ws.getUserData();
    subscribeToIdentity(identityId);
    localConnections.set(identityId, ws);
  },
  
  close: (ws) => {
    const { identityId } = ws.getUserData();
    localConnections.delete(identityId);
    unsubscribeFromIdentity(identityId);
  }
});
```

```typescript
// Token-based authentication (mobile / cross-domain)

// Step 1: Get short-lived token from API
// POST /api/auth/ws-token → { token: "...", expiresIn: 30 }

// Step 2: Connect with token
// ws://chat.adieuu.app/ws/chat?token=...

upgrade: async (res, req, context) => {
  const token = new URL(req.getUrl(), 'http://x').searchParams.get('token');
  const session = await validateAndConsumeWsToken(token);
  // ... same flow
}
```

### 9.5 E2E Message Flow

The chat server is encryption-agnostic - it relays encrypted blobs:

```
CLIENT A                    CHAT SERVER                   CLIENT B
────────                    ───────────                   ────────

1. Encrypt message
   (Section 1.2)
        │
        ▼
2. Send via WebSocket ────────────────────────────────────────┐
                                                              │
                              3. Server receives              │
                                 - Validate session           │
                                 - Parse routing info         │
                                 - Store in MongoDB           │
                                 - Publish to Redis           │
                                        │                     │
                                        ▼                     │
                              4. Redis routes ────────────────┤
                                                              │
                                                              ▼
                                                    5. Receive blob
                                                       via WebSocket
                                                              │
                                                              ▼
                                                    6. Decrypt message
                                                       (Section 1.2)


SERVER SEES (encrypted payload):
────────────────────────────────
{
  type: "message",
  conversationId: "hash...",
  cipherId: "hash...",            // For Spaces
  fromIdentityId: "...",
  toIdentityId: "...",
  payload: "base64-encrypted...", // OPAQUE - server cannot read
  signature: "..."
}
```

### 9.6 Mobile: WebSocket + Push Notifications

Mobile apps use WebSocket when active, push notifications when backgrounded:

```
APP STATE         CONNECTION        DELIVERY METHOD
─────────         ──────────        ───────────────
Foreground        WebSocket         Real-time push
Background        Disconnected      FCM / APNs
Killed            None              FCM / APNs


PUSH NOTIFICATION FLOW:
───────────────────────

1. Message for offline recipient
2. Chat server: no WebSocket connection
3. Queue to Redis "push:queue"
4. Push service sends FCM/APNs notification
5. Notification wakes app
6. App connects WebSocket, fetches messages


PUSH PAYLOAD (E2E compliant):
─────────────────────────────
{
  "title": "New message",
  "body": "You have a new message",  // Generic, no content
  "data": {
    "type": "message",
    "conversationId": "...",
    "fromIdentityId": "..."
  }
}

App opens → WebSocket connects → Fetches & decrypts actual content
```

### 9.7 Presence (Online/Offline)

Presence uses long-polling via API (not real-time WebSocket):

```
PRESENCE TRACKING
═════════════════

Chat server heartbeat (every 15s):
  redis.setex(`online:${identityId}`, 30, Date.now())

On disconnect:
  redis.del(`online:${identityId}`)
  redis.set(`lastseen:${identityId}`, new Date().toISOString())


API ENDPOINT (long-poll every 2-5 min):
───────────────────────────────────────
GET /api/presence?ids=id1,id2,id3

Response:
{
  "presence": {
    "id1": { "online": true, "lastSeen": null },
    "id2": { "online": false, "lastSeen": "2026-02-19T10:30:00Z" }
  }
}
```

### 9.8 Message Ordering

Messages use eventual consistency with timestamp ordering:

```
ORDERING MODEL
══════════════

Database schema:
  {
    _id: ObjectId,
    conversationId: "...",
    createdAt: ISODate("..."),        // Server timestamp
    clientMessageId: "uuid",          // Deduplication
    replyTo?: ObjectId,               // Reply threading
    ...
  }

Index: (conversationId, createdAt)
Unique: (conversationId, clientMessageId)


ORDERING RULES:
───────────────
1. Primary: createdAt (server timestamp)
2. Override: Replies always display after parent
3. Deduplication: clientMessageId prevents duplicates on retry


WHY EVENTUAL CONSISTENCY:
─────────────────────────
✓ No serialization bottleneck
✓ Scales horizontally
✓ Chat apps tolerate minor reordering
✓ E2E messages don't depend on order
✓ Reply threading handles important ordering
```

### 9.9 Chat Server Implementation

```typescript
// apps/chat/src/index.ts

import uWS from 'uWebSockets.js';
import Redis from 'ioredis';

const publisher = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

const connections = new Map<string, uWS.WebSocket>();
const subscriptions = new Set<string>();

interface UserData {
  identityId: string;
  deviceId?: string;
}

// Redis subscription handler
subscriber.on('message', (channel, data) => {
  const identityId = channel.replace('identity:', '');
  const ws = connections.get(identityId);
  if (ws) ws.send(data);
});

function subscribe(identityId: string) {
  if (!subscriptions.has(identityId)) {
    subscriber.subscribe(`identity:${identityId}`);
    subscriptions.add(identityId);
  }
}

function unsubscribe(identityId: string) {
  if (!connections.has(identityId)) {
    subscriber.unsubscribe(`identity:${identityId}`);
    subscriptions.delete(identityId);
  }
}

async function routeMessage(message: EncryptedMessage) {
  // Store in MongoDB
  await db.messages.insertOne(message);
  
  // Check if recipient online
  const isOnline = await publisher.exists(`online:${message.toIdentityId}`);
  
  if (isOnline) {
    // WebSocket delivery
    publisher.publish(
      `identity:${message.toIdentityId}`,
      JSON.stringify({ type: 'message', data: message })
    );
  } else {
    // Queue push notification
    publisher.lpush('push:queue', JSON.stringify({
      identityId: message.toIdentityId,
      conversationId: message.conversationId,
      fromIdentityId: message.fromIdentityId,
    }));
  }
  
  // Also send to sender's other devices
  publisher.publish(
    `identity:${message.fromIdentityId}`,
    JSON.stringify({ type: 'message', data: message })
  );
}

const app = uWS.App()
  .ws<UserData>('/ws/chat', {
    idleTimeout: 120,
    maxPayloadLength: 1024 * 1024,
    compression: uWS.SHARED_COMPRESSOR,
    
    upgrade: async (res, req, context) => {
      // Authentication (see 9.4)
    },
    
    open: async (ws) => {
      const { identityId } = ws.getUserData();
      connections.set(identityId, ws);
      subscribe(identityId);
      
      // Presence heartbeat
      publisher.setex(`online:${identityId}`, 30, Date.now());
      
      // Send pending messages
      const pending = await db.messages.find({
        toIdentityId: identityId,
        deliveredAt: null
      }).toArray();
      
      for (const msg of pending) {
        ws.send(JSON.stringify({ type: 'message', data: msg }));
      }
    },
    
    message: async (ws, data) => {
      const { identityId } = ws.getUserData();
      const msg = JSON.parse(Buffer.from(data).toString());
      
      switch (msg.type) {
        case 'message':
          await routeMessage({ ...msg.payload, fromIdentityId: identityId });
          break;
        case 'typing':
          publisher.publish(
            `identity:${msg.payload.toIdentityId}`,
            JSON.stringify({ type: 'typing', from: identityId })
          );
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          publisher.setex(`online:${identityId}`, 30, Date.now());
          break;
      }
    },
    
    close: (ws) => {
      const { identityId } = ws.getUserData();
      connections.delete(identityId);
      unsubscribe(identityId);
      
      publisher.del(`online:${identityId}`);
      publisher.set(`lastseen:${identityId}`, new Date().toISOString());
    },
  })
  
  .get('/health', (res) => {
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      connections: connections.size,
    }));
  })
  
  .listen(parseInt(process.env.PORT || '9001'), (token) => {
    if (token) console.log('Chat server listening');
  });
```

### 9.10 Capacity Planning

```
SINGLE INSTANCE (8 cores, 16GB RAM):
────────────────────────────────────
  Connections:    100,000 - 500,000
  Messages/sec:   100,000 - 500,000
  Memory:         ~4KB/conn = 400MB for 100K


SCALING TARGETS:
────────────────
  100K users  → 1-2 chat servers
  500K users  → 3-5 chat servers
  1M users    → 5-10 chat servers
  
  Redis Cluster for pub/sub at >500K
  MongoDB sharding for messages at >10M


SCALING TRIGGERS:
─────────────────
  CPU > 70%           → Add instance
  Memory > 80%        → Add instance
  Connections > 100K  → Add instance
```

### 9.11 Project Structure Update

```
apps/
├── api/                  # REST API (Bun)
├── chat/                 # WebSocket service (uWebSockets.js)
│   ├── src/
│   │   ├── index.ts      # Main server
│   │   ├── auth.ts       # Session validation
│   │   ├── handlers/
│   │   │   ├── message.ts
│   │   │   ├── typing.ts
│   │   │   └── presence.ts
│   │   ├── storage.ts    # MongoDB ops
│   │   └── redis.ts      # Pub/sub
│   ├── package.json
│   └── Dockerfile
├── push/                 # Push notification service (future)
│   ├── src/
│   │   ├── index.ts
│   │   ├── fcm.ts        # Firebase Cloud Messaging
│   │   └── apns.ts       # Apple Push Notification
│   └── package.json
├── web/
├── desktop/
└── mobile/
```

---

## 10. Implementation Phases

### Phase 1: Crypto Foundation (Week 1-2)
- [ ] Add crypto dependencies (@noble/curves, ML-KEM library)
- [ ] Implement key generation (Ed25519, X25519, ML-KEM)
- [ ] Implement hybrid encryption/decryption
- [ ] Implement key storage (IndexedDB + WebCrypto)
- [ ] Unit tests for all crypto operations

### Phase 2: Identity Key Management (Week 2-3)
- [ ] API: Key registration endpoints
- [ ] API: Encrypted key bundle upload/download
- [ ] Client: Key generation on identity creation
- [ ] Client: Key retrieval on identity login
- [ ] Client: Backup file generation

### Phase 3: DM Messaging (Week 3-4)
- [ ] API: Message storage and retrieval
- [ ] API: WebSocket real-time delivery
- [ ] Client: Message encryption (Option A)
- [ ] Client: Message decryption
- [ ] Client: Local message storage

### Phase 4: Message Features (Week 4-5)
- [ ] Cooperative deletion (send + receive)
- [ ] Disappearing messages (TTL + view count)
- [ ] Conversation wipe

### Phase 5: Group Chats (Week 5-6)
- [ ] API: Group CRUD
- [ ] Sender key generation and distribution
- [ ] Group message encryption/decryption
- [ ] Member add/remove with key rotation

### Phase 6: Real-Time Infrastructure (Week 6-7)
- [ ] Set up chat service project (uWebSockets.js)
- [ ] WebSocket authentication (Identity session validation)
- [ ] Redis pub/sub for cross-instance routing
- [ ] Message storage in MongoDB
- [ ] Presence tracking (online/offline, lastSeen)
- [ ] Typing indicators
- [ ] Push notification queue (Redis)
- [ ] Health check endpoint
- [ ] Docker deployment configuration
- [ ] Load testing (target: 100K connections)

### Phase 7: Spaces - Community Ciphers (Week 7-9)
- [ ] Client: Cipher derivation from entropy pieces
- [ ] Client: Local cipher storage (IndexedDB)
- [ ] Client: QR code generation/scanning for cipher sharing
- [ ] API: Space CRUD with visibility modes
- [ ] API: Channel management with hierarchical ciphers
- [ ] API: Epoch management
- [ ] API: RBAC (member roles, kick/ban)
- [ ] Client: Double encryption for channel ciphers
- [ ] Client: Space message encryption/decryption
- [ ] API: Message retention (TTL + count limits)
- [ ] Server: Cleanup jobs for expired messages

### Phase 8: Push Notifications (Week 9-10)
- [ ] Set up push service project
- [ ] Firebase Cloud Messaging (FCM) integration
- [ ] Apple Push Notification service (APNs) integration
- [ ] Push queue consumer (Redis)
- [ ] Device token management API
- [ ] E2E-compliant push payloads (no content)

### Phase 9: UI Integration (Week 10-12)
- [ ] DM conversation list
- [ ] DM message thread view
- [ ] Group chat UI
- [ ] Space discovery and join flow
- [ ] Space channel list and navigation
- [ ] Cipher management UI (create, view, share)
- [ ] QR code scanner integration
- [ ] Compose/send UI (DMs, Groups, Spaces)
- [ ] Settings (disappearing messages, retention, etc.)
- [ ] Admin tools (RBAC, moderation)

---

## 11. Security Considerations

### 11.1 Threats Addressed

| Threat | Mitigation |
|--------|------------|
| Quantum computers | ML-KEM-768 hybrid encryption |
| Server compromise | E2E encryption, server sees ciphertext only |
| Key theft via XSS | Non-extractable WebCrypto keys |
| Timing attacks | Constant-time crypto operations |
| Identity-User linkage | No logging of crypto ops, separate sessions |
| Message tampering | Ed25519 signatures on all messages |

### 11.2 Accepted Risks

| Risk | Rationale |
|------|-----------|
| Active XSS can USE keys | Cannot prevent without OS-level isolation |
| No forward secrecy | Complexity trade-off; consider Double Ratchet in v2 |
| Metadata visible to server | From/to IDs, timestamps visible; content is not |
| Kicked Space members retain old cipher | Use RBAC for access control; rotate epoch only if entropy leaked |
| Entropy can be shared | Social trust model; same as sharing a password |
| No individual revocation in Spaces | Epoch rotation is the mechanism; expensive but rare |

### 11.3 Future Enhancements

- [ ] Double Ratchet for forward secrecy (v2)
- [ ] Screenshot detection (platform-dependent)
- [ ] Safety numbers / key verification UI
- [ ] Key rotation reminders
- [ ] CNSA Suite 2.0 profile support (ML-KEM-1024, ML-DSA-87, AES-256-GCM, SHA-384)

---

## 12. Open Questions

1. ~~**Spaces architecture**: Alternative to sender keys for large communities~~ → **RESOLVED: Community Ciphers (Section 5)**
2. **Message search**: How to search E2E encrypted messages? (client-side index?)
3. **Message backup**: Should users be able to export conversation history?
4. **Read receipts**: Optional, but how to E2E encrypt the receipt itself?
5. **Reactions/emoji**: Encrypt reactions separately or include in message edits?
6. **Message editing**: Allow edits? How to handle edit history cryptographically?
7. **File attachments**: Size limits? Separate encryption for media?
8. **Push notifications**: How to show preview without decrypting on server?
9. **CNSA 2.0 profile negotiation**: When two identities use different profiles, how to negotiate? Options:
   - Always use sender's profile (recipient must support both)
   - Negotiate to highest common security level
   - Require matching profiles for conversation
10. **CNSA 2.0 signature size**: ML-DSA-87 signatures are ~72x larger than Ed25519. Impact on:
    - Message storage costs
    - Mobile bandwidth
    - Group chat overhead (each message signed)

---

## Appendix A: Library Choices

### Default Profile

| Purpose | Library | Rationale |
|---------|---------|-----------|
| Classical ECC | @noble/curves | Pure JS, audited, maintained |
| ML-KEM-768 | @noble/post-quantum | Same author, consistent API |
| Hashing (SHA3) | @noble/hashes | SHA3, HKDF support |
| Argon2 | argon2-browser or hash-wasm | Memory-hard KDF |

### CNSA 2.0 Profile (Additional)

| Purpose | Library | Notes |
|---------|---------|-------|
| ML-KEM-1024 | @noble/post-quantum | Same library, higher security level |
| ML-DSA-87 | @noble/post-quantum | Post-quantum signatures |
| AES-256-GCM | WebCrypto native | Hardware-accelerated where available |
| SHA-384/512 | @noble/hashes or WebCrypto | SHA-2 family |

**WebCrypto Compatibility:**
- AES-256-GCM: Native WebCrypto support (non-extractable keys)
- SHA-384/512: Native WebCrypto support
- ML-KEM / ML-DSA: Requires @noble/post-quantum (no WebCrypto support yet)
- Ed25519: WebCrypto support varies by browser; @noble/curves for consistency

## Appendix B: References

- [Signal Protocol Specifications](https://signal.org/docs/)
- [ML-KEM (Kyber) NIST Standard](https://csrc.nist.gov/pubs/fips/203/final)
- [ML-DSA (Dilithium) NIST Standard](https://csrc.nist.gov/pubs/fips/204/final)
- [NSA CNSA Suite 2.0 Algorithms](https://media.defense.gov/2022/Sep/07/2003071834/-1/-1/0/CSA_CNSA_2.0_ALGORITHMS_.PDF)
- [NSA CNSA Suite 2.0 FAQ](https://media.defense.gov/2022/Sep/07/2003071836/-1/-1/0/CSI_CNSA_2.0_FAQ_.PDF)
- [Legacy ChadderJS Architecture](../legacy-chadder/docs/ARCHITECTURE.md)
- [Local Key Storage Analysis](./local-key-storage.md)
