# PII inventory (for general awareness, self-hosting, etc)

This document maps where Adieuu stores or forwards personally identifiable information (PII). It is intended for operators running their own deployment who need to understand data residency, retention, and third-party exposure. We explicitly try to avoid collecting any PII except where it's necessary for platform security, abuse prevention, and the like.

**Status:** IP addresses and media-upload PII are documented below. Additional sections (email, phone, identifiers, etc.) will be added over time.

**Terminology:** User-facing docs say **Alias** (a pseudonymous profile used for chat, activity, etc). The codebase often uses `identity` for the same concept — file paths, types, and function names in this document refer to code as written. We initially called them Identities and found that to be more confusing (where Alias or Handle or Username is more accurate), but the code itself hasn't been fully migrated. So, "Account" is "real human" stuff, an your Alias/Identity is the anon-you.

---

## Content moderation (hash-based only)

Automated moderation uses **CSAM hash checks only** — we do **not** send cleartext images or video to third-party ML/label APIs (no Amazon Rekognition or similar).

| Tier | Service | What leaves your deployment |
| ---- | ------- | --------------------------- |
| 1 | NCMEC hash list (DynamoDB) | Nothing — MD5/SHA1 computed locally and matched in-region |
| 2 | [Project Arachnid Shield](https://www.projectarachnid.ca/) | **PDQ perceptual hash only** over HTTPS — not media bytes |

**`conv_scan` scan copies:** Clients upload cleartext thumbnails/frame grids to **your** media S3 bucket so the media-processor Lambda can compute hashes locally. On a clean pass, cleartext S3 is deleted and `conv_scan` Mongo rows are purged (see retention below). On CSAM match, evidence is archived to a separate evidence bucket and metadata (including upload IP) is copied to `platform_reports`.

**Report sources:** `automated_csam_hash`, `automated_hash_check`, `manual_user`.

**Code references:** `infra/aws/lambda/media-processor/src/csam-hash-check.ts`, `infra/aws/lambda/media-db-writer/src/index.ts`.

---

## How client IP is determined

All server-side IP handling starts from `getClientIp()` in `apps/api/src/routes/auth/controller.ts`:

1. **Non-production:** optional `DEV_CLIENT_IP` env override (sanitized; for local geo/compliance testing).
2. `**X-Real-IP`** header (typical if running behind Caddy or similar).
3. `**X-Forwarded-For**` — first hop in the chain.
4. Fallback: `127.0.0.1`.

**Self-hosting note:** In production, set `TRUST_PROXY_HEADERS=true` and configure your reverse proxy to **strip or overwrite** client-supplied `X-Forwarded-For` / `X-Real-IP`. Otherwise geo, compliance, and stored IPs may reflect spoofed values. See `apps/api/README.md` and `docs/deployment/ecs-environment.md`.

IPs used for persistence are sanitized via `sanitizeIpForStorage()` (`apps/api/src/utils/sanitize.ts`) where noted below.

---

## IP address inventory

### Summary


| Form stored                     | Where                                                                                                  | Retention                                           | Reversible?                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------- |
| **Full IPv4/IPv6**              | MongoDB `sessions` (**account sessions only**), `media_uploads`, `platform_reports`, Redis MFA pending | Session TTL / indefinite* / report lifetime / 5 min | Yes (direct)                              |
| **Masked IP** (UI/API only)     | Session API response, account security UI                                                              | Not persisted                                       | Partial (first two octets or IPv6 prefix) |
| **Keyed hash** (`hashIp`)       | Redis rate limits, auth-related logs                                                                   | Window TTL / log retention                          | No* (without `SESSION_SECRET`)            |
| **Keyed hash** (`hashIpForGeo`) | MongoDB `users`, `audit_logs`, Redis geo cache                                                         | User lifetime / 90 days / ~24h cache                | No* (without `ACCOUNT_HASH_SECRET`)       |
| **Partial prefix**              | Application logs (IPLocate errors)                                                                     | Log retention                                       | Partial only                              |


 `media_uploads` and CSAM `platform_reports` rows are not TTL-expired by default. Hashes are one-way but could be attacked offline if the corresponding secret leaks.

---

### MongoDB (persistent)


| Collection / field                                   | Trigger                                                                          | What's stored                                                                                                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions.ipAddress` (**account sessions only**)     | Account login (OTP verify, MFA completion)                                       | Full sanitized IP at login time — **only when `sessions.type` is `account`**. Set by `createAccountSession()`; omitted (field absent) on Alias sessions. | Session management for the signed-in **account**; shown masked in Account → Security. Not used for Alias login or chat WebSocket auth.                                                                                                                                                                                                                                                                                                                             |
| `users.geo.ipHash`                                   | Login, session refresh, compliance checks                                        | `SHA-256(ip + ACCOUNT_HASH_SECRET)`                                                                                                                      | Detect IP/network change; **no raw IP** on user doc. On change we recheck jurisdiction to determine if age verification is needed, if OFAC requires service denial, etc.                                                                                                                                                                                                                                                                                           |
| `users.geo.*`                                        | Same as above                                                                    | Jurisdiction, country, region, VPN/abuse flags                                                                                                           | Age verification, geofencing, compliance (derived from IP lookup). Worth noting we do not *care* if you are on a VPN: if anything, we celebrate your privacy focus (and we use VPNs constantly)! However, there are specific networks that are known to be primarily used by bad actors, abusive bots, etc and so these flags help us track and remove that. We have no intention of blocking VPN usage at large (and that's largely infeasible at scale anyways). |
| `users.compliance.vpnAttestationPending.ipHash`      | VPN/anonymized IP detected                                                       | Keyed hash (`hashIpForGeo`)                                                                                                                              | Tie attestation flow to current network                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `users.compliance.lastVpnAttestation.ipHash`         | VPN attestation completed                                                        | Keyed hash                                                                                                                                               | Skip re-prompt on same network                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `users.ageVerification.requiredReasonIpHash`         | Abusive-IP compliance path                                                       | Keyed hash                                                                                                                                               | Record which network triggered AV requirement                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `media_uploads.uploadIpAddress`                      | Presigned upload URL request (avatars, banners, DM/space media, E2E scan copies) | Full sanitized IP                                                                                                                                        | NCMEC CyberTipline reporting if CSAM detected.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `audit_logs.ipHash`                                  | OFAC ban, abusive-IP block                                                       | Keyed hash from compliance (`hashIpForGeo`)                                                                                                              | Compliance audit trail                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `audit_logs.ipHash`                                  | Admin actions                                                                    | Literal `'admin'` (placeholder)                                                                                                                          | Admin audit trail — **admin IP not recorded**                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `platform_reports.detectionMetadata.uploadIpAddress` | Automated CSAM hash match (Lambda → Mongo)                                       | Copy of upload IP from `media_uploads`                                                                                                                   | Moderation + CyberTipline bundle building                                                                                                                                                                                                                                                                                                                                                                                                                          |


**Account vs Alias sessions in `sessions`:**

The `sessions` collection holds both **account** sessions (email/phone sign-in) and **Alias** sessions (pseudonym login for chat). They share a schema, but IP handling differs:


| Session type (`sessions.type`) | `ipAddress` stored?              | When created                                       |
| ------------------------------ | -------------------------------- | -------------------------------------------------- |
| `account`                      | Yes — full sanitized IP at login | OTP verify or MFA completion                       |
| `identity` (Alias)             | **No** — field is not written    | `createIdentitySession()` never passes `ipAddress` |


Alias activity is authenticated with Alias session cookies; it does **not** add or update `sessions.ipAddress`. IP captured at account login lives on the account session row only. The chat service reads Alias sessions from Mongo for validation but does not persist IP there either.

**Retention:**

- `sessions` (both types): MongoDB TTL on `expiresAt` (default **7 days**, renewed on activity). Only **account** rows may carry `ipAddress`.
- `audit_logs`: **90-day** TTL (`apps/api/src/db/mongo.ts`).
- `users.geo` / compliance fields: lifetime of user document.
- `media_uploads` (non–`conv_scan`): no automatic expiry; `uploadIpAddress` is **unset** after terminal moderation (`ready` / `rejected` / `failed`). CSAM path copies IP to `platform_reports` first.
- `media_uploads` (`purpose: conv_scan`): immediate purge of rows + S3 prefix after clean `ready`; **7-day TTL** on terminal rows as belt-and-suspenders (`apps/api/src/db/mongo.ts`).
- `platform_reports`: no automatic expiry (operational deletion only).

**Code references:** `apps/api/src/services/session.service.ts`, `apps/api/src/services/geo/geo.service.ts`, `apps/api/src/services/compliance/compliance-enforcement.service.ts`, `apps/api/src/services/upload.service.ts`, `apps/api/src/services/e2e-upload.service.ts`, `infra/aws/lambda/media-db-writer/src/index.ts`.

---

### Media uploads (`media_uploads`)

| Field | Purposes | PII / linkage risk |
| ----- | -------- | ------------------ |
| `uploadIpAddress` | All upload types at presign time | Full IP; **expunged** on terminal moderation except CSAM snapshot in `platform_reports` |
| `identityId` | avatar, banner, dm_attachment, etc. (not `conv_scan`) | Links upload to Alias |
| `scanHash` | `conv_scan` only | Join to `e2e_media.identityId` enables IP → Alias correlation while row exists |
| `userId` | `ticket_attachment` only | Links upload to account |

**E2EE conversation media:** Encrypted payload lives in `e2e_media` + E2E S3 bucket. `conv_scan` rows are ephemeral moderation copies; they do not hold the ciphertext.

**Mitigations in production:**

- **A:** Unset `uploadIpAddress` after terminal moderation.
- **E:** Delete `conv_scan` rows + S3 prefix immediately on clean `ready`.
- **D:** 7-day TTL on terminal `conv_scan` rows.

**S3 note:** `conv_scan` presigned PUTs may include `identity-id` in S3 object metadata — a separate linkage surface if bucket access logs are exposed.

---

### Redis (transient)


| Key pattern                                            | Identifier in key                       | Contents                            | TTL                                  |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------- | ------------------------------------ |
| `ratelimit:auth:request:ip:{hashIp}`                   | Hashed IP                               | Request timestamps (sorted set)     | Auth request window (default 15 min) |
| `ratelimit:auth:verify:ip:{hashIp}`                    | Hashed IP                               | Same                                | Auth verify window                   |
| `ratelimit:user:email:ip:{hashIp}`                     | Hashed IP                               | Same                                | Email verification window            |
| `ratelimit:user:phone:ip:{hashIp}`                     | Hashed IP                               | Same                                | Phone verification window            |
| `ratelimit:subscription:catalog-prices:{clientIp}`     | **Raw IP**                              | Same                                | Catalog prices rate limit            |
| `ratelimit:subscription:confirm:{clientIp}:{clientIp}` | **Raw IP** (action name also embeds IP) | Same                                | Checkout confirm rate limit          |
| `mfa:pending:{token}`                                  | —                                       | JSON including **full `ipAddress`** | **5 minutes**                        |
| `geo:ip:{hashIpForGeo}`                                | Keyed hash                              | Jurisdiction JSON (no raw IP)       | `GEO_CACHE_TTL` (default 24h)        |
| `geo:ip_neg:{hashIpForGeo}`                            | Keyed hash                              | Negative cache marker               | 5 minutes                            |


**Note:** Redis session cache (`session:{sessionId}`) does **not** include IP for either account or Alias sessions — see `CachedSessionData` in `apps/api/src/models/session.ts`.

`global:ip` rate-limit action is defined in config but **not currently invoked** by application code.

**Code references:** `apps/api/src/services/rate-limit.service.ts`, `apps/api/src/routes/auth/controller.ts`, `apps/api/src/routes/users/controller.ts`, `apps/api/src/routes/account/subscription/controller.ts`, `apps/api/src/db/redis.ts`.

---

### Third-party disclosure (IP leaves your deployment)


| Service                | When                                    | What is sent                                                     | Operator controls                                                                                                           |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **IPLocate.io**        | Geo lookup (`resolveJurisdiction`)      | **Full IP** in request URL                                       | `GEO_ENABLED`, `IPLOCATE_`* env vars; disable geo to avoid lookups                                                          |
| **NCMEC CyberTipline** | Manual/automated CSAM report submission | **Full upload IP** in XML (`ipCaptureEvent`)                     | `CYBERTIPLINE_`* credentials; only when reporting                                                                           |
| **Stripe**             | Checkout / billing                      | Stripe may record customer IP from browser/session independently | Standard Stripe data processing; not written to Adieuu Mongo from `getClientIp()` except subscription rate-limit keys above |


Age verification providers (`apps/api/src/services/age-verification/`) do **not** receive client IP from the API layer in current code.

**Code references:** `apps/api/src/services/geo/iplocate.client.ts`, `apps/api/src/services/cybertipline.service.ts`, `apps/api/src/services/cybertipline-report-builder.service.ts`, `apps/api/src/routes/moderation/controller.ts`.

---

### Application logs


| Event                                       | Field                      | Content                    |
| ------------------------------------------- | -------------------------- | -------------------------- |
| OTP request — IP sanitization changed input | `originalLength`, `deltas` | Length only, not raw IP    |
| OTP request — identifier sanitization       | `ipHash`                   | `hashIp()` value           |
| IPLocate non-200                            | `ipPrefix`                 | First two IPv4 octets only |
| IP sanitization before upload storage       | `originalLength`, `deltas` | Length only                |


Structured logs do not routinely include full client IPs. Log retention depends on your deployment (stdout, CloudWatch, etc.) — **not** controlled by application code.

**Code references:** `apps/api/src/routes/auth/controller.ts`, `apps/api/src/services/geo/iplocate.client.ts`, `apps/api/src/utils/sanitize.ts`.

---

### Exposed to users and admins (not additional storage)


| Surface                         | Data shown                                 | Source                                                                                            |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Account → Overview              | `maskedIp` for **current** request         | Computed per `GET /api/auth/session`; not read from DB                                            |
| Account → Security → Sessions   | Masked `ipAddress` per **account** session | `maskIpAddress()` on `sessions.ipAddress` (account rows only; Alias sessions are not listed here) |
| Admin → User profile → Sessions | Masked IP                                  | Same masking as account Security                                                                  |
| Session API `geo`               | Jurisdiction/country only                  | `users.geo` without `ipHash`                                                                      |


Masking rules: IPv4 `a.b.*.`*; IPv6 first two groups + `:*` (`apps/api/src/models/session.ts`).

---

### Request-time only (not persisted by Adieuu)

These paths call `getClientIp()` for policy decisions but do not add new IP rows beyond the stores above:

- Compliance VPN attestation (`POST /api/compliance/vpn-attestation`) — compares `hashIpForGeo(ip)` to pending state.
- Session polling / `evaluateComplianceOnAccess` on authenticated requests.
- Upload presigned URL routes — IP passed into upload services (stored as `uploadIpAddress` when valid).
- Subscription catalog / checkout confirm — rate limiting only (see Redis table).

---

### Infrastructure outside this repository

Self-hosters should also account for:

- **Reverse proxy / load balancer access logs** (Caddy, nginx, ALB) — typically full client IP per request.
- **CDN / WAF logs** if media or static assets are fronted.
- **MongoDB and Redis backups** — include all persistent fields above.
- **S3 evidence buckets** — CSAM evidence archives; IP may appear in associated `platform_reports` metadata, not necessarily in object bytes.

---

## Hashing secrets (self-hosting)


| Function         | Secret env            | Used for                                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------------------------ |
| `hashIp()`       | `SESSION_SECRET`      | Auth rate limits, auth log `ipHash`                                            |
| `hashIpForGeo()` | `ACCOUNT_HASH_SECRET` | `users.geo`, compliance VPN state, compliance audit logs, Redis geo cache keys |


Rotate these only with a planned migration — existing hashes will not match new IPs after rotation.

---

## Configuration checklist (IP minimization)


| Goal                             | Action                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Accurate IP behind proxy         | `TRUST_PROXY_HEADERS=true`, trustworthy proxy config                                                      |
| Reduce third-party IP sharing    | Disable geo (`GEO_ENABLED` / platform settings) or omit IPLocate API key                                  |
| Avoid dev IP override in prod    | Do not set `DEV_CLIENT_IP` in production                                                                  |
| Limit CyberTipline exposure      | Reports only when legally required; use test endpoint in non-prod                                         |
| Understand session IP visibility | Account users see masked login IPs for **account** sessions in Security UI; Alias sessions never store IP |


---

## Planned sections

The following PII categories will be documented in future updates:

- **Email addresses**
- **Phone numbers**
- **Government / age-verification identifiers**
- **User-generated content and media**
- **Billing and payment metadata**

---

*Last updated from codebase audit: June 2026. When adding features that touch PII, update this file in the same PR.*