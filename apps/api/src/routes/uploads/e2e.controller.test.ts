import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type {
  AbandonE2EUploadResult,
  CompleteE2EUploadResult,
  E2EMediaDownloadResult,
  E2EMediaStatusResult,
  RequestE2EUploadResult,
  RequestScanUploadResult,
  SealConvScanSessionResult,
} from '../../services/e2e-upload.service';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const mediaId = 'e2e-media-123';
const scanHash = 'a'.repeat(64);

const mockRequestE2EUpload = mock(async (): Promise<RequestE2EUploadResult> => ({
  success: true,
  e2eMediaId: mediaId,
  uploadUrl: 'https://s3.example/e2e',
  scanHash,
  expiresIn: 300,
}));
const mockCompleteE2EUpload = mock(async (): Promise<CompleteE2EUploadResult> => ({ success: true }));
const mockAbandonE2EUpload = mock(async (): Promise<AbandonE2EUploadResult> => ({ success: true }));
const mockGetE2EMediaStatus = mock(
  async (): Promise<E2EMediaStatusResult | null> => ({
    e2eMediaId: mediaId,
    status: 'gated',
    moderationStatus: 'pending',
    moderationReason: null,
  }),
);
const mockGetE2EMediaDownload = mock(async (): Promise<E2EMediaDownloadResult> => ({
  success: true,
  downloadUrl: 'https://s3.example/download',
  expiresIn: 300,
}));
const mockRequestScanUpload = mock(async (): Promise<RequestScanUploadResult> => ({
  success: true,
  scanMediaId: 'scan-part-1',
  uploadUrl: 'https://s3.example/scan',
  expiresIn: 300,
}));
const mockCompleteScanUpload = mock(async (): Promise<CompleteE2EUploadResult> => ({ success: true }));
const mockSealConvScanUploadSession = mock(async (): Promise<SealConvScanSessionResult> => ({
  success: true,
}));

mock.module('../../services/e2e-upload.service', () => ({
  requestE2EUpload: mockRequestE2EUpload,
  completeE2EUpload: mockCompleteE2EUpload,
  abandonE2EUpload: mockAbandonE2EUpload,
  getE2EMediaStatus: mockGetE2EMediaStatus,
  getE2EMediaDownload: mockGetE2EMediaDownload,
  requestScanUpload: mockRequestScanUpload,
  completeScanUpload: mockCompleteScanUpload,
  sealConvScanUploadSession: mockSealConvScanUploadSession,
}));

import {
  requestE2EUploadResult,
  completeE2EUploadResult,
  abandonE2EUploadResult,
  getE2EMediaStatusResult,
  getE2EMediaDownloadResult,
  requestScanUploadResult,
  completeScanUploadResult,
  sealConvScanUploadResult,
} from './e2e.controller';
import { e2eUploadRoutes } from './e2e';

e2eUploadRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function validE2ERequestBody() {
  return {
    contentType: 'image/jpeg',
    contentLength: 2048,
    stripExif: true,
  };
}

function validScanRequestBody() {
  return {
    scanHash,
    contentType: 'image/jpeg',
    contentLength: 1024,
  };
}

function validSealBody() {
  return {
    scanHash,
    scanMediaIds: ['scan-part-1'],
    manifest: {
      version: 1 as const,
      parts: [{ mediaId: 'scan-part-1', contentSha256: 'b'.repeat(64) }],
    },
  };
}

const scanMediaId = 'scan-part-1';

describe('requestE2EUploadResult', () => {
  beforeEach(() => {
    mockRequestE2EUpload.mockClear();
    mockRequestE2EUpload.mockResolvedValue({
      success: true,
      e2eMediaId: mediaId,
      uploadUrl: 'https://s3.example/e2e',
      scanHash,
      expiresIn: 300,
    });
  });

  test('returns validation_failed for video without declaredDurationSeconds', async () => {
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      { contentType: 'video/mp4', contentLength: 1000 },
    );
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockRequestE2EUpload).not.toHaveBeenCalled();
  });

  test('returns rate_limited from service', async () => {
    mockRequestE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'Too many uploads',
      errorCode: 'RATE_LIMITED',
    });
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      validE2ERequestBody(),
    );
    expect(r).toEqual({ ok: false, kind: 'rate_limited', message: 'Too many uploads' });
  });

  test('returns upload data on success for image', async () => {
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      validE2ERequestBody(),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        e2eMediaId: mediaId,
        uploadUrl: 'https://s3.example/e2e',
        scanHash,
        expiresIn: 300,
      },
    });
  });

  test('returns upload data for video with declaredDurationSeconds', async () => {
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      { contentType: 'video/mp4', contentLength: 5000, declaredDurationSeconds: 30 },
    );
    expect(r.ok).toBe(true);
    expect(mockRequestE2EUpload).toHaveBeenCalledWith(
      expect.objectContaining({ declaredDurationSeconds: 30, contentType: 'video/mp4' }),
    );
  });

  test('returns bad_request for generic service failure', async () => {
    mockRequestE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'File too large',
      errorCode: 'FILE_TOO_LARGE',
    });
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      validE2ERequestBody(),
    );
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'File too large' });
  });

  test('returns bad_request when service response is incomplete', async () => {
    mockRequestE2EUpload.mockResolvedValueOnce({
      success: true,
      e2eMediaId: mediaId,
      uploadUrl: undefined,
      scanHash,
      expiresIn: 300,
    } as RequestE2EUploadResult);
    const r = await requestE2EUploadResult(
      { identityId: myIdentityId.toHexString(), maxVideoDurationSeconds: 60 },
      validE2ERequestBody(),
    );
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'E2E upload request failed' });
  });
});

describe('abandonE2EUploadResult', () => {
  beforeEach(() => {
    mockAbandonE2EUpload.mockClear();
    mockAbandonE2EUpload.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await abandonE2EUploadResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockAbandonE2EUpload).not.toHaveBeenCalled();
  });

  test('returns not_found from service', async () => {
    mockAbandonE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'E2E media not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await abandonE2EUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'E2E media not found' });
  });

  test('maps REFERENCED to conflict', async () => {
    mockAbandonE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'E2E media is referenced by a message',
      errorCode: 'REFERENCED',
    });
    const r = await abandonE2EUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: false,
      kind: 'conflict',
      message: 'E2E media is referenced by a message',
    });
  });

  test('returns bad_request for generic service failure', async () => {
    mockAbandonE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'Cannot abandon ready media',
      errorCode: 'INVALID_STATUS',
    });
    const r = await abandonE2EUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Cannot abandon ready media' });
  });

  test('succeeds for valid media id', async () => {
    const r = await abandonE2EUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockAbandonE2EUpload).toHaveBeenCalledWith(mediaId, myIdentityId.toHexString());
  });
});

describe('getE2EMediaDownloadResult', () => {
  beforeEach(() => {
    mockGetE2EMediaDownload.mockClear();
    mockGetE2EMediaDownload.mockResolvedValue({
      success: true,
      downloadUrl: 'https://s3.example/download',
      expiresIn: 300,
    });
  });

  test('maps SCAN_PENDING kind', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'Awaiting scan',
      errorCode: 'SCAN_PENDING',
    });
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: false,
      kind: 'scan_pending',
      message: 'Awaiting scan',
    });
  });

  test('maps REJECTED with moderationReason', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'Rejected',
      errorCode: 'REJECTED',
      moderationReason: 'explicit',
    });
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: false,
      kind: 'rejected',
      message: 'Rejected',
      moderationReason: 'explicit',
    });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockGetE2EMediaDownload).not.toHaveBeenCalled();
  });

  test('returns download data on success', async () => {
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: true,
      data: {
        downloadUrl: 'https://s3.example/download',
        expiresIn: 300,
      },
    });
  });

  test('returns not_found from service', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'E2E media not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'E2E media not found' });
  });

  test('maps MODERATION_ERROR kind', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'Scan failed',
      errorCode: 'MODERATION_ERROR',
    });
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'moderation_error', message: 'Scan failed' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'Not ready',
      errorCode: 'NOT_READY',
    });
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Not ready' });
  });

  test('returns bad_request when downloadUrl is missing', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: true,
      downloadUrl: undefined,
      expiresIn: 300,
    } as E2EMediaDownloadResult);
    const r = await getE2EMediaDownloadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Download unavailable' });
  });
});

describe('getE2EMediaStatusResult', () => {
  beforeEach(() => {
    mockGetE2EMediaStatus.mockClear();
    mockGetE2EMediaStatus.mockResolvedValue({
      e2eMediaId: mediaId,
      status: 'gated',
      moderationStatus: 'pending',
      moderationReason: null,
    });
  });

  test('returns not_found when service returns null', async () => {
    mockGetE2EMediaStatus.mockResolvedValueOnce(null);
    const r = await getE2EMediaStatusResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'E2E media not found' });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await getE2EMediaStatusResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockGetE2EMediaStatus).not.toHaveBeenCalled();
  });

  test('returns status data on success', async () => {
    const r = await getE2EMediaStatusResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: true,
      data: {
        e2eMediaId: mediaId,
        status: 'gated',
        moderationStatus: 'pending',
        moderationReason: null,
      },
    });
  });
});

describe('requestScanUploadResult', () => {
  beforeEach(() => {
    mockRequestScanUpload.mockClear();
    mockRequestScanUpload.mockResolvedValue({
      success: true,
      scanMediaId: 'scan-part-1',
      uploadUrl: 'https://media.adieuu.com',
      uploadFields: { key: 'uploads/conv_scan/abc/scan-part-1.jpg', 'Content-Type': 'image/jpeg' },
      expiresIn: 300,
    });
  });

  test('returns validation_failed for invalid scan hash length', async () => {
    const r = await requestScanUploadResult(myIdentityId.toHexString(), {
      scanHash: 'short',
      contentType: 'image/jpeg',
      contentLength: 100,
    });
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockRequestScanUpload).not.toHaveBeenCalled();
  });

  test('returns scan upload data on success', async () => {
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({
      ok: true,
      data: {
        scanMediaId,
        uploadUrl: 'https://media.adieuu.com',
        uploadFields: { key: 'uploads/conv_scan/abc/scan-part-1.jpg', 'Content-Type': 'image/jpeg' },
        expiresIn: 300,
      },
    });
  });

  test('returns rate_limited from service', async () => {
    mockRequestScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Too many scan uploads',
      errorCode: 'RATE_LIMITED',
    });
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({ ok: false, kind: 'rate_limited', message: 'Too many scan uploads' });
  });

  test('returns not_found when scan session missing', async () => {
    mockRequestScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Scan session not found',
      errorCode: 'SCAN_SESSION_NOT_FOUND',
    });
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Scan session not found' });
  });

  test('returns forbidden from service', async () => {
    mockRequestScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Not allowed',
      errorCode: 'FORBIDDEN',
    });
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({ ok: false, kind: 'forbidden', message: 'Not allowed' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockRequestScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Invalid content type',
      errorCode: 'INVALID_CONTENT_TYPE',
    });
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Invalid content type' });
  });

  test('returns bad_request when service response is incomplete', async () => {
    mockRequestScanUpload.mockResolvedValueOnce({
      success: true,
      scanMediaId,
      uploadUrl: undefined,
      expiresIn: 300,
    } as RequestScanUploadResult);
    const r = await requestScanUploadResult(myIdentityId.toHexString(), validScanRequestBody());
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Scan upload request failed' });
  });
});

describe('completeE2EUploadResult', () => {
  beforeEach(() => {
    mockCompleteE2EUpload.mockClear();
    mockCompleteE2EUpload.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await completeE2EUploadResult(myIdentityId.toHexString(), undefined, {});
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockCompleteE2EUpload).not.toHaveBeenCalled();
  });

  test('returns not_found from service', async () => {
    mockCompleteE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'E2E media not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await completeE2EUploadResult(myIdentityId.toHexString(), mediaId, {});
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'E2E media not found' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockCompleteE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'Already complete',
      errorCode: 'INVALID_STATUS',
    });
    const r = await completeE2EUploadResult(myIdentityId.toHexString(), mediaId, {});
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Already complete' });
  });

  test('succeeds for valid media id', async () => {
    const r = await completeE2EUploadResult(myIdentityId.toHexString(), mediaId, {});
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockCompleteE2EUpload).toHaveBeenCalledWith(mediaId, myIdentityId.toHexString(), {
      skipModeration: false,
    });
  });

  test('passes skipModeration when body requests it', async () => {
    await completeE2EUploadResult(myIdentityId.toHexString(), mediaId, { skipModeration: true });
    expect(mockCompleteE2EUpload).toHaveBeenCalledWith(mediaId, myIdentityId.toHexString(), {
      skipModeration: true,
    });
  });

  test('defaults skipModeration to false when absent', async () => {
    await completeE2EUploadResult(myIdentityId.toHexString(), mediaId, undefined);
    expect(mockCompleteE2EUpload).toHaveBeenCalledWith(mediaId, myIdentityId.toHexString(), {
      skipModeration: false,
    });
  });
});

describe('completeScanUploadResult', () => {
  beforeEach(() => {
    mockCompleteScanUpload.mockClear();
    mockCompleteScanUpload.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await completeScanUploadResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockCompleteScanUpload).not.toHaveBeenCalled();
  });

  test('returns not_found from service', async () => {
    mockCompleteScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Scan upload not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await completeScanUploadResult(myIdentityId.toHexString(), scanMediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Scan upload not found' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockCompleteScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Not a scan upload',
      errorCode: 'FORBIDDEN',
    });
    const r = await completeScanUploadResult(myIdentityId.toHexString(), scanMediaId);
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Not a scan upload' });
  });

  test('succeeds for valid media id', async () => {
    const r = await completeScanUploadResult(myIdentityId.toHexString(), scanMediaId);
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockCompleteScanUpload).toHaveBeenCalledWith(scanMediaId, {
      identityId: myIdentityId.toHexString(),
    });
  });
});

describe('sealConvScanUploadResult', () => {
  beforeEach(() => {
    mockSealConvScanUploadSession.mockClear();
    mockSealConvScanUploadSession.mockResolvedValue({ success: true });
  });

  test('returns validation_failed for invalid body', async () => {
    const r = await sealConvScanUploadResult(myIdentityId.toHexString(), { scanHash: 'short' });
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockSealConvScanUploadSession).not.toHaveBeenCalled();
  });

  test('returns not_found from service', async () => {
    mockSealConvScanUploadSession.mockResolvedValueOnce({
      success: false,
      error: 'Scan session not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await sealConvScanUploadResult(myIdentityId.toHexString(), { scanHash });
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Scan session not found' });
  });

  test('returns forbidden from service', async () => {
    mockSealConvScanUploadSession.mockResolvedValueOnce({
      success: false,
      error: 'Not allowed',
      errorCode: 'FORBIDDEN',
    });
    const r = await sealConvScanUploadResult(myIdentityId.toHexString(), { scanHash });
    expect(r).toEqual({ ok: false, kind: 'forbidden', message: 'Not allowed' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockSealConvScanUploadSession.mockResolvedValueOnce({
      success: false,
      error: 'Parts missing',
      errorCode: 'INVALID_PARTS',
    });
    const r = await sealConvScanUploadResult(myIdentityId.toHexString(), { scanHash });
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Parts missing' });
  });

  test('succeeds and forwards manifest and scanMediaIds', async () => {
    const r = await sealConvScanUploadResult(myIdentityId.toHexString(), validSealBody());
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockSealConvScanUploadSession).toHaveBeenCalledWith({
      scanHash,
      identityId: myIdentityId.toHexString(),
      scanMediaIds: ['scan-part-1'],
      manifest: validSealBody().manifest,
    });
  });
});

describe('e2e upload routes smoke', () => {
  beforeEach(() => {
    mockRequestE2EUpload.mockClear();
    mockCompleteE2EUpload.mockClear();
    mockAbandonE2EUpload.mockClear();
    mockGetE2EMediaStatus.mockClear();
    mockGetE2EMediaDownload.mockClear();
    mockRequestScanUpload.mockClear();
    mockCompleteScanUpload.mockClear();
    mockSealConvScanUploadSession.mockClear();

    mockRequestE2EUpload.mockResolvedValue({
      success: true,
      e2eMediaId: mediaId,
      uploadUrl: 'https://s3.example/e2e',
      scanHash,
      expiresIn: 300,
    });
    mockCompleteE2EUpload.mockResolvedValue({ success: true });
    mockAbandonE2EUpload.mockResolvedValue({ success: true });
    mockGetE2EMediaStatus.mockResolvedValue({
      e2eMediaId: mediaId,
      status: 'gated',
      moderationStatus: 'pending',
      moderationReason: null,
    });
    mockGetE2EMediaDownload.mockResolvedValue({
      success: false,
      error: 'Content is awaiting moderation scan',
      errorCode: 'SCAN_PENDING',
    });
    mockRequestScanUpload.mockResolvedValue({
      success: true,
      scanMediaId,
      uploadUrl: 'https://media.adieuu.com',
      uploadFields: { key: 'uploads/conv_scan/abc/scan-part-1.jpg', 'Content-Type': 'image/jpeg' },
      expiresIn: 300,
    });
    mockCompleteScanUpload.mockResolvedValue({ success: true });
    mockSealConvScanUploadSession.mockResolvedValue({ success: true });
  });

  test('POST /uploads/e2e/request returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/e2e/request', { method: 'POST', body: validE2ERequestBody() }),
    );
    expect(response.status).toBe(401);
  });

  test('GET /uploads/e2e/:mediaId/download returns 202 when scan pending', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/download`, { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(202);
  });

  test('DELETE /uploads/e2e/:mediaId returns 409 when referenced', async () => {
    mockAbandonE2EUpload.mockResolvedValueOnce({
      success: false,
      error: 'E2E media is referenced by a message',
      errorCode: 'REFERENCED',
    });
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(409);
  });

  test('POST /uploads/e2e/request returns 200 with session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/e2e/request', {
        method: 'POST',
        body: validE2ERequestBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockRequestE2EUpload).toHaveBeenCalled();
  });

  test('POST /uploads/e2e/:mediaId/complete returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/complete`, { method: 'POST' }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/e2e/:mediaId/complete returns 200 with session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/complete`, {
        method: 'POST',
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockCompleteE2EUpload).toHaveBeenCalled();
  });

  test('GET /uploads/e2e/:mediaId/status returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/status`),
    );
    expect(response.status).toBe(401);
  });

  test('GET /uploads/e2e/:mediaId/status returns 200 with session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/status`, { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(200);
    expect(mockGetE2EMediaStatus).toHaveBeenCalled();
  });

  test('GET /uploads/e2e/:mediaId/download returns 403 when rejected', async () => {
    mockGetE2EMediaDownload.mockResolvedValueOnce({
      success: false,
      error: 'Rejected',
      errorCode: 'REJECTED',
      moderationReason: 'explicit',
    });
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/e2e/${mediaId}/download`, { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { details?: { moderationReason?: string } } };
    expect(body.error?.details?.moderationReason).toBe('explicit');
  });

  test('POST /uploads/scan/request returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/scan/request', { method: 'POST', body: validScanRequestBody() }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/scan/request returns 200 with session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/scan/request', {
        method: 'POST',
        body: validScanRequestBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockRequestScanUpload).toHaveBeenCalled();
  });

  test('POST /uploads/scan/:mediaId/complete returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/scan/${scanMediaId}/complete`, { method: 'POST' }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/scan/:mediaId/complete returns 404 when not found', async () => {
    mockCompleteScanUpload.mockResolvedValueOnce({
      success: false,
      error: 'Scan upload not found',
      errorCode: 'NOT_FOUND',
    });
    const response = await e2eUploadRoutes.handler()(
      makeRequest(`/uploads/scan/${scanMediaId}/complete`, {
        method: 'POST',
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(404);
  });

  test('POST /uploads/scan/seal returns 401 without session', async () => {
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/scan/seal', { method: 'POST', body: validSealBody() }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/scan/seal returns 403 when forbidden', async () => {
    mockSealConvScanUploadSession.mockResolvedValueOnce({
      success: false,
      error: 'Not allowed',
      errorCode: 'FORBIDDEN',
    });
    const response = await e2eUploadRoutes.handler()(
      makeRequest('/uploads/scan/seal', {
        method: 'POST',
        body: validSealBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(403);
  });
});

afterAll(() => {
  mock.restore();
});
