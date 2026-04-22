import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { deriveScanHash } from '../utils/crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
const createE2EMediaMock = mock(() => Promise.resolve(undefined)) as AnyMock;
const countRecentByIdentityMock = mock(() => Promise.resolve(0)) as AnyMock;
const findByScanHashMock = mock(() => Promise.resolve(null)) as AnyMock;
const mediaCreateMock = mock(() => Promise.resolve(undefined)) as AnyMock;
const findByMediaIdMock = mock(() => Promise.resolve(null)) as AnyMock;
const updateStatusMock = mock(() => Promise.resolve(undefined)) as AnyMock;
const countPendingConvScanMock = mock(() => Promise.resolve(0)) as AnyMock;
const findUploadedNestedMock = mock(() => Promise.resolve([] as string[])) as AnyMock;
const countConvScanByScanHashMock = mock(() => Promise.resolve(0)) as AnyMock;
const countConvScanNonTerminalMock = mock(() => Promise.resolve(0)) as AnyMock;
const s3SendMock = mock(() => Promise.resolve({})) as AnyMock;

mock.module('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3 {
    send = s3SendMock;
  },
  PutObjectCommand: class PutObjectCommand {
    constructor(public input?: unknown) {}
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(public input?: unknown) {}
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(public input?: unknown) {}
  },
}));

mock.module('../repositories/e2e-media.repository', () => ({
  getE2EMediaRepository: () => ({
    countRecentByIdentity: countRecentByIdentityMock,
    createE2EMedia: createE2EMediaMock,
    findByScanHash: findByScanHashMock,
  }),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    create: mediaCreateMock,
    findByMediaId: findByMediaIdMock,
    updateStatus: updateStatusMock,
    countPendingConvScanByScanHash: countPendingConvScanMock,
    findUploadedNestedConvScanMediaIdsByScanHash: findUploadedNestedMock,
    countConvScanByScanHash: countConvScanByScanHashMock,
    countConvScanNonTerminalByScanHash: countConvScanNonTerminalMock,
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

import {
  completeScanUpload,
  requestE2EUpload,
  requestScanUpload,
  sealConvScanUploadSession,
} from './e2e-upload.service';

describe('e2e-upload.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    createE2EMediaMock.mockReset();
    countRecentByIdentityMock.mockReset();
    findByScanHashMock.mockReset();
    mediaCreateMock.mockReset();
    findByMediaIdMock.mockReset();
    updateStatusMock.mockReset();
    countPendingConvScanMock.mockReset();
    findUploadedNestedMock.mockReset();
    countConvScanByScanHashMock.mockReset();
    countConvScanNonTerminalMock.mockReset();
    s3SendMock.mockReset();
    createE2EMediaMock.mockImplementation(() => Promise.resolve(undefined));
    countRecentByIdentityMock.mockImplementation(() => Promise.resolve(0));
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        identityId: new ObjectId('507f1f77bcf86cd799439011'),
      })
    );
    mediaCreateMock.mockImplementation(() => Promise.resolve(undefined));
    findByMediaIdMock.mockImplementation(() => Promise.resolve(null));
    updateStatusMock.mockImplementation(() => Promise.resolve(undefined));
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve([]));
    countConvScanByScanHashMock.mockImplementation(() => Promise.resolve(0));
    countConvScanNonTerminalMock.mockImplementation(() => Promise.resolve(0));
    s3SendMock.mockImplementation(() => Promise.resolve({}));
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

  test('requestScanUpload rejects when no E2E session exists for scan hash', async () => {
    findByScanHashMock.mockImplementation(() => Promise.resolve(null));
    const result = await requestScanUpload({
      identityId: '507f1f77bcf86cd799439011',
      scanHash: 'b'.repeat(64),
      contentType: 'image/jpeg',
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SCAN_SESSION_NOT_FOUND');
    expect(mediaCreateMock).not.toHaveBeenCalled();
  });

  test('requestScanUpload rejects when scan hash belongs to another identity', async () => {
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        identityId: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      })
    );
    const result = await requestScanUpload({
      identityId: '507f1f77bcf86cd799439011',
      scanHash: 'b'.repeat(64),
      contentType: 'image/jpeg',
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('FORBIDDEN');
    expect(mediaCreateMock).not.toHaveBeenCalled();
  });

  test('requestScanUpload stores scan copy under nested scanHash prefix', async () => {
    const scanHash = 'c'.repeat(64);
    const result = await requestScanUpload({
      identityId: '507f1f77bcf86cd799439011',
      scanHash,
      contentType: 'image/jpeg',
      contentLength: 1024,
    });
    expect(result.success).toBe(true);
    expect(mediaCreateMock).toHaveBeenCalledTimes(1);
    const created = mediaCreateMock.mock.calls[0]![0] as { s3Key: string };
    expect(created.s3Key.startsWith(`uploads/conv_scan/${scanHash}/`)).toBe(true);
    expect(created.s3Key.endsWith('.jpg')).toBe(true);
  });

  test('completeScanUpload writes seal when no conv_scan parts are still pending', async () => {
    const scanHash = 'd'.repeat(64);
    const scanMediaId = 'scan-part-1';
    findByMediaIdMock.mockImplementation(() =>
      Promise.resolve({
        mediaId: scanMediaId,
        purpose: 'conv_scan',
        status: 'pending',
        scanHash,
        s3Key: `uploads/conv_scan/${scanHash}/${scanMediaId}.jpg`,
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));

    const result = await completeScanUpload(scanMediaId, {
      identityId: '507f1f77bcf86cd799439011',
    });

    expect(result.success).toBe(true);
    expect(s3SendMock).toHaveBeenCalled();
    const cmd = s3SendMock.mock.calls[0]![0] as { input?: { Key?: string } };
    expect(cmd.input?.Key).toBe(`uploads/conv_scan/${scanHash}/.sealed`);
  });

  test('completeScanUpload does not write seal while other conv_scan parts are pending', async () => {
    const scanHash = 'e'.repeat(64);
    const scanMediaId = 'scan-part-1';
    findByMediaIdMock.mockImplementation(() =>
      Promise.resolve({
        mediaId: scanMediaId,
        purpose: 'conv_scan',
        status: 'pending',
        scanHash,
        s3Key: `uploads/conv_scan/${scanHash}/${scanMediaId}.jpg`,
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(1));

    const result = await completeScanUpload(scanMediaId, {
      identityId: '507f1f77bcf86cd799439011',
    });

    expect(result.success).toBe(true);
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  test('sealConvScanUploadSession writes seal when session is valid', async () => {
    const scanHash = 'f'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve(['z-part', 'a-part']));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
      scanMediaIds: ['a-part', 'z-part'],
    });

    expect(result.success).toBe(true);
    expect(s3SendMock).toHaveBeenCalled();
  });

  test('sealConvScanUploadSession rejects manifest with wrong part count', async () => {
    const scanHash = 'c'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve(['a', 'b']));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
      manifest: {
        version: 1,
        parts: [{ mediaId: 'a', contentSha256: '0'.repeat(64) }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_MANIFEST');
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  test('sealConvScanUploadSession writes manifest then seal when manifest is valid', async () => {
    const scanHash = '1'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve(['solo']));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
      manifest: {
        version: 1,
        parts: [{ mediaId: 'solo', contentSha256: 'ab'.repeat(32) }],
      },
    });

    expect(result.success).toBe(true);
    const keys = s3SendMock.mock.calls.map(
      (c) => (c[0] as { input?: { Key?: string } }).input?.Key
    );
    expect(keys.length).toBe(2);
    expect(keys[0]?.endsWith('/manifest.json')).toBe(true);
    expect(keys[1]?.endsWith('/.sealed')).toBe(true);
  });

  test('sealConvScanUploadSession rejects when parts are still pending', async () => {
    const scanHash = 'a'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(2));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PENDING_PARTS');
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  test('sealConvScanUploadSession succeeds when auto-seal already advanced rows (idempotent)', async () => {
    const scanHash = '9'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve([]));
    countConvScanByScanHashMock.mockImplementation(() => Promise.resolve(2));
    countConvScanNonTerminalMock.mockImplementation(() => Promise.resolve(0));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
    });

    expect(result.success).toBe(true);
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  test('sealConvScanUploadSession rejects when scanMediaIds omit an uploaded part', async () => {
    const scanHash = 'b'.repeat(64);
    const identityHex = '507f1f77bcf86cd799439011';
    findByScanHashMock.mockImplementation(() =>
      Promise.resolve({
        scanHash,
        identityId: new ObjectId(identityHex),
      })
    );
    countPendingConvScanMock.mockImplementation(() => Promise.resolve(0));
    findUploadedNestedMock.mockImplementation(() => Promise.resolve(['p1', 'p2']));

    const result = await sealConvScanUploadSession({
      scanHash,
      identityId: identityHex,
      scanMediaIds: ['p1'],
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_PARTS');
    expect(s3SendMock).not.toHaveBeenCalled();
  });
});

