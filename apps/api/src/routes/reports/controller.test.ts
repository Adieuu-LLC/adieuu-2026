import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type { ReportSubmissionResult } from '../../services/report-submission.service';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const targetIdentityId = new ObjectId();
const targetMessageId = new ObjectId();
const reportId = new ObjectId().toHexString();

const mockSubmitMessageReport = mock(async (): Promise<ReportSubmissionResult> => ({
  success: true,
  reportId,
}));
const mockSubmitProfileReport = mock(async (): Promise<ReportSubmissionResult> => ({
  success: true,
  reportId,
}));
const mockCheckRateLimit = mock(async () => ({
  allowed: true,
  remaining: 4,
  resetAt: Math.floor(Date.now() / 1000) + 3600,
}));

mock.module('../../services/report-submission.service', () => ({
  submitMessageReport: mockSubmitMessageReport,
  submitProfileReport: mockSubmitProfileReport,
}));
mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

import { submitReportResult } from './controller';
import { reportRoutes } from './index';

reportRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

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

function validMessageReportBody(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message',
    targetMessageId: targetMessageId.toHexString(),
    category: 'spam',
    contextMessageCount: 3,
    sessionKeys: {},
    ...overrides,
  };
}

function validProfileReportBody(overrides: Record<string, unknown> = {}) {
  return {
    type: 'profile',
    targetIdentityId: targetIdentityId.toHexString(),
    category: 'spam',
    ...overrides,
  };
}

describe('submitReportResult', () => {
  beforeEach(() => {
    mockSubmitMessageReport.mockClear();
    mockSubmitProfileReport.mockClear();
    mockCheckRateLimit.mockClear();

    mockSubmitMessageReport.mockResolvedValue({ success: true, reportId });
    mockSubmitProfileReport.mockResolvedValue({ success: true, reportId });
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  test('returns validation_failed for malformed body', async () => {
    const r = await submitReportResult(myIdentityId.toHexString(), {});
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockSubmitMessageReport).not.toHaveBeenCalled();
    expect(mockSubmitProfileReport).not.toHaveBeenCalled();
  });

  test('returns rate_limited when checkRateLimit denies', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 120;
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt,
    });

    const r = await submitReportResult(myIdentityId.toHexString(), validMessageReportBody());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('rate_limited');
    expect(r.retryAfter).toBeGreaterThanOrEqual(0);
    expect(mockSubmitMessageReport).not.toHaveBeenCalled();
  });

  test('returns self_report when profile target is the reporter', async () => {
    const identityHex = myIdentityId.toHexString();
    const r = await submitReportResult(identityHex, validProfileReportBody({
      targetIdentityId: identityHex,
    }));
    expect(r).toEqual({ ok: false, kind: 'self_report' });
    expect(mockSubmitProfileReport).not.toHaveBeenCalled();
  });

  test('submits message report on success', async () => {
    const identityHex = myIdentityId.toHexString();
    const body = validMessageReportBody({ reason: 'Obvious spam' });
    const r = await submitReportResult(identityHex, body);

    expect(r).toEqual({ ok: true, data: { reportId } });
    expect(mockSubmitMessageReport).toHaveBeenCalledWith(identityHex, {
      targetMessageId: targetMessageId.toHexString(),
      category: 'spam',
      reason: 'Obvious spam',
      contextMessageCount: 3,
      sessionKeys: {},
    });
    expect(mockSubmitProfileReport).not.toHaveBeenCalled();
  });

  test('submits profile report on success', async () => {
    const identityHex = myIdentityId.toHexString();
    const targetHex = targetIdentityId.toHexString();
    const r = await submitReportResult(identityHex, validProfileReportBody({ reason: 'Harassment' }));

    expect(r).toEqual({ ok: true, data: { reportId } });
    expect(mockSubmitProfileReport).toHaveBeenCalledWith(identityHex, {
      targetIdentityId: targetHex,
      category: 'spam',
      reason: 'Harassment',
    });
    expect(mockSubmitMessageReport).not.toHaveBeenCalled();
  });

  test('maps service error codes to controller kinds', async () => {
    const identityHex = myIdentityId.toHexString();
    const body = validMessageReportBody();

    mockSubmitMessageReport.mockResolvedValueOnce({
      success: false,
      error: 'Already reported',
      errorCode: 'DUPLICATE_REPORT',
    });
    expect(await submitReportResult(identityHex, body)).toEqual({
      ok: false,
      kind: 'duplicate_report',
      message: 'Already reported',
      errorCode: 'DUPLICATE_REPORT',
    });

    mockSubmitMessageReport.mockResolvedValueOnce({
      success: false,
      error: 'Message not found',
      errorCode: 'MESSAGE_NOT_FOUND',
    });
    expect(await submitReportResult(identityHex, body)).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Message not found',
      errorCode: 'MESSAGE_NOT_FOUND',
    });

    mockSubmitMessageReport.mockResolvedValueOnce({
      success: false,
      error: 'Not a participant',
      errorCode: 'NOT_PARTICIPANT',
    });
    expect(await submitReportResult(identityHex, body)).toEqual({
      ok: false,
      kind: 'forbidden',
      message: 'Not a participant',
      errorCode: 'NOT_PARTICIPANT',
    });

    mockSubmitMessageReport.mockResolvedValueOnce({
      success: false,
      error: 'Decryption failed',
      errorCode: 'DECRYPTION_FAILED',
    });
    expect(await submitReportResult(identityHex, body)).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Decryption failed',
      errorCode: 'DECRYPTION_FAILED',
    });
  });
});

describe('reports routes smoke', () => {
  beforeEach(() => {
    mockSubmitMessageReport.mockClear();
    mockSubmitProfileReport.mockClear();
    mockCheckRateLimit.mockClear();

    mockSubmitMessageReport.mockResolvedValue({ success: true, reportId });
    mockSubmitProfileReport.mockResolvedValue({ success: true, reportId });
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  test('POST /reports returns 401 without identity session', async () => {
    const response = await reportRoutes.handler()(
      makeRequest('/reports', {
        method: 'POST',
        body: validMessageReportBody(),
      }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /reports returns 200 on successful message report', async () => {
    const response = await reportRoutes.handler()(
      makeRequest('/reports', {
        method: 'POST',
        body: validMessageReportBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(200);
    expect(mockSubmitMessageReport).toHaveBeenCalled();
    const json = (await response.json()) as { data?: { reportId?: string } };
    expect(json.data?.reportId).toBe(reportId);
  });

  test('POST /reports returns 429 with Retry-After when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 90,
    });

    const response = await reportRoutes.handler()(
      makeRequest('/reports', {
        method: 'POST',
        body: validMessageReportBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(mockSubmitMessageReport).not.toHaveBeenCalled();
  });

  test('POST /reports returns 409 on duplicate report', async () => {
    mockSubmitMessageReport.mockResolvedValueOnce({
      success: false,
      error: 'You have already reported this message',
      errorCode: 'DUPLICATE_REPORT',
    });

    const response = await reportRoutes.handler()(
      makeRequest('/reports', {
        method: 'POST',
        body: validMessageReportBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('DUPLICATE_REPORT');
  });
});

afterAll(() => {
  mock.restore();
});
