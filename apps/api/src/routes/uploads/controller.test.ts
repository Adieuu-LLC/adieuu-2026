import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type {
  CompleteUploadResult,
  RequestUploadResult,
} from '../../services/upload.service';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const mediaId = 'abc123-media-id';
const PROCESSOR_SECRET = 'test-processor-secret';

const mockRequestUpload = mock(async (): Promise<RequestUploadResult> => ({
  success: true,
  mediaId,
  uploadUrl: 'https://s3.example/upload',
  expiresIn: 300,
}));
const mockCompleteUpload = mock(async (): Promise<CompleteUploadResult> => ({ success: true }));
const mockGetUploadStatus = mock(async () => null as Awaited<ReturnType<typeof import('../../services/upload.service').getUploadStatus>>);
const mockProcessCallback = mock(async () => true);

mock.module('../../services/upload.service', () => ({
  requestUpload: mockRequestUpload,
  completeUpload: mockCompleteUpload,
  getUploadStatus: mockGetUploadStatus,
  processCallback: mockProcessCallback,
}));
mock.module('../../config', () => ({
  config: {
    mediaProcessorSecret: PROCESSOR_SECRET,
  },
}));

import {
  parseMediaId,
  requestUploadResult,
  completeUploadResult,
  getUploadStatusResult,
  processCallbackResult,
} from './controller';
import { uploadRoutes } from './index';

uploadRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
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

function validRequestBody() {
  return {
    purpose: 'avatar',
    contentType: 'image/png',
    contentLength: 1024,
  };
}

describe('parseMediaId', () => {
  test('returns ok for valid id within length limit', () => {
    expect(parseMediaId('abc-123')).toEqual({ ok: true, mediaId: 'abc-123' });
  });

  test('returns bad_request for missing or overlong id', () => {
    expect(parseMediaId(undefined)).toEqual({ ok: false, kind: 'bad_request' });
    expect(parseMediaId('x'.repeat(101))).toEqual({ ok: false, kind: 'bad_request' });
  });
});

describe('requestUploadResult', () => {
  beforeEach(() => {
    mockRequestUpload.mockClear();
    mockRequestUpload.mockResolvedValue({
      success: true,
      mediaId,
      uploadUrl: 'https://s3.example/upload',
      expiresIn: 300,
    });
  });

  test('returns validation_failed for invalid body', async () => {
    const r = await requestUploadResult({ identityId: myIdentityId.toHexString() }, {});
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockRequestUpload).not.toHaveBeenCalled();
  });

  test('returns rate_limited when service denies', async () => {
    mockRequestUpload.mockResolvedValueOnce({
      success: false,
      error: 'Slow down',
      errorCode: 'RATE_LIMITED',
    });
    const r = await requestUploadResult({ identityId: myIdentityId.toHexString() }, validRequestBody());
    expect(r).toEqual({ ok: false, kind: 'rate_limited', message: 'Slow down' });
  });

  test('returns upload data on success', async () => {
    const r = await requestUploadResult({ identityId: myIdentityId.toHexString() }, validRequestBody());
    expect(r).toEqual({
      ok: true,
      data: {
        mediaId,
        uploadUrl: 'https://s3.example/upload',
        expiresIn: 300,
      },
    });
  });

  test('returns bad_request for generic service failure', async () => {
    mockRequestUpload.mockResolvedValueOnce({
      success: false,
      error: 'Content type not allowed',
      errorCode: 'INVALID_CONTENT_TYPE',
    });
    const r = await requestUploadResult({ identityId: myIdentityId.toHexString() }, validRequestBody());
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Content type not allowed' });
  });

  test('returns bad_request when service response is incomplete', async () => {
    mockRequestUpload.mockResolvedValueOnce({
      success: true,
      mediaId,
      uploadUrl: undefined,
      expiresIn: 300,
    } as RequestUploadResult);
    const r = await requestUploadResult({ identityId: myIdentityId.toHexString() }, validRequestBody());
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Upload request failed' });
  });
});

describe('completeUploadResult', () => {
  beforeEach(() => {
    mockCompleteUpload.mockClear();
    mockCompleteUpload.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await completeUploadResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockCompleteUpload).not.toHaveBeenCalled();
  });

  test('returns not_found from service', async () => {
    mockCompleteUpload.mockResolvedValueOnce({
      success: false,
      error: 'Upload not found',
      errorCode: 'NOT_FOUND',
    });
    const r = await completeUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Upload not found' });
  });

  test('returns bad_request for generic service failure', async () => {
    mockCompleteUpload.mockResolvedValueOnce({
      success: false,
      error: 'Upload already complete',
      errorCode: 'INVALID_STATUS',
    });
    const r = await completeUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'bad_request', message: 'Upload already complete' });
  });

  test('succeeds for valid media id', async () => {
    const r = await completeUploadResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockCompleteUpload).toHaveBeenCalledWith(mediaId, myIdentityId.toHexString());
  });
});

describe('getUploadStatusResult', () => {
  beforeEach(() => {
    mockGetUploadStatus.mockClear();
    mockGetUploadStatus.mockResolvedValue({
      mediaId,
      status: 'ready',
      cdnUrl: 'https://cdn.example/x.png',
      rejectionReason: undefined,
    } as Awaited<ReturnType<typeof import('../../services/upload.service').getUploadStatus>>);
  });

  test('returns not_found when doc missing', async () => {
    mockGetUploadStatus.mockResolvedValueOnce(null);
    const r = await getUploadStatusResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Upload not found' });
  });

  test('maps status fields on success', async () => {
    const r = await getUploadStatusResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: true,
      data: {
        mediaId,
        status: 'ready',
        cdnUrl: 'https://cdn.example/x.png',
        rejectionReason: null,
      },
    });
  });

  test('returns bad_request for invalid media id', async () => {
    const r = await getUploadStatusResult(myIdentityId.toHexString(), undefined);
    expect(r).toEqual({ ok: false, kind: 'bad_request' });
    expect(mockGetUploadStatus).not.toHaveBeenCalled();
  });

  test('maps rejectionReason when present', async () => {
    mockGetUploadStatus.mockResolvedValueOnce({
      mediaId,
      status: 'rejected',
      cdnUrl: undefined,
      rejectionReason: 'Policy violation',
    } as Awaited<ReturnType<typeof import('../../services/upload.service').getUploadStatus>>);
    const r = await getUploadStatusResult(myIdentityId.toHexString(), mediaId);
    expect(r).toEqual({
      ok: true,
      data: {
        mediaId,
        status: 'rejected',
        cdnUrl: null,
        rejectionReason: 'Policy violation',
      },
    });
  });
});

describe('processCallbackResult', () => {
  beforeEach(() => {
    mockProcessCallback.mockClear();
    mockProcessCallback.mockResolvedValue(true);
  });

  test('returns unauthorized for invalid secret', async () => {
    const r = await processCallbackResult('wrong', {
      mediaId,
      status: 'ready',
    });
    expect(r).toEqual({
      ok: false,
      kind: 'unauthorized',
      message: 'Invalid processor secret',
    });
    expect(mockProcessCallback).not.toHaveBeenCalled();
  });

  test('returns unauthorized for null secret', async () => {
    const r = await processCallbackResult(null, { mediaId, status: 'ready' });
    expect(r).toEqual({
      ok: false,
      kind: 'unauthorized',
      message: 'Invalid processor secret',
    });
    expect(mockProcessCallback).not.toHaveBeenCalled();
  });

  test('returns bad_request for invalid payload', async () => {
    const r = await processCallbackResult(PROCESSOR_SECRET, { status: 'ready' });
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid callback payload',
    });
  });

  test('returns not_found when callback target missing', async () => {
    mockProcessCallback.mockResolvedValueOnce(false);
    const r = await processCallbackResult(PROCESSOR_SECRET, {
      mediaId,
      status: 'ready',
    });
    expect(r).toEqual({ ok: false, kind: 'not_found', message: 'Upload not found' });
  });

  test('succeeds with valid secret and payload', async () => {
    const r = await processCallbackResult(PROCESSOR_SECRET, {
      mediaId,
      status: 'ready',
    });
    expect(r).toEqual({ ok: true, data: undefined });
    expect(mockProcessCallback).toHaveBeenCalledWith(mediaId, 'ready', undefined, undefined);
  });

  test('forwards optional callback fields to service', async () => {
    await processCallbackResult(PROCESSOR_SECRET, {
      mediaId,
      status: 'rejected',
      processedS3Key: 'processed/key.png',
      rejectionReason: 'NSFW',
    });
    expect(mockProcessCallback).toHaveBeenCalledWith(
      mediaId,
      'rejected',
      'processed/key.png',
      'NSFW',
    );
  });
});

describe('upload routes smoke', () => {
  beforeEach(() => {
    mockRequestUpload.mockClear();
    mockCompleteUpload.mockClear();
    mockGetUploadStatus.mockClear();
    mockProcessCallback.mockClear();
    mockRequestUpload.mockResolvedValue({
      success: true,
      mediaId,
      uploadUrl: 'https://s3.example/upload',
      expiresIn: 300,
    });
    mockCompleteUpload.mockResolvedValue({ success: true });
    mockGetUploadStatus.mockResolvedValue({
      mediaId,
      status: 'pending',
      cdnUrl: undefined,
      rejectionReason: undefined,
    } as Awaited<ReturnType<typeof import('../../services/upload.service').getUploadStatus>>);
    mockProcessCallback.mockResolvedValue(true);
  });

  test('POST /uploads/request returns 401 without session', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest('/uploads/request', { method: 'POST', body: validRequestBody() }),
    );
    expect(response.status).toBe(401);
  });

  test('GET /uploads/:mediaId/status returns 200 with session', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest(`/uploads/${mediaId}/status`, { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(200);
    expect(mockGetUploadStatus).toHaveBeenCalled();
  });

  test('POST /uploads/process-callback returns 401 with bad secret', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest('/uploads/process-callback', {
        method: 'POST',
        body: { mediaId, status: 'ready' },
        headers: { 'x-processor-secret': 'wrong' },
      }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/request returns 200 with session', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest('/uploads/request', {
        method: 'POST',
        body: validRequestBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockRequestUpload).toHaveBeenCalled();
  });

  test('POST /uploads/:mediaId/complete returns 401 without session', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest(`/uploads/${mediaId}/complete`, { method: 'POST' }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /uploads/:mediaId/complete returns 200 with session', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest(`/uploads/${mediaId}/complete`, {
        method: 'POST',
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockCompleteUpload).toHaveBeenCalled();
  });

  test('POST /uploads/process-callback returns 200 with valid secret', async () => {
    const response = await uploadRoutes.handler()(
      makeRequest('/uploads/process-callback', {
        method: 'POST',
        body: { mediaId, status: 'ready' },
        headers: { 'x-processor-secret': PROCESSOR_SECRET },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockProcessCallback).toHaveBeenCalled();
  });

  test('GET /uploads/:mediaId/status returns 404 when not found', async () => {
    mockGetUploadStatus.mockResolvedValueOnce(null);
    const response = await uploadRoutes.handler()(
      makeRequest(`/uploads/${mediaId}/status`, { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(404);
  });

  test('POST /uploads/request returns 429 when rate limited', async () => {
    mockRequestUpload.mockResolvedValueOnce({
      success: false,
      error: 'Slow down',
      errorCode: 'RATE_LIMITED',
    });
    const response = await uploadRoutes.handler()(
      makeRequest('/uploads/request', {
        method: 'POST',
        body: validRequestBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(429);
  });
});

afterAll(() => {
  mock.restore();
});
