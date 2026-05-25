/**
 * Release manifest controller and route tests.
 *
 * Validates allowlist logic, S3 orchestration, caching, and route wiring.
 * All S3 interactions are mocked — no AWS credentials or network access required.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

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
import {
  clearManifestCacheForTests,
  getReleaseManifestResult,
  isAllowedManifestFilename,
  MANIFEST_CACHE_TTL_MS,
} from './controller';
import { releaseRoutes } from './index';

function createHandler() {
  const app = new Router();
  app.merge(releaseRoutes, '/api');
  return app.handler();
}

const realDateNow = Date.now;
let timeOffset = 0;

function advancePastCacheTTL() {
  timeOffset += MANIFEST_CACHE_TTL_MS + 1;
  Date.now = () => realDateNow() + timeOffset;
}

afterAll(() => {
  Date.now = realDateNow;
  mock.restore();
});

describe('isAllowedManifestFilename', () => {
  test('allows latest.yml, latest-mac.yml, and latest-linux.yml', () => {
    expect(isAllowedManifestFilename('latest.yml')).toBe(true);
    expect(isAllowedManifestFilename('latest-mac.yml')).toBe(true);
    expect(isAllowedManifestFilename('latest-linux.yml')).toBe(true);
  });

  test('rejects disallowed, traversal, and wrong-extension names', () => {
    expect(isAllowedManifestFilename('evil.yml')).toBe(false);
    expect(isAllowedManifestFilename('..%2F..%2Fetc%2Fpasswd')).toBe(false);
    expect(isAllowedManifestFilename('latest.json')).toBe(false);
    expect(isAllowedManifestFilename(undefined)).toBe(false);
  });
});

describe('getReleaseManifestResult', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockImplementation(() =>
      Promise.resolve({
        Body: { transformToString: () => Promise.resolve(SAMPLE_MANIFEST) },
      }),
    );
    clearManifestCacheForTests();
    advancePastCacheTTL();
  });

  test('returns not_found for disallowed filename', async () => {
    const result = await getReleaseManifestResult('evil.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('returns manifest body for allowed filename', async () => {
    const result = await getReleaseManifestResult('latest.yml');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.body).toContain('version: 1.2.3');
    }
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('returns not_found when S3 object does not exist (NoSuchKey)', async () => {
    const noSuchKeyError = new Error('NoSuchKey');
    noSuchKeyError.name = 'NoSuchKey';
    mockSend.mockImplementation(() => Promise.reject(noSuchKeyError));

    const result = await getReleaseManifestResult('latest.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('returns not_found when S3 returns NotFound', async () => {
    const notFoundError = new Error('NotFound');
    notFoundError.name = 'NotFound';
    mockSend.mockImplementation(() => Promise.reject(notFoundError));

    const result = await getReleaseManifestResult('latest-mac.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('returns internal on unexpected S3 error', async () => {
    mockSend.mockImplementation(() => Promise.reject(new Error('NetworkingError')));

    const result = await getReleaseManifestResult('latest-linux.yml');
    expect(result).toEqual({ ok: false, kind: 'internal' });
  });

  test('returns not_found when S3 body is empty', async () => {
    mockSend.mockImplementation(() =>
      Promise.resolve({
        Body: { transformToString: () => Promise.resolve('') },
      }),
    );

    const result = await getReleaseManifestResult('latest.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('returns not_found when Body is undefined', async () => {
    mockSend.mockImplementation(() =>
      Promise.resolve({ Body: undefined as unknown as { transformToString: () => Promise<string> } }),
    );

    const result = await getReleaseManifestResult('latest-mac.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('passes correct bucket and key to S3', async () => {
    await getReleaseManifestResult('latest-linux.yml');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const calls = mockSend.mock.calls as unknown as Array<[{ input: { Bucket: string; Key: string } }]>;
    const commandArg = calls[0]?.[0];
    expect(commandArg?.input.Bucket).toBe('test-manifests-bucket');
    expect(commandArg?.input.Key).toBe('latest-linux.yml');
  });

  test('serves cached response without hitting S3 on second request', async () => {
    const first = await getReleaseManifestResult('latest.yml');
    expect(first.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    mockSend.mockClear();

    const second = await getReleaseManifestResult('latest.yml');
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.body).toContain('version: 1.2.3');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('re-fetches from S3 after cache TTL expires', async () => {
    const first = await getReleaseManifestResult('latest-mac.yml');
    expect(first.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    mockSend.mockClear();
    advancePastCacheTTL();

    const second = await getReleaseManifestResult('latest-mac.yml');
    expect(second.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('returns not_found when s3Bucket is empty string', async () => {
    const { config } = await import('../../config');
    const originalBucket = config.releaseManifests.s3Bucket;

    (config.releaseManifests as { s3Bucket: string }).s3Bucket = '';

    const result = await getReleaseManifestResult('latest-mac.yml');
    expect(result).toEqual({ ok: false, kind: 'not_found' });
    expect(mockSend).not.toHaveBeenCalled();

    (config.releaseManifests as { s3Bucket: string }).s3Bucket = originalBucket as string;
  });
});

describe('release route smoke tests', () => {
  const handler = createHandler();

  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockImplementation(() =>
      Promise.resolve({
        Body: { transformToString: () => Promise.resolve(SAMPLE_MANIFEST) },
      }),
    );
    clearManifestCacheForTests();
    advancePastCacheTTL();
  });

  test('GET /api/v1/releases/latest/latest.yml returns 200 with yaml content', async () => {
    const res = await handler(new Request('http://localhost/api/v1/releases/latest/latest.yml'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/yaml; charset=utf-8');

    const body = await res.text();
    expect(body).toContain('version: 1.2.3');
    expect(body).toContain('sha512: abc123def456');
  });

  test('GET /api/v1/releases/latest/evil.yml returns 404', async () => {
    const res = await handler(new Request('http://localhost/api/v1/releases/latest/evil.yml'));
    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
