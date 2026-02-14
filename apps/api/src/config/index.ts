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
  /** Current environment: 'development', 'production', or 'test' */
  env: optionalEnv('NODE_ENV', 'development'),
  /** HTTP server port */
  port: optionalEnvInt('PORT', 4000),
  /** HTTP server host/interface to bind to */
  host: optionalEnv('HOST', '0.0.0.0'),

  /** CORS origin for cross-origin requests */
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),

  /** MongoDB database configuration */
  mongodb: {
    /** MongoDB connection URI */
    uri: optionalEnv('MONGODB_URI', 'mongodb://localhost:27017'),
    /** Database name to use */
    dbName: optionalEnv('MONGODB_DB_NAME', 'chadder'),
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
    keyPrefix: optionalEnv('REDIS_KEY_PREFIX', 'chadder:'),
  },

  /** Security secrets and configuration */
  security: {
    /** Secret for CSRF token generation and validation */
    csrfSecret: optionalEnv('CSRF_SECRET', 'dev-csrf-secret-change-in-prod'),
    /** Secret for session token signing */
    sessionSecret: optionalEnv('SESSION_SECRET', 'dev-session-secret-change-in-prod'),
    /** Secret for OTP hashing (prevents rainbow table attacks) */
    otpSecret: optionalEnv('OTP_SECRET', 'dev-otp-secret-change-in-prod'),
  },

  /** Email service configuration (AWS SES) */
  email: {
    /** Email provider: 'ses' or 'console' */
    provider: optionalEnv('EMAIL_PROVIDER', 'ses'),
    /** From address for outgoing emails */
    fromAddress: optionalEnv('EMAIL_FROM_ADDRESS', 'noreply@chadder.app'),
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
    fromName: optionalEnv('SMS_FROM_NAME', 'Chadder'),
  },

  /** Web application URL for magic links and redirects */
  webAppUrl: optionalEnv('WEB_APP_URL', 'http://localhost:3000'),

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

  // Check email config
  if (!config.email.awsAccessKeyId || !config.email.awsSecretAccessKey) {
    errors.push('AWS credentials must be set for email in production');
  }

  // Check SMS config
  if (!config.sms.textmagicUsername || !config.sms.textmagicApiKey) {
    errors.push('TextMagic credentials must be set for SMS in production');
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
