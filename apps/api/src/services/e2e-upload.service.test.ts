import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { deriveScanHash } from '../utils/crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
const createE2EMediaMock = mock(() => Promise.resolve(undefined)) as AnyMock;
const countRecentByIdentityMock = mock(() => Promise.resolve(0)) as AnyMock;
const mediaCreateMock = mock(() => Promise.resolve(undefined)) as AnyMock;

mock.module('../repositories/e2e-media.repository', () => ({
  getE2EMediaRepository: () => ({
    countRecentByIdentity: countRecentByIdentityMock,
    createE2EMedia: createE2EMediaMock,
  }),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    create: mediaCreateMock,
    findByMediaId: mock(() => Promise.resolve(null)),
    updateStatus: mock(() => Promise.resolve(undefined)),
  }),
}));

mock.module('../repositories/message.repository', () => ({
  getMessageRepository: () => ({
    findConversationByE2EMediaId: mock(() => Promise.resolve(null)),
  }),
}));

mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => ({
    findById: mock(() => Promise.resolve(null)),
  }),
}));

mock.module('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mock(() => Promise.resolve('https://signed.example/upload')),
}));

mock.module('../config', () => ({
  config: {
    s3: {
      region: 'us-east-1',
      e2eMediaBucket: 'e2e-bucket',
      mediaBucket: 'media-bucket',
    },
  },
}));

import { requestE2EUpload, requestScanUpload } from './e2e-upload.service';

describe('e2e-upload.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    createE2EMediaMock.mockReset();
    countRecentByIdentityMock.mockReset();
    mediaCreateMock.mockReset();
    createE2EMediaMock.mockImplementation(() => Promise.resolve(undefined));
    countRecentByIdentityMock.mockImplementation(() => Promise.resolve(0));
    mediaCreateMock.mockImplementation(() => Promise.resolve(undefined));
  });

  test('requestE2EUpload rejects unsupported content type', async () => {
    const result = await requestE2EUpload({
      identityId: '507f1f77bcf86cd799439011',
      contentType: 'application/pdf',
      contentLength: 1024,
      stripExif: true,
      maxVideoDurationSeconds: 300,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_CONTENT_TYPE');
    expect(createE2EMediaMock).not.toHaveBeenCalled();
  });

  test('requestE2EUpload persists derived scan hash bound to identity + media', async () => {
    const identityId = '507f1f77bcf86cd799439011';
    const result = await requestE2EUpload({
      identityId,
      contentType: 'image/jpeg',
      contentLength: 1024,
      stripExif: true,
      maxVideoDurationSeconds: 300,
    });

    expect(result.success).toBe(true);
    expect(result.e2eMediaId).toBeTruthy();
    expect(result.scanHash).toBe(deriveScanHash(identityId, result.e2eMediaId!));
    expect(createE2EMediaMock).toHaveBeenCalledTimes(1);
    const created = createE2EMediaMock.mock.calls[0]![0] as unknown as {
      e2eMediaId: string;
      scanHash: string;
    };
    expect(created.scanHash).toBe(deriveScanHash(identityId, created.e2eMediaId));
  });

  test('requestE2EUpload requires declared duration for video', async () => {
    const result = await requestE2EUpload({
      identityId: '507f1f77bcf86cd799439011',
      contentType: 'video/mp4',
      contentLength: 1024,
      stripExif: false,
      maxVideoDurationSeconds: 300,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VIDEO_DURATION_REQUIRED');
    expect(createE2EMediaMock).not.toHaveBeenCalled();
  });

  test('requestE2EUpload rejects video when declared duration exceeds session limit', async () => {
    const result = await requestE2EUpload({
      identityId: '507f1f77bcf86cd799439011',
      contentType: 'video/mp4',
      contentLength: 1024,
      stripExif: false,
      maxVideoDurationSeconds: 60,
      declaredDurationSeconds: 120,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VIDEO_DURATION_EXCEEDED');
    expect(createE2EMediaMock).not.toHaveBeenCalled();
  });

  test('requestE2EUpload accepts video when duration is within session limit', async () => {
    const result = await requestE2EUpload({
      identityId: '507f1f77bcf86cd799439011',
      contentType: 'video/mp4',
      contentLength: 1024,
      stripExif: false,
      maxVideoDurationSeconds: 300,
      declaredDurationSeconds: 45,
    });
    expect(result.success).toBe(true);
    expect(createE2EMediaMock).toHaveBeenCalledTimes(1);
  });

  test('requestScanUpload rejects malformed scan hash', async () => {
    const result = await requestScanUpload({
      identityId: '507f1f77bcf86cd799439011',
      scanHash: 'too-short',
      contentType: 'image/jpeg',
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SCAN_HASH');
    expect(mediaCreateMock).not.toHaveBeenCalled();
  });
});

