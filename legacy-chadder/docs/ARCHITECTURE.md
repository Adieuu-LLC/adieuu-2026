# ChadderJS (Legacy - 2015) Architecture Documentation

This document describes the architecture and key functionality of 2015 ChadderJS, a JavaScript client library for the Adieuu secure messaging platform. Adieuu implements device-based end-to-end (E2E) encryption using elliptic curve cryptography (ECC).

## Table of Contents

1. [Overview](#overview)
2. [Cryptographic Foundation](#cryptographic-foundation)
3. [Device-Based PKI System](#device-based-pki-system)
4. [Direct Messages (DMs)](#direct-messages-dms)
5. [Group Chats](#group-chats)
6. [Message Revocation via Key Management](#message-revocation-via-key-management)
7. [Adding Devices to an Account](#adding-devices-to-an-account)
8. [Revoking Devices Remotely](#revoking-devices-remotely)
9. [Module Reference](#module-reference)

---

## Overview

ChadderJS is built on top of `bitcoinjs-lib` for elliptic curve cryptography operations. The system uses a hierarchical key structure:

- **Account Key**: A user-level EC key pair used for encrypting messages between users
- **Device Key**: A per-device EC key pair used for device-specific encryption and authentication

The client communicates with a central server (`service.adieuu.im`) for authentication, key exchange, and message relay, but all message content is encrypted client-side before transmission.

---

## Cryptographic Foundation

### Key Types

The system uses **secp256k1** elliptic curve keys (same curve as Bitcoin), provided by `bitcoinjs-lib`:

```
src/Keys.js
```

| Key Type | Purpose | Storage |
|----------|---------|---------|
| `deviceKey` | Per-device authentication and encryption | `localStorage.deviceKey` |
| `accountKey` | User-level message encryption | `localStorage.accountKey` |

### ECDH Key Agreement

The `Agreement()` function performs Elliptic Curve Diffie-Hellman key derivation:

```javascript
// From Keys.js
ECKey.prototype.Agreement = function(pbk) {
    var temp = pbk.Q.multiply(this.d).affineX.toByteArray();
    return bitcoin.crypto.sha256(new Buffer(temp));
}
```

This computes a shared secret between two parties by:
1. Multiplying the other party's public key point (`Q`) by our private scalar (`d`)
2. Taking the X-coordinate of the resulting point
3. Hashing with SHA-256 to produce a 256-bit symmetric key

### Encryption Layers

Messages are wrapped in multiple cryptographic layers (nested content types):

```
+------------------------------------------+
|  CT_AES (AES-256-CBC encrypted wrapper)  |
|  +------------------------------------+  |
|  |  IV (16 bytes)                     |  |
|  |  Key Source (ECDH_USER/ECDH_DEVICE)|  |
|  |  Encrypted Content                 |  |
|  |  +------------------------------+  |  |
|  |  |  CT_PLAIN (actual message)   |  |  |
|  |  +------------------------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### Content Types

Defined in `src/Crypto/Content.js`:

| Type Constant | Value | Description |
|---------------|-------|-------------|
| `CT_PLAIN` | 0x01 | Plaintext content |
| `CT_AES` | 0x01000001 | AES-256-CBC encrypted content |
| `CT_AES_PASSWORD` | 0x01000003 | AES encrypted with password-derived key |
| `CT_AES_KEYLESS` | 0x01000004 | AES with ephemeral/no persistent key |
| `CT_ECDH_USER` | 0x02000004 | User-to-user ECDH key agreement |
| `CT_ECDH_DEVICE` | 0x02000005 | Device-to-device ECDH key agreement |
| `CT_DELETE_MSGS` | 0x04000002 | Message deletion command |

---

## Device-Based PKI System

### Architecture

Each user can have multiple devices, and each device maintains its own cryptographic identity:

```
User Account
    |
    +-- Account Key (accountKey) - shared across devices
    |
    +-- Device 1
    |       +-- Device ID (UUID)
    |       +-- Device Key (deviceKey)
    |       +-- hasUserKey flag
    |
    +-- Device 2
    |       +-- Device ID (UUID)
    |       +-- Device Key (deviceKey)
    |       +-- hasUserKey flag
    |
    ...
```

### Device Registration

When a device logs in or registers, it generates a new EC key pair:

```javascript
// From Account.js - Login/Register
db.deviceId = uuid.v4();
db.deviceKey = keys.ECKey.makeRandom(false);

var data = {
    Device: {
        DeviceID: db.deviceId,
        DeviceName: deviceName,
        DeviceKey: db.deviceKey.pub.toBase64(),
        Type: 0
    }
};
```

The device's **public key** is sent to the server, while the **private key** remains on the device only.

### Trust Model

- The server stores public keys for all devices
- Devices can communicate directly using device-level ECDH (`CT_ECDH_DEVICE`)
- Users can communicate using account-level ECDH (`CT_ECDH_USER`)
- The server never has access to private keys or message plaintext

---

## Direct Messages (DMs)

### Encryption Flow

When User A sends a DM to User B:

1. **Retrieve User B's public key** from the contacts database
2. **Compute shared secret** using ECDH: `sharedKey = ECDH(A.accountKey.private, B.publicKey)`
3. **Generate random IV** (16 bytes)
4. **Encrypt message** using AES-256-CBC with the shared key
5. **Serialize** with metadata (source/target user IDs)

```javascript
// From Source.js
function EncryptForUser(userId, bin) {
    if(typeof bin == 'string')
        bin = new Buffer(bin, 'utf8');
    var plain = new crypto.Plain(bin);           // Wrap in CT_PLAIN
    var key = new crypto.UserECDH(userId);       // ECDH key source
    var aes = new crypto.AES(plain, key);        // Wrap in CT_AES
    return aes.Serialize().toString('base64')
}
```

### Decryption Flow

When receiving an encrypted message:

1. **Deserialize** the content structure
2. **Identify key source** (UserECDH contains sourceId/targetId)
3. **Compute shared secret**: `sharedKey = ECDH(my.accountKey.private, sender.publicKey)`
4. **Decrypt** using AES-256-CBC with IV from message
5. **Extract plaintext** from inner CT_PLAIN layer

```javascript
// From Source.js
function Decrypt(str) {
    var b = new Buffer(str, 'base64');
    var reader = new binReader(b);
    var packed = crypto.Deserialize(reader);
    return packed.GetContent().toString();
}
```

### Key Properties

- **Forward Secrecy**: Not inherent in this design (same key pair used for multiple messages)
- **Message Authentication**: Implicit via ECDH (only parties with correct keys can decrypt)
- **Deniability**: Neither party can prove the other sent a message (shared key can be computed by either)

---

## Group Chats

Based on the content types and architecture, group chats likely work as follows:

### Conversation-Based Key Distribution

The system has `CONVERSATION` and `CONVERSATION_MEMBERSHIP` change types, suggesting:

1. **Conversation Key**: A symmetric key shared among all group members
2. **Key Distribution**: The conversation key is encrypted to each member using their account key
3. **Membership Changes**: When members are added/removed, new keys are distributed

### Group Message Flow

1. **Sender** encrypts message with conversation's symmetric key
2. **Server** distributes encrypted message to all members
3. **Each recipient** decrypts using the shared conversation key

### Key Rotation on Membership Change

When a member is removed:
1. Generate new conversation key
2. Re-encrypt and distribute to remaining members
3. Old key is invalidated, preventing removed member from reading future messages

---

## Message Revocation via Key Management

This is a key feature of Adieuu's architecture. Messages can be revoked by invalidating the keys used to encrypt them.

### How It Works

#### Account Key Rotation

```javascript
// From Account.js
function NewKey() {
    db.accountKey = keys.ECKey.makeRandom(false);  // Generate new key
    var data = {
        data: db.accountKey.pub.toBase64()
    };
    // POST to /api/Device/UpdateKey
    $.ajax({
        type: "POST",
        url: urls.UpdateKey,
        data: JSON.stringify(data),
        // ...
    });
}
```

When a user calls `NewKey()`:

1. **New account key** is generated locally
2. **Public key is uploaded** to the server
3. **Old key is discarded** (not stored)

#### Impact on Messages

- **Previously sent messages**: Recipients who haven't decrypted them yet **cannot decrypt** them because the ECDH shared secret depends on the sender's key pair
- **Future messages**: Will use the new key, invisible to anyone who cached the old public key
- **Already decrypted messages**: May still exist on recipient's device (client-side message storage)

### Explicit Message Deletion

The content type `CT_DELETE_MSGS` (0x04000002) indicates the system also supports explicit deletion commands:

```javascript
// From Content.js
CT_DELETE_MSGS_LEGACY: 0x04000001,
CT_DELETE_MSGS: 0x04000002
```

This likely sends a command to:
1. Delete message from server
2. Notify recipients to delete local copies
3. Combined with key rotation for cryptographic revocation

### Revocation Guarantees

| Scenario | Can Read Message? |
|----------|-------------------|
| Recipient decrypts before key change | Yes (plaintext cached locally) |
| Recipient tries to decrypt after key change | No (ECDH computation fails) |
| Attacker with old public key | No (never had private key) |
| Server with stored ciphertext | No (never has private keys) |

---

## Adding Devices to an Account

### Device Addition Flow

When a user adds a new device to their account:

#### 1. New Device Login

```javascript
// From Account.js - Login
db.deviceId = uuid.v4();                         // New unique device ID
db.deviceKey = keys.ECKey.makeRandom(false);     // New device key pair

var data = {
    UserName: username,
    Password: password,
    Device: {
        DeviceID: db.deviceId,
        DeviceName: deviceName,
        DeviceKey: db.deviceKey.pub.toBase64(),  // Public key to server
        Type: 0
    }
};
```

#### 2. Server Response

The server returns:
- Authentication token
- User ID
- Device ID (server-assigned)
- List of existing contacts
- List of all devices on the account

```javascript
success: function(result) {
    db.token = result.token;
    db.userId = result.user.id;
    db.userDeviceId = result.device.id;
    db.Contacts = result.contacts;
    db.Devices = result.devices;           // All devices for this account
    db.Save();
}
```

#### 3. Account Key Transfer

The new device needs the account key to participate in user-level encryption. This is handled via `KeysContent.js`:

```javascript
// From KeysContent.js
function UserKey(reader) {
    this.from = reader.ReadGuid();
    this.to = reader.ReadGuid();
    this.time = reader.ReadDate();
    this.data = reader.ReadBinary();       // Encrypted account key
}

UserKey.prototype.Process = function() {
    var key = keys.ECKey.fromByteArray(this.data);
    db.accountKey = key;
    var device = db.GetDevice(this.to);
    device.hasUserKey = true;              // Mark device as having user key
    db.Save();
}
```

The transfer process:
1. Existing device encrypts `accountKey` to new device's public key (device-to-device ECDH)
2. Encrypted key is sent via the server
3. New device decrypts and stores the account key
4. `hasUserKey` flag is set to true

### Device States

```javascript
// Device object structure
{
    id: "server-assigned-id",
    name: "My Phone",
    publicKey: "base64-encoded-public-key",
    hasUserKey: true/false                  // Can this device decrypt user-level messages?
}
```

---

## Revoking Devices Remotely

### Revocation via Update System

The system uses a polling-based update mechanism with change types:

```javascript
// From Source.js
var ChangeType = {
    DEVICE: 5,
    // ...
};

var ChangeEvent = {
    DELETE: 3
};
```

### Revocation Flow

#### 1. Revocation Request

An authenticated device sends a revocation request to the server (endpoint not shown in this client code, but implied by the update system).

#### 2. Server Broadcasts Update

```javascript
// From Source.js - RequestUpdates handler
result.updates.forEach(function(entry) {
    if(entry.type == ChangeType.DEVICE) {
        if(entry.e == ChangeEvent.DELETE)
            db.RemoveDevice(entry.o);       // entry.o contains device ID
        else
            db.AddDevice(entry.o);
    }
    localStorage.lastUpdate = entry.id;
});
```

#### 3. Local Device Removal

```javascript
// From DB.js
DB.prototype.RemoveDevice = function(id) {
    for(i = 0; i < this.Devices.length; ++i) {
        if(this.Devices[i].id == id) {
            this.Devices.splice(i, 1);      // Remove from local list
            break;
        }
    }
    SaveDevices();
}
```

### Security Implications

When a device is revoked:

1. **Server invalidates token**: The revoked device can no longer authenticate
2. **Other devices remove it from list**: No longer attempted for device-to-device encryption
3. **Account key rotation recommended**: Generate new account key so revoked device cannot decrypt future messages
4. **Device-level encryption isolated**: Messages encrypted to the device's key only affect that device

### Complete Remote Wipe

The `Logout` function with `keepData: false` triggers a data clear:

```javascript
// From Account.js
function Logout() {
    $.ajax({
        url: urls.Logout,
        data: JSON.stringify({ keepData: false })
    }).done(function(data) {
        db.Clear();                          // Wipe all local data
    });
}

// From DB.js
DB.prototype.Clear = function() {
    localStorage.clear();
    delete this.token;
    delete this.userId;
    delete this.deviceId;
    delete this.userDeviceId;
    delete this.deviceKey;
    delete this.Devices;
    delete this.Contacts;
    delete this.accountKey;
}
```

---

## Module Reference

### index.js (Entry Point)

Exports all modules:
- `Account` - Authentication and key management
- `Database` - Local storage operations
- `Urls` - API endpoints
- `Keys` - EC key operations
- `Source` - Message encryption/decryption
- `Crypto` - Cryptographic content types

### src/Account.js

| Function | Description |
|----------|-------------|
| `Login(username, password, deviceName)` | Authenticate existing user, register device |
| `Register(username, password, deviceName)` | Create new account with initial device |
| `Logout()` | End session, clear local data |
| `NewKey()` | Rotate account key (revokes old messages) |

### src/DB.js

| Function | Description |
|----------|-------------|
| `Load()` | Load state from localStorage |
| `Save()` | Persist state to localStorage |
| `GetDevice(id)` | Look up device by ID |
| `GetUser(id)` | Look up contact by ID |
| `AddDevice(o)` | Add/update device in list |
| `RemoveDevice(id)` | Remove device from list |
| `UpdateContact(o)` | Add/update contact |
| `Clear()` | Wipe all stored data |

### src/Source.js

| Function | Description |
|----------|-------------|
| `RequestUpdates()` | Poll server for changes |
| `EncryptForUser(userId, bin)` | Encrypt message for specific user |
| `Decrypt(str)` | Decrypt received message |

### src/Crypto/*

| Module | Description |
|--------|-------------|
| `Content.js` | Base content types, serialization |
| `AESContent.js` | AES-256-CBC encryption wrapper |
| `ECDH.js` | User and device ECDH key derivation |
| `KeysContent.js` | Account key transfer between devices |

---

## Security Considerations

### Strengths

- True E2E encryption (server never sees plaintext)
- Device-level key isolation
- Key rotation capability for message revocation
- Elliptic curve cryptography (secp256k1)

### Potential Weaknesses

- **No forward secrecy**: Same key pair used across sessions
- **localStorage for key storage**: Vulnerable to XSS attacks
- **No message authentication (MAC)**: AES-CBC without HMAC
- **Polling-based updates**: Potential for missed updates

### Recommendations for Modern Implementation

1. Implement Signal Protocol for forward secrecy
2. Use Web Crypto API instead of JS crypto libraries
3. Add HMAC or use AES-GCM for authenticated encryption
4. Use WebSockets instead of polling for real-time updates
5. Consider IndexedDB with encryption for key storage
