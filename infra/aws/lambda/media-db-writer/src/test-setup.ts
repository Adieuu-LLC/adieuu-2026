/**
 * Test setup for media-db-writer Lambda.
 * Must run before any source imports so module-level singletons pick up mocks.
 */
import { mock } from 'bun:test';

process.env.MONGODB_SECRET_ARN ??= 'arn:aws:secretsmanager:us-east-1:000000000000:secret:test';
process.env.MONGODB_DB_NAME ??= 'test-db';
process.env.MEDIA_CDN_URL ??= 'https://cdn.test.example';

const mockSend = mock(() =>
  Promise.resolve({
    SecretString: JSON.stringify({ MONGODB_URI: 'mongodb://localhost:27017/testdb' }),
  })
);

mock.module('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = mockSend;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));
