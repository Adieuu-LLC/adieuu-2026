# Strict Forward Secrecy Mode

## Problem

When SPK signature verification fails during message send, the client silently falls back to static wrapping (no forward secrecy). This is the correct default for availability, but it creates a downgrade attack vector: a malicious or compromised server could serve invalid SPKs to force all messages into static wrapping, eliminating forward secrecy without the sender's knowledge.

Relevant code: `packages/ui/src/hooks/useDmMessages.ts`, around line 317-319 (the `verifySignedPreKey` fallback path).

## Current Behavior

1. Client claims pre-keys from the server for the recipient's devices.
2. Client verifies the SPK signature against the recipient's signing public key.
3. If verification fails, the client logs a warning and proceeds with static wrapping.
4. The message is sent successfully, but without forward secrecy guarantees.

The sender receives no indication that the message was downgraded.

## Threat Model

This attack requires a compromised server (or MITM with server-level access). A compromised server already has access to delivery metadata and encrypted ciphertext, but cannot read message content. However, if the attacker later compromises a recipient's long-term device keys, messages sent with static wrapping are retroactively decryptable -- exactly the scenario forward secrecy is designed to prevent.

## Proposed Feature: Strict FS Mode

A user-configurable setting that changes the fallback behavior when SPK verification fails:

- **Default (current):** Fall back to static wrapping. Prioritizes availability.
- **Strict mode:** Fail the send entirely. Prioritizes forward secrecy guarantees.

### Design Considerations

1. **Scope of the setting.** Per-identity (global preference) is simpler. Per-conversation adds granularity but increases UI complexity. Per-identity is likely sufficient since the threat model (compromised server) is identity-wide.

2. **User-facing feedback.** In strict mode, a failed send needs a clear error message explaining why the message wasn't sent and what the user can do (e.g., "Could not verify recipient's pre-key signature. The message was not sent to protect forward secrecy. You can retry or disable strict mode in settings.").

3. **Retry behavior.** Transient issues (e.g., corrupted key fetch) should be retriable. The UI should distinguish between "verification failed" (security concern) and "keys unavailable" (network/availability concern).

4. **Partial device failure.** If verification fails for one recipient device but succeeds for others, strict mode should fail the entire send (not send to some devices and not others, which would create confusing partial delivery).

5. **Interaction with FS toggle.** If the sender has FS toggled off (static wrapping) for a specific message, strict mode doesn't apply since the sender has explicitly opted out of forward secrecy for that message.

## Intermediate Mitigations (Lower Effort)

Before implementing strict mode, consider these lighter-weight improvements:

- **Surface wrapping mode in the message UI.** A visual indicator (e.g., lock icon with different states) showing the forward secrecy level of each sent message. This lets security-conscious users notice downgrades without blocking sends.
- **Increment a metric or emit an event** when SPK verification fails, so the pattern can be detected at scale (many users experiencing verification failures simultaneously would be a strong signal of server compromise).

## Prerequisites

- Settings model and storage for per-identity security preferences.
- Settings UI for toggling strict mode.
- Error state handling in the message composer for blocked sends.

## Related

- `planning/forward-secrecy.md` -- overall FS architecture
- `planning/e2e-chat-architecture.md` Section 3.4 -- cryptographic design rationale
