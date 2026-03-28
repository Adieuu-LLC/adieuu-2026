/**
 * Release manifest route tests.
 *
 * Validates the GET /api/v1/releases/latest/:filename endpoint which serves
 * electron-updater manifest files from a private S3 bucket. All S3 interactions
 * are mocked -- no AWS credentials or network access required.
 *
 * The route module caches manifest responses for 30s. Tests that need a fresh
 * S3 call advance Date.now past the TTL to invalidate the cache.
 */

import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';

const SAMPLE_MANIFEST = [
  'version: 1.2.3',
  'files:',
  '  - url: Adieuu-1.2.3-linux-x86_64.AppImage',
  '    sha512: abc123def456',
  '    size: 90000000',
  'path: Adieuu-1.2.3-linux-x86_64.AppImage',
  'sha512: abc123def456',
  'releaseDate: 2026-03-26T00:00:00.000Z',
].join('\n');

const mockSend = mock(() =>
  Promise.resolve({
    Body: { transformToString: () => Promise.resolve(SAMPLE_MANIFEST) },
  }),
);

mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockSend;
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

mock.module('../../config', () => ({
  config: {
    releaseManifests: {
      s3Bucket: 'test-manifests-bucket',
      awsRegion: 'us-east-1',
    },
    cors: { origins: 'http://localhost:5173', credentials: true },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { Router } from '../../router';
import { releaseRoutes } from './index';

function createHandler() {
  const app = new Router();
  app.merge(releaseRoutes, '/api');
  return app.handler();
}

const CACHE_TTL_MS = 30_000;
const realDateNow = Date.now;
let timeOffset = 0;

function advancePastCacheTTL() {
  timeOffset += CACHE_TTL_MS + 1;
  Date.now = () => realDateNow() + timeOffset;
}

afterAll(() => {
  Date.now = realDateNow;
});

describe('release manifest routes', () => {
  const handler = createHandler();

  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockImplementation(() =>
      Promise.resolve({
        Body: { transformToString: () => Promise.resolve(SAMPLE_MANIFEST) },
      }),
    );
    advancePastCacheTTL();
  });

  describe('GET /api/v1/releases/latest/:filename', () => {
    test('returns 200 with yaml content for latest.yml', async () => {
      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.yml'),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/yaml; charset=utf-8');

      const body = await res.text();
      expect(body).toContain('version: 1.2.3');
      expect(body).toContain('sha512: abc123def456');
    });

    test('returns 200 for latest-mac.yml', async () => {
      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(res.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('returns 200 for latest-linux.yml', async () => {
      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-linux.yml'),
      );
      expect(res.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('returns 404 for disallowed filename', async () => {
      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/evil.yml'),
      );
      expect(res.status).toBe(404);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('returns 404 for path traversal attempt', async () => {
      const res = await handler(
        new Request(
          'http://localhost/api/v1/releases/latest/..%2F..%2Fetc%2Fpasswd',
        ),
      );
      expect(res.status).toBe(404);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('returns 404 for non-yml extension', async () => {
      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.json'),
      );
      expect(res.status).toBe(404);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('returns 404 when S3 object does not exist (NoSuchKey)', async () => {
      const noSuchKeyError = new Error('NoSuchKey');
      noSuchKeyError.name = 'NoSuchKey';
      mockSend.mockImplementation(() => Promise.reject(noSuchKeyError));

      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.yml'),
      );
      expect(res.status).toBe(404);
    });

    test('returns 404 when S3 returns NotFound', async () => {
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      mockSend.mockImplementation(() => Promise.reject(notFoundError));

      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(res.status).toBe(404);
    });

    test('returns 500 on unexpected S3 error', async () => {
      mockSend.mockImplementation(() =>
        Promise.reject(new Error('NetworkingError')),
      );

      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-linux.yml'),
      );
      expect(res.status).toBe(500);
    });

    test('returns 404 when S3 body is empty', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({
          Body: { transformToString: () => Promise.resolve('') },
        }),
      );

      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.yml'),
      );
      expect(res.status).toBe(404);
    });

    test('returns 404 when Body is undefined', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({ Body: undefined as unknown as { transformToString: () => Promise<string> } }),
      );

      const res = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(res.status).toBe(404);
    });

    test('passes correct bucket and key to S3', async () => {
      await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-linux.yml'),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const calls = mockSend.mock.calls as unknown as Array<[{ input: { Bucket: string; Key: string } }]>;
      const commandArg = calls[0]?.[0];
      expect(commandArg?.input.Bucket).toBe('test-manifests-bucket');
      expect(commandArg?.input.Key).toBe('latest-linux.yml');
    });
  });

  describe('caching', () => {
    test('serves cached response without hitting S3 on second request', async () => {
      const first = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.yml'),
      );
      expect(first.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);

      mockSend.mockClear();

      const second = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest.yml'),
      );
      expect(second.status).toBe(200);
      const body = await second.text();
      expect(body).toContain('version: 1.2.3');
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('re-fetches from S3 after cache TTL expires', async () => {
      const first = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(first.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);

      mockSend.mockClear();
      advancePastCacheTTL();

      const second = await handler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(second.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('missing configuration', () => {
    test('returns 404 when s3Bucket is empty string', async () => {
      const { config } = await import('../../config');
      const originalBucket = config.releaseManifests.s3Bucket;

      (config.releaseManifests as { s3Bucket: string }).s3Bucket = '';

      const freshHandler = createHandler();
      const res = await freshHandler(
        new Request('http://localhost/api/v1/releases/latest/latest-mac.yml'),
      );
      expect(res.status).toBe(404);
      expect(mockSend).not.toHaveBeenCalled();

      (config.releaseManifests as { s3Bucket: string }).s3Bucket =
        originalBucket as string;
    });
  });
});
