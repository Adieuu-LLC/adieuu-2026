# Video moderation, MP4 pipeline, and media limits

## Goals

- **Full-video moderation** for conversation attachments: scan copy in S3, Rekognition `StartContentModeration` (async), SNS + completion Lambda, `GetContentModeration` → existing media-db writer; delete scan object after decision.
- **MP4-only** on the server; **client** may accept WebM/MOV and **transcode to MP4** before upload.
- **Duration limits**: configurable **platform-wide** (`platform_settings`) and **per account** (subscription-ready); **default 5 minutes**; end users do not pick a custom duration.
- **Operational hardening**: separate completion function, reserved concurrency where appropriate, CloudWatch alarms (Lambda concurrency, throttles, duration, optional queue age) aligned with existing SNS alarm patterns.

## Privacy and session architecture (required)

**Identity-scoped API routes must not load the `User` / account document** to enforce subscription or platform-derived limits. The account layer must never gain direct access to identity records; symmetrically, the identity hot path must not join back to the account.

This mirrors **`maxIdentities`**:

1. While the caller holds an **account** session, `GET /api/auth/session` (and similar) loads the user, resolves **effective limits** (platform ceiling + per-account overrides), and mints a **short-lived signed bridging JWT** carrying only what the identity flow needs (`sub` = `accountHash`, `maxIdentities`, and **effective `maxVideoDurationSeconds`**).
2. On **identity login** or **create identity + auto-login**, the API verifies that JWT, then writes the resolved **`maxVideoDurationSeconds`** onto the **identity session document** (and cache) alongside `identityId` and `accountHash`.
3. Upload and messaging handlers on identity routes read **`maxVideoDurationSeconds` from `IdentitySessionData`** (with a safe default for legacy sessions), not from `User`.

No `userId` is stored on identity sessions; account-derived quotas are **bound once** at session creation, like other bridge-token claims.

## Implementation checklist

- [ ] Platform setting key + default (300 seconds).
- [ ] Optional `UserDocument.maxVideoDurationSeconds`; resolve `min(platform, user ?? platform)` when minting the signed token.
- [ ] Extend `AccountTokenPayload` + `createSignedToken` / `verifySignedToken` (backward-compatible default when the claim is missing).
- [ ] Persist `maxVideoDurationSeconds` on identity sessions; thread through `createIdentitySession`, `loginToIdentity`, `createIdentity` (auto-login).
- [ ] Use session value in E2E / upload validation (and later client-side duration checks against the same effective limit).
- [ ] Terraform: video moderation completion path, IAM, alarms (see `infra/aws/terraform/media.tf`, `alarms.tf`).

## References

- `apps/api/src/services/account-token.service.ts` — bridging token pattern.
- `apps/api/src/services/session.service.ts` — `createIdentitySession`, `IdentitySessionData`.
- `apps/api/src/routes/auth/controller.ts` — `getSessionHandler` mints signed token.
