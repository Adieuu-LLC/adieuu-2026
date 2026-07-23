/**
 * Unit tests for the global rate-limit middleware.
 *
 * @module middleware/rate-limit.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { RouteContext } from '../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const checkRateLimit = mock(async () => ({
  allowed: true,
  remaining: 10,
  resetAt: Math.floor(Date.now() / 1000) + 60,
  limit: 100,
})) as AnyMock;
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../services/rate-limit.service', () => ({ checkRateLimit }));

import { globalRateLimit, rateLimitedResponse } from './rate-limit';

function makeCtx(overrides: Partial<RouteContext> & { path?: string } = {}): RouteContext {
  const path = overrides.path ?? '/api/spaces';
  const url = new URL(`https://api.test${path}`);
  return {
    request: new Request(url.toString(), { headers: { 'X-Real-IP': '203.0.113.7' } }),
    url,
    params: {},
    query: url.searchParams,
    requestId: 'req-1',
    locale: 'en',
    errors: {
      rateLimited: () =>
        new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 }),
    },
    ...overrides,
  } as unknown as RouteContext;
}

const blocked = (limit = 100) => ({
  allowed: false,
  remaining: 0,
  resetAt: Math.floor(Date.now() / 1000) + 42,
  limit,
});

describe('middleware/rate-limit', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      limit: 100,
    });
  });

  test('checks the global IP limit on every request', async () => {
    const mw = globalRateLimit();
    const next = mock(async () => new Response('ok'));
    const res = await mw(makeCtx(), next);
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit.mock.calls[0]![0]).toBe('global:ip');
    // The identifier must be a hash, not the raw IP.
    expect(checkRateLimit.mock.calls[0]![1]).not.toContain('203.0.113.7');
  });

  test('returns 429 with Retry-After when the IP limit trips', async () => {
    checkRateLimit.mockResolvedValueOnce(blocked(1000));
    const mw = globalRateLimit();
    const next = mock(async () => new Response('ok'));
    const res = await mw(makeCtx(), next);
    expect(res.status).toBe(429);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1000');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  test('also checks the per-user limit for identity sessions', async () => {
    const identityId = new ObjectId();
    const ctx = makeCtx({
      identitySession: { identity: { _id: identityId } },
    } as unknown as Partial<RouteContext>);
    const mw = globalRateLimit();
    const next = mock(async () => new Response('ok'));
    await mw(ctx, next);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit.mock.calls[1]![0]).toBe('global:user');
    expect(checkRateLimit.mock.calls[1]![1]).toBe(identityId.toHexString());
  });

  test('returns 429 when the per-user limit trips', async () => {
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: 0, limit: 1000 })
      .mockResolvedValueOnce(blocked());
    const ctx = makeCtx({
      identitySession: { identity: { _id: new ObjectId() } },
    } as unknown as Partial<RouteContext>);
    const mw = globalRateLimit();
    const next = mock(async () => new Response('ok'));
    const res = await mw(ctx, next);
    expect(res.status).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('exempts health endpoints', async () => {
    const mw = globalRateLimit();
    const next = mock(async () => new Response('ok'));
    await mw(makeCtx({ path: '/api/health' }), next);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('rateLimitedResponse carries standard headers', () => {
    const res = rateLimitedResponse(makeCtx(), blocked(30));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
});
