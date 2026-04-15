# Safety fingerprint v2 (`adieuu-safety-f2`)

Stage A user-verifiable binding: **SHA3-256** over a **length-prefixed (TLV-style)** preimage so identity signing material and SPK fields can use **variable lengths** (classical-only, PQC-only, or hybrid) without parser ambiguity.

Implemented in [`packages/crypto/src/safety/fingerprint.ts`](../packages/crypto/src/safety/fingerprint.ts).

## Preimage layout (v2)

Each chunk is **`le32(length)`** (little-endian uint32) **concatenated with** **`length` bytes** of payload.

| Chunk order | Payload |
|-------------|---------|
| 1 | UTF-8 magic: `adieuu-safety-f2` |
| 2 | UTF-8 profile: `default` or `cnsa2` |
| 3 | **Identity long-term signing public key** (raw). Length is profile-dependent (e.g. Ed25519 32 bytes today; ML-DSA public key when CNSA identity signing is used). |
| 4 | UTF-8 device id |
| 5 | UTF-8 SPK `keyId` |
| 6 | Raw SPK X25519 ECDH public key |
| 7 | Raw SPK ML-KEM public key (768 or 1024-sized per profile) |
| 8 | Raw SPK signature (length varies if identity signing is upgraded to PQC) |

Together this binds the **hybrid handshake** (ECDH + ML-KEM + signature) to the **identity signing key** in a **PQC-safe** way: no fixed 32-byte assumption for the identity key or signature.

## Verification before hash

The signed pre-key **must** verify with `verifySignedPreKey` from `@adieuu/crypto` (same rule as pre-key upload) before hashing; otherwise `computeSafetyFingerprintDigestV2` throws. When identity signing is upgraded to ML-DSA for SPK signatures, `verifySignedPreKey` must be extended accordingly; the **preimage format** already supports variable-length keys and signatures.

## API inputs

Matches server `IdentityPublicKeys` + per-device `signedPreKey` on `GET /identity/:id/keys` (authorized callers only). OTPKs are **not** included.

## Display

`formatSafetyFingerprintDisplay` shows the first 16 bytes of the digest as 8 groups of 4 hex digits (space-separated). UI may also encode the full digest for QR.

## Supersedes

Earlier experiment `adieuu-safety-f1` (null-delimited preimage, fixed implicit layouts) is **not** used for new code.

## Related

- Key visibility: [`identity-keys-access.service.ts`](../apps/api/src/services/identity-keys-access.service.ts).
