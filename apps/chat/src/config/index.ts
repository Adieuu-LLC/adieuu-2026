/**
 * Chat Service Configuration Module
 *
 * Provides centralized, type-safe access to environment variables with
 * sensible defaults for development and strict validation for production.
 */

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

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: optionalEnvInt('CHAT_PORT', 9001),
  host: optionalEnv('CHAT_HOST', '0.0.0.0'),

  redis: {
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    keyPrefix: optionalEnv('REDIS_KEY_PREFIX', 'adieuu:'),
  },

  mongodb: {
    uri: optionalEnv('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: optionalEnv('MONGODB_DB_NAME', 'adieuu'),
    minPoolSize: optionalEnvInt('MONGODB_MIN_POOL_SIZE', 2),
    maxPoolSize: optionalEnvInt('MONGODB_MAX_POOL_SIZE', 10),
  },

  webSocket: {
    idleTimeout: optionalEnvInt('WS_IDLE_TIMEOUT', 120),
    maxPayloadLength: optionalEnvInt('WS_MAX_PAYLOAD_LENGTH', 1024 * 1024),
    compression: optionalEnvBool('WS_COMPRESSION', true),
  },

  presence: {
    heartbeatTtlSeconds: optionalEnvInt('PRESENCE_HEARTBEAT_TTL', 30),
    heartbeatIntervalSeconds: optionalEnvInt('PRESENCE_HEARTBEAT_INTERVAL', 15),
  },

  features: {
    requireDatabase: optionalEnvBool('REQUIRE_DATABASE', false),
  },
} as const;

export function validateProductionConfig(): void {
  if (config.env !== 'production') return;

  const errors: string[] = [];

  if (config.redis.url === 'redis://localhost:6379') {
    errors.push('REDIS_URL should not use default localhost in production');
  }

  if (config.mongodb.uri === 'mongodb://localhost:27017') {
    errors.push('MONGODB_URI should not use default localhost in production');
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n  - ${errors.join('\n  - ')}`);
  }
}

export type Config = typeof config;
