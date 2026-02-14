/**
 * Application configuration
 * Centralized environment variable access with defaults and validation
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Application configuration object
 * Access via: import { config } from './config'
 */
export const config = {
  // Server
  env: optionalEnv('NODE_ENV', 'development'),
  port: optionalEnvInt('PORT', 4000),
  host: optionalEnv('HOST', '0.0.0.0'),

  // CORS
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),

  // MongoDB
  mongodb: {
    uri: optionalEnv('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: optionalEnv('MONGODB_DB_NAME', 'chadder'),
    // Connection pool settings
    minPoolSize: optionalEnvInt('MONGODB_MIN_POOL_SIZE', 5),
    maxPoolSize: optionalEnvInt('MONGODB_MAX_POOL_SIZE', 20),
  },

  // Redis
  redis: {
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    // Key prefix for namespacing
    keyPrefix: optionalEnv('REDIS_KEY_PREFIX', 'chadder:'),
  },

  // Security
  security: {
    csrfSecret: optionalEnv('CSRF_SECRET', 'dev-csrf-secret-change-in-prod'),
    sessionSecret: optionalEnv('SESSION_SECRET', 'dev-session-secret-change-in-prod'),
    otpSecret: optionalEnv('OTP_SECRET', 'dev-otp-secret-change-in-prod'),
  },

  // Email (AWS SES)
  email: {
    provider: optionalEnv('EMAIL_PROVIDER', 'ses'),
    fromAddress: optionalEnv('EMAIL_FROM_ADDRESS', 'noreply@chadder.app'),
    // AWS credentials (optional - uses default credential chain if not set)
    awsRegion: optionalEnv('AWS_REGION', 'us-east-1'),
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // SMS (TextMagic)
  sms: {
    provider: optionalEnv('SMS_PROVIDER', 'textmagic'),
    textmagicUsername: process.env.TEXTMAGIC_USERNAME,
    textmagicApiKey: process.env.TEXTMAGIC_API_KEY,
    fromName: optionalEnv('SMS_FROM_NAME', 'Chadder'),
  },

  // Client URLs
  webAppUrl: optionalEnv('WEB_APP_URL', 'http://localhost:3000'),

  // Feature flags
  features: {
    // Whether to require DB connections on startup (disable for local dev without DBs)
    requireDatabase: optionalEnvBool('REQUIRE_DATABASE', false),
  },
} as const;

/**
 * Validates that required configuration is present for production
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

export type Config = typeof config;
