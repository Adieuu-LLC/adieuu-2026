import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import type { ObjectId } from 'mongodb';

const mockSubmitReportResult = mock(() =>
  Promise.resolve({ ok: true as const, data: { reportId: 'rpt_001' } }),
);
const mockRequireCaptchaForFreeTier = mock(() => Promise.resolve(null as Response | null));
const mockHasPaidAccess = mock(() => true);

class MockRouter {
  routes: { method: string; pattern: string; handler: (...args: any[]) => any }[] = [];
  post(pattern: string, handler: (...args: any[]) => any) {
    this.routes.push({ method: 'POST', pattern, handler });
  }
  get(pattern: string, handler: (...args: any[]) => any) {
    this.routes.push({ method: 'GET', pattern, handler });
  }
}

mock.module('../../router', () => ({
  Router: MockRouter,
}));

mock.module('../../utils/response', () => ({
  success: (data?: unknown, message?: string) =>
    new Response(JSON.stringify({ data, message }), { status: 200 }),
  error: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ error: { code, message } }), { status }),
}));

mock.module('../../i18n', () => ({
  getErrorMessage: (key: string) => key,
}));

mock.module('./controller', () => ({
  submitReportResult: mockSubmitReportResult,
}));

mock.module('../../middleware/captcha', () => ({
  requireCaptchaForFreeTier: mockRequireCaptchaForFreeTier,
}));

mock.module('../../services/billing/resolve-access', () => ({
  hasPaidAccess: mockHasPaidAccess,
}));

const { reportRoutes } = await import('./index');

afterAll(() => {
  mock.restore();
});

function makeIdentitySession(overrides?: Partial<{
  subscriptions: string[];
  entitlements: string[];
  isLifetime: boolean;
}>) {
  return {
    identity: { _id: { toHexString: () => '000000000000000000000001' } as unknown as ObjectId },
    sessionId: 'sess_test',
    subscriptions: overrides?.subscriptions ?? ['free'],
    entitlements: overrides?.entitlements ?? [],
    isLifetime: overrides?.isLifetime ?? false,
    maxVideoDurationSeconds: 60,
  };
}

function makeCtx(opts?: {
  body?: unknown;
  identitySession?: ReturnType<typeof makeIdentitySession> | null;
}) {
  const identitySession = opts?.identitySession === undefined
    ? makeIdentitySession()
    : opts.identitySession;

  return {
    request: new Request('http://localhost:4000/api/reports', { method: 'POST' }),
    url: new URL('http://localhost:4000/api/reports'),
    params: {},
    query: new URLSearchParams(),
    requestId: 'req_test',
    body: opts?.body,
    locale: 'en',
    identitySession,
    errors: {
      unauthorized: () =>
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
      badRequest: () =>
        new Response(JSON.stringify({ error: { code: 'BAD_REQUEST' } }), { status: 400 }),
      validationFailed: () =>
        new Response(JSON.stringify({ error: { code: 'VALIDATION_FAILED' } }), { status: 422 }),
    },
  } as any;
}

async function callReportRoute(ctx: ReturnType<typeof makeCtx>): Promise<Response> {
  const handler = (reportRoutes as any).routes.find(
    (r: any) => r.method === 'POST' && r.pattern === '/reports',
  );
  return handler.handler(ctx);
}

beforeEach(() => {
  mockSubmitReportResult.mockReset();
  mockRequireCaptchaForFreeTier.mockReset();
  mockHasPaidAccess.mockReset();

  mockSubmitReportResult.mockImplementation(() =>
    Promise.resolve({ ok: true as const, data: { reportId: 'rpt_001' } }),
  );
  mockRequireCaptchaForFreeTier.mockImplementation(() => Promise.resolve(null));
  mockHasPaidAccess.mockImplementation(() => true);
});

describe('POST /reports', () => {
  test('unauthenticated request returns 401', async () => {
    const ctx = makeCtx({ identitySession: null });
    const res = await callReportRoute(ctx);
    expect(res.status).toBe(401);
  });

  describe('profile reports (body.type === "profile")', () => {
    test('denied for free-tier users (403 FREE_TIER_RESTRICTED)', async () => {
      mockHasPaidAccess.mockImplementation(() => false);
      const ctx = makeCtx({
        body: { type: 'profile', targetId: 'target_001' },
        identitySession: makeIdentitySession({ subscriptions: ['free'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(403);
      const json = await res.json() as { error: { code: string } };
      expect(json.error.code).toBe('FREE_TIER_RESTRICTED');
    });

    test('allowed for paid-tier users (access)', async () => {
      mockHasPaidAccess.mockImplementation(() => true);
      const ctx = makeCtx({
        body: { type: 'profile', targetId: 'target_001' },
        identitySession: makeIdentitySession({ subscriptions: ['access'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(200);
    });

    test('allowed for paid-tier users (insider)', async () => {
      mockHasPaidAccess.mockImplementation(() => true);
      const ctx = makeCtx({
        body: { type: 'profile', targetId: 'target_001' },
        identitySession: makeIdentitySession({ subscriptions: ['insider'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(200);
    });

    test('allowed for lifetime users', async () => {
      mockHasPaidAccess.mockImplementation(() => true);
      const ctx = makeCtx({
        body: { type: 'profile', targetId: 'target_001' },
        identitySession: makeIdentitySession({ isLifetime: true }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(200);
    });

    test('allowed for gifted users', async () => {
      mockHasPaidAccess.mockImplementation(() => true);
      const ctx = makeCtx({
        body: { type: 'profile', targetId: 'target_001' },
        identitySession: makeIdentitySession({ entitlements: ['gifted'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(200);
    });
  });

  describe('message reports (body.type !== "profile")', () => {
    test('allowed for free-tier users', async () => {
      mockHasPaidAccess.mockImplementation(() => false);
      const ctx = makeCtx({
        body: { type: 'message', messageId: 'msg_001' },
        identitySession: makeIdentitySession({ subscriptions: ['free'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(200);
      expect(mockHasPaidAccess).not.toHaveBeenCalled();
    });
  });

  describe('captcha enforcement', () => {
    test('free-tier user without captcha receives CAPTCHA_REQUIRED', async () => {
      const captchaResponse = new Response(
        JSON.stringify({ error: { code: 'CAPTCHA_REQUIRED' } }),
        { status: 422 },
      );
      mockRequireCaptchaForFreeTier.mockImplementation(() => Promise.resolve(captchaResponse));

      const ctx = makeCtx({
        body: { type: 'message', messageId: 'msg_001' },
        identitySession: makeIdentitySession({ subscriptions: ['free'] }),
      });
      const res = await callReportRoute(ctx);
      expect(res.status).toBe(422);
      const json = await res.json() as { error: { code: string } };
      expect(json.error.code).toBe('CAPTCHA_REQUIRED');
    });

    test('requireCaptchaForFreeTier is called with skipSessionCache', async () => {
      const ctx = makeCtx({
        body: { type: 'message', messageId: 'msg_001' },
      });
      await callReportRoute(ctx);
      expect(mockRequireCaptchaForFreeTier).toHaveBeenCalledWith(
        ctx,
        undefined,
        { skipSessionCache: true },
      );
    });
  });
});
