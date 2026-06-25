# ECS environment: secrets vs Terraform `environment`

This document lists **environment variables** the **API** (`apps/api`) and **chat** (`apps/chat`) read from the OS environment, and how to supply them on AWS **ECS Fargate** using:

- **`api_container_secrets` / `chat_container_secrets`** — Secrets Manager ARNs (`valueFrom`), typically **one JSON secret per service** with multiple keys.
- **`api_environment` / `chat_environment`** in `terraform.tfvars` — **non-sensitive** plain strings (Terraform `environment` in the task definition).
- **`node_env`** (Terraform variable) — sets `NODE_ENV` on both tasks (do not duplicate in `api_environment` / `chat_environment`).
- **`create_elasticache_redis`** — defaults to **true**: Terraform provisions **Valkey** (default **`redis_engine_version` = `8.2`**) and injects **`REDIS_URL`** unless you override it in `api_environment` / `chat_environment`. Set **`create_elasticache_redis = false`** only when **`REDIS_URL`** is supplied another way (external cache).

**Sources of truth in code:** `apps/api/src/config/index.ts`, `apps/chat/src/config/index.ts` (and `validateProductionConfig` in each).

**Reserved in Terraform (do not put in `api_environment` / `chat_environment`):**

| Variable | Reason |
|----------|--------|
| API: `PORT`, `HOST`, `NODE_ENV` | Set by the ECS task definition (`PORT`/`HOST` match the container; `NODE_ENV` from Terraform `node_env`). |
| Chat: `CHAT_PORT`, `CHAT_HOST`, `NODE_ENV` | Same pattern for the chat container. |

**Terraform-injected for the API (merged after `api_environment`; do not duplicate in `api_environment`):**

| Variable | Reason |
|----------|--------|
| `MAX_REQUEST_BODY_BYTES` | Set from Terraform `api_max_request_body_bytes` (default `256000`, 250 KiB; same as `DEFAULT_MAX_REQUEST_BODY_BYTES` in `@adieuu/shared`). Aligns the Bun router with the ALB WAF rule `block-request-body-over-max`. Change the limit via `api_max_request_body_bytes` in `terraform.tfvars`, not by setting this key in `api_environment`. |

**NCMEC CyberTipline (moderator LE reports):** API hosts are **hardcoded** in the application (`exttest.cybertip.org` for test, `report.cybertip.org` for production). The active host is selected by Mongo platform setting **`platform-ncmec-cybertipline-env`** (`test` | `production`, default `test`), editable in the admin UI under Age Verification. Precedence: platform setting → optional `CYBERTIPLINE_ENV` env guard → default `test`. No Terraform URL variable is required.

**Media stack moderation:** When `enable_media_stack = true`, uploads are checked by the **CSAM hash pipeline** (NCMEC DynamoDB + optional Arachnid Shield). Which tiers run is controlled by the Mongo platform setting `platform-csam-hash-services` (default `["arachnid_shield"]` on API boot).

**CyberTipline credentials** — one ESP credential set in **`adieuu/<env>/api`**, mapped via `api_container_secrets` (see keys below). The same username/password/reporter fields are used for both test and production endpoints. **Arachnid Shield** credentials go in **`adieuu/<env>/media-processor`** (same ARN as `media_db_mongodb_secret_arn`).

Optional **`CYBERTIPLINE_ENV`** in `api_environment`: `test` or `production`. When set, the API rejects a mismatch between this value and the resolved endpoint (safety check).

**Local dev vs production (no separate staging stack):** Adieuu currently runs **local development** and **production ECS** only.

| Where | Endpoint | Credentials | How to test LE filing |
|-------|----------|-------------|------------------------|
| **Local dev** | Platform setting or default **test** (hardcoded exttest URL) | `CYBERTIPLINE_*` in `.env`, or `CYBERTIPLINE_TEST_*` aliases for integration tests | `CYBERTIPLINE_INTEGRATION_TEST=1` + `bun test …/cybertipline.integration.test.ts`; or moderation UI with platform setting on **test** |
| **Production** | Platform setting `platform-ncmec-cybertipline-env` (admin UI) | `CYBERTIPLINE_*` in `adieuu/<env>/api` | Keep setting on **test** until validated; switch to **production** when ready to file live reports (same credentials) |

**Optional in `api_environment` (not Terraform-managed by default):**

| Variable | Reason |
|----------|--------|
| `ANONYMOUS_MAX_REQUEST_BODY_BYTES` | App-side stricter cap (default `16384`, 16 KiB) for JSON bodies when no `adieuu_session` can be loaded, except allowlisted paths (e.g. `POST /api/webhooks/stripe`). Capped in code to `MAX_REQUEST_BODY_BYTES`. ALB WAF still uses a single `api_max_request_body_bytes` for all paths. |

If you add these keys to the maps anyway, they are **ignored** when building the task definition so ECS does not receive duplicate names.

---

## 1. Sensitive values → Secrets Manager (JSON secret per service)

Create **two** secrets (names are yours; examples below):

| Secret (example name) | Used by | Terraform wiring |
|-------------------------|---------|------------------|
| `adieuu/<env>/api` | API task | Each JSON key → `api_container_secrets` entry: env name → `arn:...:secret:...:KeyName::` |
| `adieuu/<env>/chat` | Chat task | Same pattern in `chat_container_secrets` |

### Recommended JSON keys for **`api`** secret

Store strings the app must not log in git. Typical keys:

| Key | Notes |
|-----|--------|
| `MONGODB_URI` | Atlas or other Mongo connection string (contains password). |
| `CSRF_SECRET` | Required in production (`validateProductionConfig`). HMAC key for session-bound CSRF tokens (`adieuu_csrf` cookie + `X-CSRF-Token` header). |
| `SESSION_SECRET` | Required in production. |
| `OTP_SECRET` | Required in production. |
| `ACCOUNT_HASH_SECRET` | Required in production. HMAC key for deriving `accountHash` (non-reversible account identifier). **Non-rotatable:** changing this invalidates all existing identity logins. |
| `TOKEN_SIGNING_KEY` | Required in production. HMAC key for signing short-lived JWTs that bridge account→identity transitions. Rotatable: clients get a fresh token on next `GET /api/auth/session`. |
| `AWS_ACCESS_KEY_ID` | SES mail in production (unless you use a different email path). |
| `AWS_SECRET_ACCESS_KEY` | Pair with above. |
| `TEXTMAGIC_USERNAME` | SMS in production. |
| `TEXTMAGIC_API_KEY` | SMS in production. |
| `KLIPY_API_KEY` | Required in production. Klipy GIF/sticker API key (https://partner.klipy.com/). |
| `IPLOCATE_API_KEY` | IPLocate.io API key when IP geolocation is enabled (`apps/api` `config.geo`). Server-side only. |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` / `sk_live_...`). Required when `STRIPE_ENABLED=true`. Server-side only. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`). Required when `STRIPE_ENABLED=true`. |
| `VERIFYMY_API_KEY` | VerifyMy API key (server-side only). Sandbox and production use separate key pairs. |
| `VERIFYMY_API_SECRET` | VerifyMy API secret (HMAC signing and PII encryption). Keep in Secrets Manager alongside the key. |
| `CYBERTIPLINE_USERNAME` | NCMEC CyberTipline API username (when media stack / LE reporting enabled). |
| `CYBERTIPLINE_PASSWORD` | NCMEC CyberTipline API password. |
| `CYBERTIPLINE_REPORTER_FIRST_NAME` | ESP reporter first name for CyberTipline filings. |
| `CYBERTIPLINE_REPORTER_LAST_NAME` | ESP reporter last name. |
| `CYBERTIPLINE_REPORTER_EMAIL` | ESP reporter email (e.g. `abuse@yourdomain.com`). |
| `CYBERTIPLINE_COMPANY_TEMPLATE` | Optional CyberTipline company block text. |
| `CYBERTIPLINE_TERMS_OF_SERVICE_URL` | Optional terms URL for CyberTipline XML. |
| `CYBERTIPLINE_LEGAL_URL` | Optional legal URL for CyberTipline XML. |
**Note:** `CF_SIGNING_PRIVATE_KEY` is not part of the user-managed `adieuu/<env>/api` JSON. Terraform generates the signing key and injects it via a dedicated Secrets Manager secret when `enable_cloudfront_signed_urls = true`. Do not add it manually.

Use **`REDIS_URL`** in Secrets Manager (or plain env) **only** when Redis is **not** the Terraform-managed ElastiCache cluster — e.g. you set **`create_elasticache_redis = false`** and point **`REDIS_URL`** at an external endpoint yourself.

### Recommended JSON keys for **`media-processor`** secret (when `enable_media_stack = true`)

Used by the media-db-writer and media-processor Lambdas (`media_db_mongodb_secret_arn` in tfvars). Typical keys:

| Key | Notes |
|-----|--------|
| `MONGODB_URI` | MongoDB connection string for media upload / moderation writes. |
| `ARACHNID_USERNAME` | Project Arachnid Shield API username (Tier-2 CSAM hash checks). |
| `ARACHNID_PASSWORD` | Project Arachnid Shield API password. |

Key names for Arachnid are overridable via `media_credentials_arachnid_username_key` / `media_credentials_arachnid_password_key` in tfvars (defaults `ARACHNID_USERNAME` / `ARACHNID_PASSWORD`).

### Recommended JSON keys for **`chat`** secret

| Key | Notes |
|-----|--------|
| `MONGODB_URI` | Same DB as API (or read-only URI if you split roles). |

**`REDIS_URL`** belongs here only for the **external Redis** case above; with the default stack, Terraform injects it from ElastiCache.

**Production validation (chat):** `NODE_ENV=production` requires non-default **`MONGODB_URI`** and **`REDIS_URL`** (not localhost defaults).

---

## 2. Non-sensitive values → `api_environment` / `chat_environment`

Set these in **`terraform.tfvars`** as maps. Values are **plain text** in the task definition (suitable for URLs, feature flags, rate-limit numbers, public WebAuthn config).

### API (`apps/api`) — additional non-secret keys

| Variable | Purpose (short) |
|----------|------------------|
| `APP_NAME` | Product name in emails / labels. |
| `CORS_ORIGINS` | Comma-separated browser origins (e.g. `https://app.example.com`). Entries can include one `*` in the host for subdomains, e.g. `https://*.example.com` (see `apps/api/src/utils/corsOrigins.ts`). Non-default ports and LAN IPs need exact origins. Self-hosted or custom web origins: add each `https://` origin here (or use Terraform `cors_additional_origins`; see `infra/aws/terraform/variables.tf`). |
| `CORS_CREDENTIALS` | `true` / `false`. |
| `COOKIE_DOMAIN` | e.g. `.example.com` for subdomains (`process.env.COOKIE_DOMAIN` in code). |
| `CSRF_ENFORCEMENT` | CSRF rollout mode: `off` (skip), `warn` (log failures, allow request — **default**), or `enforce` (403 on failure). Ship with `warn`, monitor logs, then set `enforce` in production once clients send `X-CSRF-Token` (shared `ApiClient` does this automatically when `adieuu_csrf` is present). |
| `CORS_ORIGIN` | Deprecated; prefer `CORS_ORIGINS`. |
| `MONGODB_DB_NAME` | Database name (default `adieuu`). |
| `MONGODB_MIN_POOL_SIZE` | String integer. |
| `MONGODB_MAX_POOL_SIZE` | String integer. |
| `REDIS_KEY_PREFIX` | Redis key prefix (default `adieuu:`). |
| `EMAIL_PROVIDER` | `ses` or `console`. |
| `EMAIL_FROM_ADDRESS` | From address for SES. |
| `AWS_REGION` | Region for SES (same as deployment region unless you use another). |
| `SMS_PROVIDER` | `textmagic` or `console`. |
| `SMS_FROM_NAME` | SMS sender label. |
| `WEB_APP_URL` | Public web app URL for links (`https://...`). |
| `WEBAUTHN_RP_ID` | Passkeys RP ID (hostname, no scheme). |
| `WEBAUTHN_ORIGINS` | Comma-separated allowed WebAuthn origins (concrete URLs; patterns are not applied here—add each origin your clients use). |
| `REQUIRE_DATABASE` | `true` to fail startup if DB unreachable. |
| `INITIALIZE_COLLECTIONS` | `true` to create collections on boot (use carefully in prod). |
| `RATE_LIMIT_ENABLED` | `true` / `false`. |
| `RATE_LIMIT_AUTH_REQUEST_IDENTIFIER` | Integer as string (default `3`). |
| `RATE_LIMIT_AUTH_REQUEST_IDENTIFIER_WINDOW` | Window seconds (default `900`). |
| `RATE_LIMIT_AUTH_REQUEST_IP` | Default `10`. |
| `RATE_LIMIT_AUTH_REQUEST_IP_WINDOW` | Default `900`. |
| `RATE_LIMIT_AUTH_VERIFY_IDENTIFIER` | Default `5`. |
| `RATE_LIMIT_AUTH_VERIFY_IDENTIFIER_WINDOW` | Default `900`. |
| `RATE_LIMIT_AUTH_VERIFY_IP` | Default `20`. |
| `RATE_LIMIT_AUTH_VERIFY_IP_WINDOW` | Default `900`. |
| `RATE_LIMIT_GLOBAL_USER` | Default `100`. |
| `RATE_LIMIT_GLOBAL_USER_WINDOW` | Default `60`. |
| `RATE_LIMIT_GLOBAL_IP` | Default `1000`. |
| `RATE_LIMIT_GLOBAL_IP_WINDOW` | Default `60`. |
| `GEO_LOOKUP_ENABLED` | `true` / `false` (default `false`). Env default only: the **`platform-geo-lookup-enabled`** platform setting in Mongo overrides this when present. |
| `TRUST_PROXY_HEADERS` | `true` / `false` (default `false`). Set **`true`** in production behind the ALB so **`X-Forwarded-For`** / **`X-Real-IP`** reflect the real client; if `NODE_ENV=production` and this is `false`, geo resolution returns null (see `apps/api` geo service). |
| `GEO_CACHE_TTL_SECONDS` | Redis TTL for cached IP lookups (default `86400`). |
| `GEO_RECHECK_INTERVAL_DAYS` | Per-user staleness window before refresh at login (default `30`). |
| `IPLOCATE_BASE_URL` | Optional; default `https://www.iplocate.io/api/lookup`. |
| `IPLOCATE_TIMEOUT_MS` | Optional; default `2500`. |
| `STRIPE_ENABLED` | `true` / `false` (default `false`). Routes return 503 when disabled; flip after Stripe Dashboard setup. |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...` / `pk_live_...`). Safe for client; exposed via subscription endpoint. |
| `STRIPE_PRICE_ACCESS_ANNUAL` | Stripe Price ID for the Access annual subscription. |
| `STRIPE_PRICE_INSIDER_ANNUAL` | Stripe Price ID for the Insider annual subscription. |
| `STRIPE_PRICE_VANGUARD_LIFETIME` | Stripe Price ID for the Vanguard one-time lifetime purchase. |
| `STRIPE_PRICE_FOUNDER_LIFETIME` | Stripe Price ID for the Founder one-time lifetime purchase. |
| `STRIPE_SUCCESS_URL` | Optional; defaults to `WEB_APP_URL/checkout/complete?status=success&session_id={CHECKOUT_SESSION_ID}`. |
| `STRIPE_CANCEL_URL` | Optional; defaults to `WEB_APP_URL/checkout/complete?status=cancelled`. |
| `STRIPE_PORTAL_RETURN_URL` | Optional; defaults to `WEB_APP_URL/account/subscription`. |
| `API_BASE_URL` | Public API URL for OAuth callbacks (e.g. VerifyMy redirect). Defaults to `http://localhost:<PORT>` in dev. |
| `VERIFYMY_ENVIRONMENT` | `sandbox` or `production` (default `sandbox`). Sandbox and production require separate key pairs in Secrets Manager. |
| `VERIFYMY_SANDBOX_BASE_URL` | Optional; default `https://sandbox.verifymyage.com`. |
| `VERIFYMY_PRODUCTION_BASE_URL` | Optional; default `https://oauth.verifymyage.com`. |
| `VERIFYMY_TIMEOUT_MS` | Optional; default `10000`. |

**Platform settings (MongoDB, not env):** The API stores typed configuration in the `platform_settings` collection (see `apps/api/src/constants/platform-settings-keys.ts`). Most knobs are Mongo-only; **geo** also reads **`platform-geo-lookup-enabled`** (boolean) and **age verification** reads **`AGE_VERIFICATION_ENABLED`** (boolean, default `false`) so operators can toggle these features without redeploying. **NCMEC CyberTipline** reads **`platform-ncmec-cybertipline-env`** (`test` | `production`, default `test`) for moderator LE submissions. The auth allowlist is edited via **`/api/admin/platform-settings`** (identity session with `manage-platform-settings`).

**Platform RBAC (identities, not platform_settings):** Staff roles (`admin`, `moderator`, `support_agent`) are stored on each identity document’s **`platformRoles`** array in the `identities` collection — not in platform settings. Before using admin routes, bootstrap at least one admin in MongoDB (see [Platform RBAC](../../apps/api/README.md#platform-rbac) in `apps/api/README.md`). Role assignment after bootstrap uses **`POST /api/admin/identities/:id/roles`** and related endpoints (requires identity session + `manage-roles`).

### Chat (`apps/chat`) — additional non-secret keys

| Variable | Purpose (short) |
|----------|------------------|
| `MONGODB_DB_NAME` | DB name. |
| `MONGODB_MIN_POOL_SIZE` | String integer (chat defaults differ from API). |
| `MONGODB_MAX_POOL_SIZE` | String integer. |
| `REDIS_KEY_PREFIX` | Redis prefix. |
| `WS_IDLE_TIMEOUT` | Seconds (string). |
| `WS_MAX_PAYLOAD_LENGTH` | Bytes (string). |
| `WS_COMPRESSION` | `true` / `false`. |
| `PRESENCE_HEARTBEAT_TTL` | Seconds (string). |
| `PRESENCE_HEARTBEAT_INTERVAL` | Seconds (string). |
| `REQUIRE_DATABASE` | `true` / `false`. |

---

## 3. `terraform.tfvars` pattern

- **`node_env`** — set to `production` when you want strict app validation and live settings.
- **`api_environment`** / **`chat_environment`** — non-sensitive map (see `terraform.tfvars.example` in `infra/aws/terraform/`).
- **`api_container_secrets`** / **`chat_container_secrets`** — map of **env var name → full `valueFrom` ARN** (including `:JsonKey::` for JSON secrets).

After changing **Secrets Manager** values, **replace ECS tasks** (new deployment) so containers pick up new data — same as changing Terraform env.

### Self-hosting and configurable web/desktop URLs

When clients call the API from **arbitrary** origins (user-configured service URLs, LAN IPs, or extra web builds), each browser `Origin` must be allowed: add exact origins (or `https://*.yourdomain.com` patterns) to `CORS_ORIGINS` / `cors_additional_origins`, and list the same concrete origins in **`WEBAUTHN_ORIGINS`** for passkeys. Cookies may need **`COOKIE_DOMAIN`** / **`SameSite`** review when the web UI and API are on different sites.

---

## 4. Related files

- [infra/aws/README.md](../../infra/aws/README.md) — Terraform layout and commands.
- [aws.md](./aws.md) — broader AWS architecture.
