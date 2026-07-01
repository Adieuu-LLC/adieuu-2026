/**
 * Application Configuration Module
 * 
 * Provides centralized, type-safe access to environment variables with
 * sensible defaults for development and strict validation for production.
 * 
 * All configuration is accessed through the exported `config` object which
 * is frozen (immutable) at runtime.
 * 
 * @module config
 * 
 * @example
 * ```typescript
 * import { config } from './config';
 * 
 * // Access configuration values
 * console.log(config.port); // 4000
 * console.log(config.mongodb.uri); // 'mongodb://localhost:27017'
 * 
 * // Validate production config on startup
 * validateProductionConfig();
 * ```
 */

import {
  DEFAULT_ANONYMOUS_MAX_REQUEST_BODY_BYTES,
  DEFAULT_MAX_REQUEST_BODY_BYTES,
} from '../constants/http';

/**
 * Retrieves a required environment variable.
 * 
 * Throws an error if the variable is not set, ensuring critical
 * configuration is always available.
 * 
 * @param name - The environment variable name
 * @returns The environment variable value
 * @throws Error if the environment variable is not set
 * 
 * @example
 * ```typescript
 * const apiKey = requireEnv('API_KEY'); // Throws if not set
 * ```
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Retrieves an optional environment variable with a default value.
 * 
 * Returns the default value if the environment variable is not set or empty.
 * 
 * @param name - The environment variable name
 * @param defaultValue - Value to return if environment variable is not set
 * @returns The environment variable value or the default
 * 
 * @example
 * ```typescript
 * const host = optionalEnv('HOST', '0.0.0.0'); // Uses default if not set
 * ```
 */
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Retrieves an optional environment variable as an integer.
 * 
 * Parses the environment variable as base-10 integer. Returns the default
 * if not set, or throws if the value cannot be parsed as an integer.
 * 
 * @param name - The environment variable name
 * @param defaultValue - Integer value to return if environment variable is not set
 * @returns The parsed integer value or the default
 * @throws Error if the value is set but is not a valid integer
 * 
 * @example
 * ```typescript
 * const port = optionalEnvInt('PORT', 4000); // Parses as integer
 * ```
 */
function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}

/**
 * Retrieves an optional environment variable as a boolean.
 * 
 * Interprets 'true' (case-insensitive) or '1' as true, all other values as false.
 * Returns the default if the environment variable is not set.
 * 
 * @param name - The environment variable name
 * @param defaultValue - Boolean value to return if environment variable is not set
 * @returns The parsed boolean value or the default
 * 
 * @example
 * ```typescript
 * const debug = optionalEnvBool('DEBUG', false); // true if DEBUG=true or DEBUG=1
 * ```
 */
function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

type CsrfEnforcement = 'off' | 'warn' | 'enforce';

function optionalEnvCsrfEnforcement(name: string, defaultValue: CsrfEnforcement): CsrfEnforcement {
  const value = process.env[name];
  if (!value) return defaultValue;
  if (value === 'off' || value === 'warn' || value === 'enforce') return value;
  throw new Error(`Environment variable ${name} must be one of: off, warn, enforce`);
}

const _maxRequestBodyBytes = optionalEnvInt('MAX_REQUEST_BODY_BYTES', DEFAULT_MAX_REQUEST_BODY_BYTES);
const _anonymousMaxRequestBodyBytes = Math.min(
  optionalEnvInt('ANONYMOUS_MAX_REQUEST_BODY_BYTES', DEFAULT_ANONYMOUS_MAX_REQUEST_BODY_BYTES),
  _maxRequestBodyBytes,
);

/**
 * Application configuration object.
 * 
 * Provides type-safe access to all application configuration values.
 * Values are read from environment variables at module load time.
 * The object is frozen (as const) to prevent runtime modifications.
 * 
 * Configuration sections:
 * - Server: Port, host, and environment settings
 * - CORS: Cross-origin resource sharing configuration
 * - MongoDB: Database connection and pool settings
 * - Redis: Cache and session store settings
 * - Security: Secrets for CSRF, sessions, and OTP
 * - Email: AWS SES configuration for sending emails
 * - SMS: TextMagic configuration for sending SMS
 * - Features: Feature flags for conditional functionality
 * 
 * @example
 * ```typescript
 * import { config } from './config';
 * 
 * // Server configuration
 * const server = Bun.serve({ port: config.port });
 * 
 * // Database configuration
 * const client = new MongoClient(config.mongodb.uri);
 * 
 * // Check environment
 * if (config.env === 'production') {
 *   // Production-only logic
 * }
 * ```
 */
export const config = {
  /** Application name (used in emails, TOTP labels, etc.) */
  appName: optionalEnv('APP_NAME', 'Adieuu'),
  /** Current environment: 'development', 'production', or 'test' */
  env: optionalEnv('NODE_ENV', 'development'),
  /** HTTP server port */
  port: optionalEnvInt('PORT', 4000),
  /** HTTP server host/interface to bind to */
  host: optionalEnv('HOST', '0.0.0.0'),

  /**
   * Maximum request body size in bytes (JSON and raw body) for authenticated
   * clients, signed webhooks, and other allowlisted paths. In AWS, Terraform
   * sets `MAX_REQUEST_BODY_BYTES` from `api_max_request_body_bytes` (must match ALB WAF).
   */
  maxRequestBodyBytes: _maxRequestBodyBytes,

  /**
   * Max body size in bytes for requests with no resolvable `adieuu_session`
   * (except allowlisted paths such as `/api/webhooks/stripe`). Capped to `maxRequestBodyBytes`.
   * @see `resolveRequestBodyByteLimit` in the router
   */
  anonymousMaxRequestBodyBytes: _anonymousMaxRequestBodyBytes,

  /** CORS configuration */
  cors: {
    /**
     * Allowed origins for cross-origin requests.
     * Comma-separated list of origins, or '*' for all origins (dev only).
     * One `*` is allowed in the host for subdomain matching, e.g. `https://*.example.com`
     * matches `https://app.example.com` (see `utils/corsOrigins.ts`). Non-default ports
     * and LAN IPs need exact entries (e.g. `http://192.168.1.10:3000`).
     * @example 'http://localhost:3000,http://localhost:5173'
     * @example 'https://app.example.com,https://*.example.com'
     */
    origins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173'),
    /** Whether to allow credentials (cookies, auth headers) */
    credentials: optionalEnvBool('CORS_CREDENTIALS', true),
  },

  /** Cookie configuration for cross-subdomain sharing */
  cookie: {
    /**
     * Domain for cookies to enable sharing across subdomains.
     * Set to parent domain with leading dot for subdomain sharing.
     * Leave empty for single-domain (localhost) development.
     * @example '.adieuu.com' for api.adieuu.com + chat.adieuu.com + ws.adieuu.com
     */
    domain: process.env.COOKIE_DOMAIN || '',
  },

  /** @deprecated Use cors.origins instead */
  corsOrigin: optionalEnv('CORS_ORIGIN', optionalEnv('CORS_ORIGINS', 'http://localhost:3000')),

  /** MongoDB database configuration */
  mongodb: {
    /** MongoDB connection URI */
    uri: optionalEnv('MONGODB_URI', 'mongodb://localhost:27017'),
    /** Database name to use */
    dbName: optionalEnv('MONGODB_DB_NAME', 'adieuu'),
    /** Minimum number of connections in the pool */
    minPoolSize: optionalEnvInt('MONGODB_MIN_POOL_SIZE', 5),
    /** Maximum number of connections in the pool */
    maxPoolSize: optionalEnvInt('MONGODB_MAX_POOL_SIZE', 20),
  },

  /** Redis cache and session store configuration */
  redis: {
    /** Redis connection URL */
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    /** Key prefix for namespacing all Redis keys */
    keyPrefix: optionalEnv('REDIS_KEY_PREFIX', 'adieuu:'),
  },

  /** Security secrets and configuration */
  security: {
    /** Secret for CSRF token generation and validation */
    csrfSecret: optionalEnv('CSRF_SECRET', 'dev-csrf-secret-change-in-prod'),
    /** Secret for session token signing */
    sessionSecret: optionalEnv('SESSION_SECRET', 'dev-session-secret-change-in-prod'),
    /** Secret for OTP hashing (prevents rainbow table attacks) */
    otpSecret: optionalEnv('OTP_SECRET', 'dev-otp-secret-change-in-prod'),
    /**
     * HMAC key for deriving accountHash (non-reversible account identifier).
     * Non-rotatable: changing this invalidates all identity logins.
     * In production, injected by ECS from AWS Secrets Manager.
     */
    accountHashSecret: optionalEnv('ACCOUNT_HASH_SECRET', 'dev-account-hash-secret-change-in-prod'),
    /**
     * HMAC key for signing short-lived JWTs that bridge account→identity transitions.
     * Rotatable: clients get a fresh token on next GET /api/auth/session.
     * In production, injected by ECS from AWS Secrets Manager.
     */
    tokenSigningKey: optionalEnv('TOKEN_SIGNING_KEY', 'dev-token-signing-key-change-in-prod'),
  },

  /** CSRF protection (double-submit cookie + X-CSRF-Token header) */
  csrf: {
    /**
     * `off` skips validation; `warn` logs failures but allows requests;
     * `enforce` returns 403 on failure. Default `warn` for rollout monitoring.
     */
    enforcement: optionalEnvCsrfEnforcement('CSRF_ENFORCEMENT', 'warn'),
  },

  /** Email service configuration (AWS SES) */
  email: {
    /** Email provider: 'ses' or 'console' */
    provider: optionalEnv('EMAIL_PROVIDER', 'ses'),
    /** From address for outgoing emails */
    fromAddress: optionalEnv('EMAIL_FROM_ADDRESS', 'noreply@adieuu.com'),
    /** Friendly sender name shown in email clients */
    fromName: optionalEnv('EMAIL_FROM_NAME', 'Adieuu'),
    /** AWS region for SES */
    awsRegion: optionalEnv('AWS_REGION', 'us-east-1'),
    /** AWS access key ID (optional - uses default credential chain if not set) */
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    /** AWS secret access key (optional - uses default credential chain if not set) */
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  /** SMS service configuration (TextMagic) */
  sms: {
    /** SMS provider: 'textmagic' or 'console' */
    provider: optionalEnv('SMS_PROVIDER', 'textmagic'),
    /** TextMagic API username */
    textmagicUsername: process.env.TEXTMAGIC_USERNAME,
    /** TextMagic API key */
    textmagicApiKey: process.env.TEXTMAGIC_API_KEY,
    /** Sender name/ID for outgoing SMS */
    fromName: optionalEnv('SMS_FROM_NAME', 'Adieuu'),
  },

  /** S3 configuration for media uploads */
  s3: {
    /** S3 bucket for user-uploaded media (injected by Terraform as MEDIA_S3_BUCKET) */
    mediaBucket: process.env.MEDIA_S3_BUCKET || '',
    /** S3 bucket for E2E encrypted conversation media (injected by Terraform as E2E_MEDIA_S3_BUCKET) */
    e2eMediaBucket: process.env.E2E_MEDIA_S3_BUCKET || '',
    /** AWS region for the media bucket */
    region: optionalEnv('MEDIA_S3_REGION', optionalEnv('AWS_REGION', 'us-east-1')),
  },

  /** CDN configuration for serving processed media */
  cdn: {
    /** Base URL for the media CDN (e.g. https://media.adieuu.com) */
    mediaBaseUrl: process.env.MEDIA_CDN_URL || '',
  },

  /** CloudFront signed URL configuration (set when enable_cloudfront_signed_urls = true in Terraform) */
  cloudfront: {
    /** Domain for proxied media uploads via CloudFront (e.g. media.adieuu.com) */
    mediaUploadDomain: process.env.MEDIA_UPLOAD_DOMAIN || '',
    /** Domain for E2E encrypted media via CloudFront (e.g. e2e-media.adieuu.com) */
    e2eMediaDomain: process.env.E2E_MEDIA_DOMAIN || '',
    /** CloudFront key pair ID for signed URL generation */
    signingKeyPairId: process.env.CF_SIGNING_KEY_PAIR_ID || '',
    /** RSA private key PEM for CloudFront signed URL generation (from Secrets Manager) */
    signingPrivateKey: process.env.CF_SIGNING_PRIVATE_KEY || '',
  },

  /** Shared secret for Lambda media processor callbacks */
  mediaProcessorSecret: optionalEnv('MEDIA_PROCESSOR_SECRET', 'dev-media-processor-secret'),

  /** Web application URL for magic links and redirects */
  webAppUrl: optionalEnv('WEB_APP_URL', 'http://localhost:3000'),

  /** External API base URL (used for OAuth callbacks, webhooks, etc.) */
  apiBaseUrl: optionalEnv('API_BASE_URL', `http://localhost:${optionalEnvInt('PORT', 4000)}`),

  /** WebAuthn (Passkeys) configuration */
  webauthn: {
    /** Relying Party ID (usually the domain without protocol) */
    rpId: optionalEnv('WEBAUTHN_RP_ID', 'localhost'),
    /**
     * Expected origins for WebAuthn requests.
     * Comma-separated list of origins to support multiple platforms.
     * @example 'https://app.adieuu.com,capacitor://localhost,http://localhost'
     */
    origins: optionalEnv('WEBAUTHN_ORIGINS', 'http://localhost:5173,https://localhost').split(',').map(o => o.trim()).filter(Boolean),
  },

  /** Release manifest serving (downloads stack) */
  releaseManifests: {
    s3Bucket: process.env.RELEASE_MANIFESTS_S3_BUCKET ?? '',
    awsRegion: optionalEnv('AWS_REGION', 'us-east-1'),
  },

  /** Feature flags for conditional functionality */
  features: {
    /** 
     * Whether to require database connections on startup.
     * Set to false for local development without running databases.
     */
    requireDatabase: optionalEnvBool('REQUIRE_DATABASE', false),
    /**
     * Whether to initialize MongoDB collections on startup.
     * When true, creates the database and all collections if they don't exist.
     * Useful for ensuring consistent state in dev/staging environments.
     */
    initializeCollections: optionalEnvBool('INITIALIZE_COLLECTIONS', false),
  },

  /** IP geolocation configuration (IPLocate.io) */
  geo: {
    /** Whether geo lookups are enabled (platform setting overrides this) */
    enabled: optionalEnvBool('GEO_LOOKUP_ENABLED', false),
    iplocate: {
      /** IPLocate.io API key (server-side only) */
      apiKey: optionalEnv('IPLOCATE_API_KEY', ''),
      /** IPLocate.io API base URL */
      baseUrl: optionalEnv('IPLOCATE_BASE_URL', 'https://www.iplocate.io/api/lookup'),
      /** Request timeout in milliseconds */
      timeoutMs: optionalEnvInt('IPLOCATE_TIMEOUT_MS', 2500),
    },
    /** TTL for cached IP lookup results in Redis (seconds) */
    cacheTtlSeconds: optionalEnvInt('GEO_CACHE_TTL_SECONDS', 86_400),
    /** How often to re-check a user's jurisdiction (days) */
    recheckIntervalDays: optionalEnvInt('GEO_RECHECK_INTERVAL_DAYS', 30),
    /** Must be true in production for geo lookups to function (requires trusted proxy) */
    trustProxyHeaders: optionalEnvBool('TRUST_PROXY_HEADERS', false),
  },

  /** VerifyMy age verification provider configuration */
  verifymy: {
    /** VerifyMy API key (server-side only) */
    apiKey: optionalEnv('VERIFYMY_API_KEY', ''),
    /** VerifyMy API secret (server-side only, used for HMAC signing and PII encryption) */
    apiSecret: optionalEnv('VERIFYMY_API_SECRET', ''),
    /** Which VerifyMy environment to use (platform setting overrides this) */
    environment: optionalEnv('VERIFYMY_ENVIRONMENT', 'sandbox') as 'sandbox' | 'production',
    /** VerifyMy sandbox API base URL */
    sandboxBaseUrl: optionalEnv('VERIFYMY_SANDBOX_BASE_URL', 'https://sandbox.verifymyage.com'),
    /** VerifyMy production API base URL */
    productionBaseUrl: optionalEnv('VERIFYMY_PRODUCTION_BASE_URL', 'https://oauth.verifymyage.com'),
    /** Request timeout in milliseconds */
    timeoutMs: optionalEnvInt('VERIFYMY_TIMEOUT_MS', 10_000),
  },

  /** Klipy GIF/sticker API proxy configuration */
  klipy: {
    /** Klipy API key (required in production; empty disables the proxy in dev) */
    apiKey: process.env.KLIPY_API_KEY || '',
    /** Klipy API base URL (without trailing slash or API key segment) */
    baseUrl: optionalEnv('KLIPY_BASE_URL', 'https://api.klipy.com/api/v1'),
    /** Content safety filter level sent to Klipy (off | low | medium | high) */
    contentFilter: optionalEnv('KLIPY_CONTENT_FILTER', 'off'),
    /** Redis cache TTL for search results (seconds) */
    cacheTtlSearch: optionalEnvInt('KLIPY_CACHE_TTL_SEARCH', 30),
    /** Redis cache TTL for trending results (seconds) */
    cacheTtlTrending: optionalEnvInt('KLIPY_CACHE_TTL_TRENDING', 120),
  },

  /** LiveKit self-hosted SFU configuration */
  livekit: {
    /** Whether LiveKit integration is enabled */
    enabled: optionalEnvBool('LIVEKIT_ENABLED', false),
    /** LiveKit API key (must match the key configured on the LiveKit server) */
    apiKey: optionalEnv('LIVEKIT_API_KEY', ''),
    /** LiveKit API secret (must match the secret configured on the LiveKit server) */
    apiSecret: optionalEnv('LIVEKIT_API_SECRET', ''),
    /** LiveKit server WebSocket URL (e.g. ws://localhost:7880 or wss://livestream.adieuu.com) */
    url: optionalEnv('LIVEKIT_URL', ''),
    /** Token TTL in seconds */
    tokenTtlSec: optionalEnvInt('LIVEKIT_TOKEN_TTL_SEC', 600),
  },

  callReaper: {
    intervalSec: optionalEnvInt('CALL_REAPER_INTERVAL_SEC', 60),
    emptyTimeoutSec: optionalEnvInt('CALL_REAPER_EMPTY_TIMEOUT_SEC', 120),
    maxCallDurationSec: optionalEnvInt('CALL_REAPER_MAX_DURATION_SEC', 24 * 60 * 60),
  },

  /** Stripe subscription billing configuration */
  stripe: {
    /** Whether Stripe integration is enabled (routes return 503 when false) */
    enabled: optionalEnvBool('STRIPE_ENABLED', false),
    /** Stripe secret key (server-side only, never exposed to the client) */
    secretKey: optionalEnv('STRIPE_SECRET_KEY', ''),
    /** Stripe webhook signing secret */
    webhookSecret: optionalEnv('STRIPE_WEBHOOK_SECRET', ''),
    /** Stripe publishable key (safe for client, exposed via subscription config endpoint) */
    publishableKey: optionalEnv('STRIPE_PUBLISHABLE_KEY', ''),
    /** Stripe price IDs (created in the Stripe Dashboard, referenced by env) */
    prices: {
      accessAnnual: optionalEnv('STRIPE_PRICE_ACCESS_ANNUAL', ''),
      insiderAnnual: optionalEnv('STRIPE_PRICE_INSIDER_ANNUAL', ''),
      vanguardLifetime: optionalEnv('STRIPE_PRICE_VANGUARD_LIFETIME', ''),
      founderLifetime: optionalEnv('STRIPE_PRICE_FOUNDER_LIFETIME', ''),
    },
    successUrl: optionalEnv(
      'STRIPE_SUCCESS_URL',
      `${optionalEnv('WEB_APP_URL', 'http://localhost:3000')}/checkout/complete?status=success&session_id={CHECKOUT_SESSION_ID}`,
    ),
    cancelUrl: optionalEnv(
      'STRIPE_CANCEL_URL',
      `${optionalEnv('WEB_APP_URL', 'http://localhost:3000')}/checkout/complete?status=cancelled`,
    ),
    portalReturnUrl: optionalEnv(
      'STRIPE_PORTAL_RETURN_URL',
      `${optionalEnv('WEB_APP_URL', 'http://localhost:3000')}/account/subscription`,
    ),
    coupons: {
      mfaBasic: optionalEnv('STRIPE_COUPON_MFA_BASIC', ''),
      mfaHardwareKey: optionalEnv('STRIPE_COUPON_MFA_HARDWARE_KEY', ''),
    },
  },

  /**
   * Rate limiting configuration.
   * Set RATE_LIMIT_ENABLED=false to disable all rate limiting (dev only).
   */
  rateLimit: {
    /** Whether rate limiting is enabled (default: true, set false for dev) */
    enabled: optionalEnvBool('RATE_LIMIT_ENABLED', true),

    /** Auth OTP request limit per identifier (email/phone) */
    authRequestIdentifierLimit: optionalEnvInt('RATE_LIMIT_AUTH_REQUEST_IDENTIFIER', 3),
    /** Auth OTP request window in seconds */
    authRequestIdentifierWindow: optionalEnvInt('RATE_LIMIT_AUTH_REQUEST_IDENTIFIER_WINDOW', 900),

    /** Auth OTP request limit per IP */
    authRequestIpLimit: optionalEnvInt('RATE_LIMIT_AUTH_REQUEST_IP', 10),
    /** Auth OTP request per IP window in seconds */
    authRequestIpWindow: optionalEnvInt('RATE_LIMIT_AUTH_REQUEST_IP_WINDOW', 900),

    /** Auth verify limit per identifier */
    authVerifyIdentifierLimit: optionalEnvInt('RATE_LIMIT_AUTH_VERIFY_IDENTIFIER', 5),
    /** Auth verify per identifier window in seconds */
    authVerifyIdentifierWindow: optionalEnvInt('RATE_LIMIT_AUTH_VERIFY_IDENTIFIER_WINDOW', 900),

    /** Auth verify limit per IP */
    authVerifyIpLimit: optionalEnvInt('RATE_LIMIT_AUTH_VERIFY_IP', 20),
    /** Auth verify per IP window in seconds */
    authVerifyIpWindow: optionalEnvInt('RATE_LIMIT_AUTH_VERIFY_IP_WINDOW', 900),

    /** Global rate limit per user (authenticated) */
    globalUserLimit: optionalEnvInt('RATE_LIMIT_GLOBAL_USER', 100),
    /** Global per user window in seconds */
    globalUserWindow: optionalEnvInt('RATE_LIMIT_GLOBAL_USER_WINDOW', 60),

    /** Global rate limit per IP */
    globalIpLimit: optionalEnvInt('RATE_LIMIT_GLOBAL_IP', 1000),
    /** Global per IP window in seconds */
    globalIpWindow: optionalEnvInt('RATE_LIMIT_GLOBAL_IP_WINDOW', 60),

    /** Klipy search base limit per identity (tier 0) */
    klipySearchIdentityLimit: optionalEnvInt('RATE_LIMIT_KLIPY_SEARCH_IDENTITY', 30),
    /** Klipy search per identity window in seconds */
    klipySearchIdentityWindow: optionalEnvInt('RATE_LIMIT_KLIPY_SEARCH_IDENTITY_WINDOW', 60),
    /** Klipy progressive throttle cooldown in seconds (tier decays after no limit hits) */
    klipyThrottleCooldown: optionalEnvInt('RATE_LIMIT_KLIPY_THROTTLE_COOLDOWN', 300),

    /** Call initiate base limit per identity (tier 0) */
    callsInitiateIdentityLimit: optionalEnvInt('RATE_LIMIT_CALLS_INITIATE_IDENTITY', 5),
    /** Call initiate per identity window in seconds */
    callsInitiateIdentityWindow: optionalEnvInt('RATE_LIMIT_CALLS_INITIATE_IDENTITY_WINDOW', 300),
    /** Call initiate progressive throttle cooldown in seconds */
    callsInitiateThrottleCooldown: optionalEnvInt('RATE_LIMIT_CALLS_INITIATE_THROTTLE_COOLDOWN', 900),
  },
} as const;

/**
 * Validates that required configuration is properly set for production.
 * 
 * Checks that:
 * - Security secrets are not using development defaults
 * - AWS credentials are configured for email
 * - TextMagic credentials are configured for SMS
 * 
 * This function should be called early in application startup to fail fast
 * if the production environment is misconfigured.
 * 
 * @throws Error if any production configuration is invalid
 * 
 * @example
 * ```typescript
 * import { validateProductionConfig } from './config';
 * 
 * // Call at application startup
 * validateProductionConfig(); // Throws in production if misconfigured
 * ```
 */
export function validateProductionConfig(): void {
  if (config.env !== 'production') return;

  const errors: string[] = [];

  if (process.env.DEV_CLIENT_IP?.trim()) {
    errors.push('DEV_CLIENT_IP must not be set in production');
  }

  if (process.env.DEV_FORCE_ANONYMOUS_IP?.trim()) {
    errors.push('DEV_FORCE_ANONYMOUS_IP must not be set in production');
  }

  // Check security secrets aren't defaults
  if (config.security.csrfSecret.includes('dev-')) {
    errors.push('CSRF_SECRET must be set in production');
  }
  if (config.security.sessionSecret.includes('dev-')) {
    errors.push('SESSION_SECRET must be set in production');
  }
  if (config.security.otpSecret.includes('dev-')) {
    errors.push('OTP_SECRET must be set in production');
  }
  if (config.security.accountHashSecret.includes('dev-')) {
    errors.push('ACCOUNT_HASH_SECRET must be set in production');
  }
  if (config.security.tokenSigningKey.includes('dev-')) {
    errors.push('TOKEN_SIGNING_KEY must be set in production');
  }

  // Check email config
  if (!config.email.awsAccessKeyId || !config.email.awsSecretAccessKey) {
    errors.push('AWS credentials must be set for email in production');
  }

  // Check SMS config
  if (!config.sms.textmagicUsername || !config.sms.textmagicApiKey) {
    errors.push('TextMagic credentials must be set for SMS in production');
  }

  // Check Klipy config
  if (!config.klipy.apiKey) {
    errors.push('KLIPY_API_KEY must be set in production');
  }

  if (config.livekit.enabled) {
    if (!config.livekit.apiKey) {
      errors.push('LIVEKIT_API_KEY must be set when LIVEKIT_ENABLED is true');
    }
    if (!config.livekit.apiSecret) {
      errors.push('LIVEKIT_API_SECRET must be set when LIVEKIT_ENABLED is true');
    }
    if (!config.livekit.url) {
      errors.push('LIVEKIT_URL must be set when LIVEKIT_ENABLED is true');
    }
  }

  if (config.stripe.enabled) {
    if (!config.stripe.secretKey) {
      errors.push('STRIPE_SECRET_KEY must be set when STRIPE_ENABLED is true');
    }
    if (!config.stripe.webhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET must be set when STRIPE_ENABLED is true');
    } else if (!config.stripe.webhookSecret.startsWith('whsec_')) {
      errors.push('STRIPE_WEBHOOK_SECRET must be a valid Stripe signing secret (whsec_...) when STRIPE_ENABLED is true');
    }
    if (!config.stripe.publishableKey) {
      errors.push('STRIPE_PUBLISHABLE_KEY must be set when STRIPE_ENABLED is true');
    }
    const stripePriceEnvs: [keyof typeof config.stripe.prices, string][] = [
      ['accessAnnual', 'STRIPE_PRICE_ACCESS_ANNUAL'],
      ['insiderAnnual', 'STRIPE_PRICE_INSIDER_ANNUAL'],
      ['vanguardLifetime', 'STRIPE_PRICE_VANGUARD_LIFETIME'],
      ['founderLifetime', 'STRIPE_PRICE_FOUNDER_LIFETIME'],
    ];
    for (const [key, envName] of stripePriceEnvs) {
      if (!config.stripe.prices[key]) {
        errors.push(`${envName} must be set when STRIPE_ENABLED is true`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Type representing the full configuration object.
 * 
 * Useful for typing functions that accept configuration or partial configuration.
 * 
 * @example
 * ```typescript
 * import type { Config } from './config';
 * 
 * function initDatabase(config: Pick<Config, 'mongodb'>): void {
 *   // Use config.mongodb
 * }
 * ```
 */
export type Config = typeof config;
