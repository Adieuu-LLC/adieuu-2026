import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { CsamMatch } from './csam-types';
import type { ConvScanSealBatchDeps } from './convScanBatch';

const mockS3Send = mock(() => Promise.resolve({}));

mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(public input: unknown) {}
  },
}));

import {
  processConvScanSealBatch,
  isConvScanSealObjectKey,
  isConvScanManifestObjectKey,
  parseNestedConvScanScanHashFromKey,
  shouldDeferNestedConvScanObject,
} from './convScanBatch';
import { S3Client } from '@aws-sdk/client-s3';

const TEST_SCAN_HASH = 'a'.repeat(64);
const TEST_BUCKET = 'test-bucket';
const TEST_SEAL_KEY = `uploads/conv_scan/${TEST_SCAN_HASH}/.sealed`;
const TEST_IMAGE_KEY = `uploads/conv_scan/${TEST_SCAN_HASH}/frame-001.jpg`;
const TEST_MEDIA_ID = 'media-id-123';

const CSAM_MATCH: CsamMatch = {
  source: 'ncmec',
  hashType: 'MD5',
  matchedHash: 'abc123',
  matchType: 'exact',
  classification: 'csam',
};

function createMockDeps(overrides?: Partial<ConvScanSealBatchDeps>): ConvScanSealBatchDeps {
  return {
    bucket: TEST_BUCKET,
    sealKey: TEST_SEAL_KEY,
    scanHash: TEST_SCAN_HASH,
    primaryMediaId: TEST_MEDIA_ID,
    purpose: 'conv_scan',
    identityId: 'identity-456',
    stripExif: true,
    contentModeration: true,
    s3: new S3Client({}),
    invokeDbWriter: mock(() => Promise.resolve()),
    logProcessorEvent: mock(() => {}),
    runCsamHashChecks: mock(() => Promise.resolve([])),
    handleCsamMatch: mock(() => Promise.resolve()),
    ...overrides,
  };
}

describe('utility functions', () => {
  test('parseNestedConvScanScanHashFromKey extracts valid scan hash', () => {
    const hash = parseNestedConvScanScanHashFromKey(TEST_IMAGE_KEY);
    expect(hash).toBe(TEST_SCAN_HASH);
  });

  test('parseNestedConvScanScanHashFromKey returns null for non-conv_scan keys', () => {
    expect(parseNestedConvScanScanHashFromKey('uploads/other/file.jpg')).toBeNull();
  });

  test('isConvScanSealObjectKey recognizes seal markers', () => {
    expect(isConvScanSealObjectKey(TEST_SEAL_KEY)).toBe(true);
    expect(isConvScanSealObjectKey(TEST_IMAGE_KEY)).toBe(false);
  });

  test('isConvScanManifestObjectKey recognizes manifests', () => {
    expect(isConvScanManifestObjectKey(`uploads/conv_scan/${TEST_SCAN_HASH}/manifest.json`)).toBe(true);
    expect(isConvScanManifestObjectKey(TEST_IMAGE_KEY)).toBe(false);
  });

  test('shouldDeferNestedConvScanObject defers content but not seals', () => {
    expect(shouldDeferNestedConvScanObject(TEST_IMAGE_KEY, 'conv_scan')).toBe(true);
    expect(shouldDeferNestedConvScanObject(TEST_SEAL_KEY, 'conv_scan')).toBe(false);
    expect(shouldDeferNestedConvScanObject(TEST_IMAGE_KEY, 'profile_picture')).toBe(false);
  });
});

function setupS3ListAndHead(keys: { key: string; contentType: string }[]): void {
  mockS3Send.mockImplementation((cmd: unknown) => {
    const name = (cmd as { constructor: { name: string } }).constructor.name;
    if (name === 'ListObjectsV2Command') {
      return Promise.resolve({
        Contents: keys.map(k => ({ Key: k.key })),
        IsTruncated: false,
      });
    }
    if (name === 'HeadObjectCommand') {
      const input = (cmd as { input: { Key: string } }).input;
      const match = keys.find(k => k.key === input.Key);
      return Promise.resolve({ ContentType: match?.contentType ?? 'application/octet-stream' });
    }
    if (name === 'GetObjectCommand') {
      return Promise.resolve({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff])) },
      });
    }
    return Promise.resolve({});
  });
}

describe('processConvScanSealBatch', () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
  });

  test('skips moderation when contentModeration is false', async () => {
    const deps = createMockDeps({ contentModeration: false });
    setupS3ListAndHead([]);
    await processConvScanSealBatch(deps);

    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'ready', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
    expect(deps.runCsamHashChecks).not.toHaveBeenCalled();
  });

  test('handles empty batch (no content keys)', async () => {
    const deps = createMockDeps();
    setupS3ListAndHead([]);
    await processConvScanSealBatch(deps);

    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_seal_batch_empty' })
    );
    expect(deps.invokeDbWriter).not.toHaveBeenCalled();
  });

  test('runs CSAM hash checks on each image in batch', async () => {
    const images = [
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/frame-001.jpg`, contentType: 'image/jpeg' },
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/frame-002.jpg`, contentType: 'image/jpeg' },
    ];

    const deps = createMockDeps();
    setupS3ListAndHead(images);
    await processConvScanSealBatch(deps);

    expect(deps.runCsamHashChecks).toHaveBeenCalledTimes(2);
    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'ready', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
  });

  test('triggers CSAM response chain on hash match', async () => {
    const images = [
      { key: TEST_IMAGE_KEY, contentType: 'image/jpeg' },
    ];

    const deps = createMockDeps({
      runCsamHashChecks: mock(() => Promise.resolve([CSAM_MATCH])),
    });
    setupS3ListAndHead(images);
    await processConvScanSealBatch(deps);

    expect(deps.handleCsamMatch).toHaveBeenCalledTimes(1);
    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'csam_hash_match_detected',
        mediaId: TEST_MEDIA_ID,
      })
    );
  });

  test('stops processing remaining images after first CSAM match', async () => {
    const images = [
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/frame-001.jpg`, contentType: 'image/jpeg' },
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/frame-002.jpg`, contentType: 'image/jpeg' },
    ];

    let callCount = 0;
    const deps = createMockDeps({
      runCsamHashChecks: mock(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? [CSAM_MATCH] : []);
      }),
    });
    setupS3ListAndHead(images);
    await processConvScanSealBatch(deps);

    expect(callCount).toBe(1);
    expect(deps.handleCsamMatch).toHaveBeenCalledTimes(1);
  });

  test('marks failed and logs on hash check error', async () => {
    const images = [
      { key: TEST_IMAGE_KEY, contentType: 'image/jpeg' },
    ];

    const deps = createMockDeps({
      runCsamHashChecks: mock(() => Promise.reject(new Error('DynamoDB timeout'))),
    });
    setupS3ListAndHead(images);
    await processConvScanSealBatch(deps);

    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'csam_hash_check_fatal',
        error: 'DynamoDB timeout',
      })
    );
    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'failed', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
  });

  test('allows legacy video through when flag is default (true)', async () => {
    const videos = [
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/video.mp4`, contentType: 'video/mp4' },
    ];

    const deps = createMockDeps();
    setupS3ListAndHead(videos);
    await processConvScanSealBatch(deps);

    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_legacy_video_no_hash_check' })
    );
    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'ready', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
  });

  test('fails batch with mixed video and image content', async () => {
    const mixed = [
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/frame.jpg`, contentType: 'image/jpeg' },
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/video.mp4`, contentType: 'video/mp4' },
    ];

    const deps = createMockDeps();
    setupS3ListAndHead(mixed);
    await processConvScanSealBatch(deps);

    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_seal_batch_invalid_mix' })
    );
    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'failed', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
  });

  test('marks ready when no moderable objects found', async () => {
    const nonMedia = [
      { key: `uploads/conv_scan/${TEST_SCAN_HASH}/data.json`, contentType: 'application/json' },
    ];

    const deps = createMockDeps();
    setupS3ListAndHead(nonMedia);
    await processConvScanSealBatch(deps);

    expect(deps.logProcessorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'conv_scan_seal_no_moderatable_objects' })
    );
    expect(deps.invokeDbWriter).toHaveBeenCalledWith(
      TEST_MEDIA_ID, 'failed', undefined, undefined,
      { purpose: 'conv_scan', s3Key: TEST_SEAL_KEY }
    );
  });
});
