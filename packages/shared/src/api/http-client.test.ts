import { describe, expect, it, beforeEach } from 'bun:test';
import { ApiClient, registerCaptchaHandler, clearCaptchaHandler } from './http-client';
import { API_ERROR_SESSION_EXPIRED } from '../constants/api-errors';

describe('ApiClient', () => {
  it('returns success payload from JSON response', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true, data: { id: 'x' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get<{ id: string }>('/api/foo');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe('x');
    }
  });

  it('maps AbortError to TIMEOUT when no user signal', async () => {
    const fetchImpl: typeof fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get('/api/foo');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('TIMEOUT');
    }
  });

  it('rethrows AbortError when the request signal is aborted (user cancel)', async () => {
    const fetchImpl: typeof fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const ac = new AbortController();
    ac.abort();

    await expect(client.get('/api/foo', { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('invokes onSessionExpired when API returns SESSION_EXPIRED', async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code: API_ERROR_SESSION_EXPIRED, message: 'Session expired' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      onSessionExpired: () => {
        called = true;
      },
    });

    const res = await client.get('/api/foo');
    expect(called).toBe(true);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe(API_ERROR_SESSION_EXPIRED);
    }
  });

  it('sends X-CSRF-Token on mutating requests when adieuu_csrf cookie exists', async () => {
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'adieuu_csrf=csrf-token-value' },
    });

    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    await client.post('/api/foo', { a: 1 });

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });

    expect(capturedHeaders?.['X-CSRF-Token']).toBe('csrf-token-value');
  });

  it('maps generic Error to NETWORK_ERROR', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('boom');
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get('/api/foo');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('NETWORK_ERROR');
      expect(res.error.message).toContain('boom');
    }
  });
});

describe('CAPTCHA_REQUIRED interceptor', () => {
  beforeEach(() => {
    clearCaptchaHandler();
  });

  function captchaRequiredResponse() {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'CAPTCHA_REQUIRED', message: 'Captcha required' },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  function successResponse(data: unknown = { ok: true }) {
    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('retries with captcha token when handler returns a token', async () => {
    let callCount = 0;
    let retryBodyParsed: Record<string, unknown> | undefined;

    const fetchImpl: typeof fetch = async (_url, init) => {
      callCount++;
      if (callCount === 1) return captchaRequiredResponse();
      retryBodyParsed = JSON.parse(init?.body as string);
      return successResponse();
    };

    registerCaptchaHandler(async () => 'captcha-token-abc');

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.post('/api/friends/requests', { identityId: 'id-1' });

    expect(callCount).toBe(2);
    expect(res.success).toBe(true);
    expect(retryBodyParsed?.['frc-captcha-response']).toBe('captcha-token-abc');
    expect(retryBodyParsed?.identityId).toBe('id-1');
  });

  it('returns original CAPTCHA_REQUIRED response when handler returns null (cancelled)', async () => {
    const fetchImpl: typeof fetch = async () => captchaRequiredResponse();

    registerCaptchaHandler(async () => null);

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.post('/api/test', { data: 1 });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CAPTCHA_REQUIRED');
    }
  });

  it('returns CAPTCHA_REQUIRED without retry when no handler is registered', async () => {
    const fetchImpl: typeof fetch = async () => captchaRequiredResponse();

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.post('/api/test', {});

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CAPTCHA_REQUIRED');
    }
  });

  it('does not retry more than once (recursion guard)', async () => {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount++;
      return captchaRequiredResponse();
    };

    registerCaptchaHandler(async () => 'token');

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.post('/api/test', {});

    expect(callCount).toBe(2);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CAPTCHA_REQUIRED');
    }
  });

  it('constructs body correctly for GET requests (no original body) on retry', async () => {
    let callCount = 0;
    let retryBodyParsed: Record<string, unknown> | undefined;

    const fetchImpl: typeof fetch = async (_url, init) => {
      callCount++;
      if (callCount === 1) return captchaRequiredResponse();
      retryBodyParsed = init?.body ? JSON.parse(init.body as string) : undefined;
      return successResponse();
    };

    registerCaptchaHandler(async () => 'token-for-get');

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.get('/api/data');

    expect(callCount).toBe(2);
    expect(res.success).toBe(true);
    expect(retryBodyParsed?.['frc-captcha-response']).toBe('token-for-get');
  });

  it('clears handler with clearCaptchaHandler', async () => {
    registerCaptchaHandler(async () => 'should-not-be-used');
    clearCaptchaHandler();

    const fetchImpl: typeof fetch = async () => captchaRequiredResponse();

    const client = new ApiClient({ baseUrl: 'http://example.test', fetchImpl, timeout: 5000 });
    const res = await client.post('/api/test', {});

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CAPTCHA_REQUIRED');
    }
  });
});
