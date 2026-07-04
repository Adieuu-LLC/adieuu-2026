import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const countRecentByIdentityMock = mock(() => Promise.resolve(0)) as AnyMock;
const countRecentByUserMock = mock(() => Promise.resolve(0)) as AnyMock;
const createMock = mock(() => Promise.resolve(undefined)) as AnyMock;

mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3 {
    send = mock(() => Promise.resolve({}));
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(public input?: unknown) {}
  },
}));

mock.module('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: mock(() =>
    Promise.resolve({ url: 'https://s3.example.com/upload', fields: { key: 'test' } }),
  ),
}));

mock.module('../config', () => ({
  config: {
    s3: {
      mediaBucket: 'test-bucket',
      region: 'us-east-1',
    },
    cdn: {},
  },
}));

mock.module('../db', () => ({
  Collections: {},
}));

mock.module('../db/mongo', () => ({
  getDb: () => ({}),
  getClient: () => ({}),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    countRecentByIdentity: countRecentByIdentityMock,
    countRecentByUser: countRecentByUserMock,
    create: createMock,
  }),
}));

mock.module('./media-limits.service', () => ({
  resolveMaxUploadBytes: () => 10 * 1024 * 1024,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../utils/sanitize', () => ({
  sanitizeIpForStorage: (ip?: string) => ip ?? null,
}));

mock.module('../utils/cloudfront-signer', () => ({
  isCloudFrontSigningEnabled: () => false,
  generateCloudFrontSignedUrl: () => '',
}));

import { requestUpload } from './upload.service';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  countRecentByIdentityMock.mockClear();
  countRecentByUserMock.mockClear();
  createMock.mockClear();
});

describe('requestUpload — PAID_ONLY_UPLOAD_PURPOSES tier enforcement', () => {
  const BASE_INPUT = {
    contentType: 'image/jpeg',
    contentLength: 1024,
    identityId: '507f1f77bcf86cd799439011',
  } as const;

  test('free-tier user is denied a paid-only purpose (banner)', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'banner',
      subscriptions: ['free'],
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UPLOAD_DISABLED');
    expect(result.error).toContain('paid plan');
  });

  test('free-tier user is denied a paid-only purpose (dm_attachment)', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'dm_attachment',
      subscriptions: ['free'],
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UPLOAD_DISABLED');
  });

  test('paid-tier user (access) can upload a paid-only purpose', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'banner',
      subscriptions: ['access'],
    });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBeDefined();
  });

  test('lifetime user bypasses the tier check for paid-only purposes', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'banner',
      subscriptions: ['free'],
      isLifetime: true,
    });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBeDefined();
  });

  test('gifted user bypasses the tier check for paid-only purposes', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'banner',
      subscriptions: ['free'],
      entitlements: ['gifted'],
    });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBeDefined();
  });

  test('free-tier user can upload avatar (not a paid-only purpose)', async () => {
    const result = await requestUpload({
      ...BASE_INPUT,
      purpose: 'avatar',
      subscriptions: ['free'],
    });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBeDefined();
  });
});
