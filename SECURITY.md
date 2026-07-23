# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Adieuu, please report it responsibly. **Do not open a public issue.**

**Email:** [security@adieuu.com](mailto:security@adieuu.com)

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce or proof of concept
- Affected components (API, chat, crypto, desktop, web, infrastructure)
- Potential impact assessment
- Suggested fix (if you have one)

## Response Timeline

- **Acknowledgment:** Within 48 hours of receipt (normally much sooner, but we all have lives/kids: please give us a bit of grace here, especially over holidays :) )
- **Initial assessment:** Within 3 business days following acknowledgement
- **Fix timeline:** Depends on severity; critical issues are prioritized immediately

We ask that you keep the vulnerability confidential until we've had reasonable time to investigate and deploy a fix. We'll coordinate with you on disclosure timing: if the vulnerability has potential impact on customer data, we'd like to know what the impact is and notify affected parties first (and that can take a bit of time, depending on the type of vuln).

## Scope

The following are in scope:

- Authentication and session management (`apps/api`)
- Cryptographic operations (`packages/crypto`)
- Account/Alias separation and privacy guarantees
- E2EE implementation and key management
- WebSocket chat service (`apps/chat`)
- Media upload/processing pipeline
- Desktop app security (Electron, IPC, navigation guards)
- Infrastructure misconfigurations exposed in this repository

Out of scope:

- Denial of service attacks against production infrastructure
- Social engineering (we would have no way of knowing your campaign isn't malicious and it would be treated as such)
- Issues in third-party dependencies (report upstream; let us know if it affects us - though this is part of what we use Manifest for, they're great at this!)
- Self-hosted instances you control (though we appreciate reports if the default configuration is insecure)

## Recognition

We don't currently have a paid bug bounty program, but we are grateful for responsible disclosures and can (at the least) offer:

- Complimentary in-app subscriptions and entitlements
- Permanent recognition on our in-app acknowledgments wall (if you'd like)
- Credit in the security advisory (if you'd like)

We hope to offer financial bounties and other benefits in the future as project growth allows.

## Supported Versions

Security fixes are applied to the latest release on `main`. We do not backport to older versions.

## Cryptographic Security Model

This section documents the intended behavior of the end-to-end encryption (E2EE)
system so that reviewers and researchers can reason about its guarantees and
tradeoffs. It describes design intent; the authoritative source is the code in
`packages/crypto`, `packages/shared/src/messaging`, and the client key-management
services in `packages/ui/src/services`.

### End-to-end encryption overview

Direct messages, reactions, and call keys are end-to-end encrypted on the client.
The server stores only ciphertext and the wrapped per-recipient session keys; it
never has access to plaintext or to the private keys needed to unwrap them.

Message authenticity is bound with a versioned signature scheme. The v2 signature
preimage includes the domain separator, the conversation ID, the sender alias
ID, and the client message/reaction ID, so a captured signature cannot be replayed
into a different conversation, attributed to a different sender, or moved onto a
different message. Wrapped keys are serialized canonically before signing so that
JSON key ordering cannot change the signed bytes.

### Forward secrecy tiers

Forward secrecy (FS) is **optional**: it is opt-in per alias (and
overridable per conversation/message). Messages sent without FS remain E2E
encrypted but persist in history under long-lived keys.

When FS is enabled, the strength is governed by two independent controls:

- **Security level** sets the signed pre-key (SPK) rotation cadence. Faster
  rotation shrinks the window in which a compromised key can decrypt captured
  ciphertext, at the cost of a shorter guaranteed-readable history:
  Very Lax (30 days), Lax (2 weeks), Standard (7 days), Medium (24 hours),
  High (4 hours), Maximum (1 hour).
- **Retired-key deletion policy** sets when the private half of a rotated SPK is
  destroyed: `after-sync` (recommended; retains longer to avoid message loss),
  `timed` (strict timer), or `immediate` (destroyed on rotation; old FS messages
  become permanently unreadable unless locally cached).

Forward secrecy only holds once the retired private key is actually deleted.
Until then, an attacker who compromises the device can still unwrap ciphertext
encrypted under retired keys.

### Session-key retention tradeoff

To avoid losing already-decrypted messages when keys rotate, the client can cache
decrypted FS message content and derived session keys locally. This is a
deliberate usability/secrecy tradeoff surfaced to the user as **"Also clear local
message cache when keys are deleted"** (`clearCacheOnRotation`, default off):

- **Off:** decrypted copies of FS messages stay cached on the device after the
  keys are deleted. Forward secrecy still holds against network/server capture,
  but **anyone with access to the unlocked device can still read the old
  messages** — FS is weakened locally.
- **On:** when keys are deleted (by policy, manual rotation, or purge) the local
  FS message cache and persisted session keys for the retired SPK are evicted, so
  old FS messages become permanently unreadable on the device as well.

The settings copy explains this explicitly so users can make an informed choice.
Users who want the strongest local guarantee should enable cache clearing (and can
additionally purge retired keys on demand).

### Device-trust model (TOFU)

Key distribution uses a trust-on-first-use (TOFU) model. Peer device keys are
learned from the server and pinned locally. Users can compare a **safety
fingerprint** out of band to verify a peer device; the verified snapshot is stored
per peer alias **and** per device (`adieuu-device-signature-verification`), so
verifying one device does not implicitly trust another device on the same peer
alias. A subsequent key change for a verified device is detectable by comparing
the current fingerprint against the stored snapshot.

Because trust is established on first use, the server (or a network attacker who
can impersonate it) could attempt to substitute a key before verification. Out-of-
band fingerprint verification is the mechanism that closes this gap; researchers
should evaluate the system with this assumption in mind.

### Logout tiers

The client exposes three escalating tiers of local data removal. Higher tiers are
strictly supersets of the local wipe performed by lower tiers:

1. **Basic logout** — ends the server session. Local caches, device keys, and
   pre-keys are retained so the identity can be unlocked again quickly.
2. **Identity-scoped wipe** (`clearIdentityLocalData`) — removes all locally
   persisted data for the current alias: device keys, pre-keys, session keys, wrapping
   salts, unlock metadata, stored ciphers, the message-search index, media outbox,
   TOFU verification records, and per-identity/per-conversation `localStorage`
   preferences. The server-side device registration is kept. Other aliases are unaffected.
3. **Panic wipe** (`panicWipeLocalClientData`) — removes all client persistence
   for the origin (every crypto/cache/outbox IndexedDB database, `localStorage`,
   `sessionStorage`, Cache Storage, and, on desktop, local secure key files) so
   the installation looks brand new and is treated as a fresh device on the user's
   device chain. This affects all aliases: local state should look similar to a fresh install
   before first Alias login.

Every step of tiers 2 and 3 is best-effort and isolated: a failure in one store
must not prevent the remaining stores from being wiped.
