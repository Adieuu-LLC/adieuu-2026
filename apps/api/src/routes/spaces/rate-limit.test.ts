/**
 * Unit tests for per-endpoint Space route rate limiting.
 *
 * @module routes/spaces/rate-limit.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const checkRateLimit = mock(async () => ({
  allowed: true,
  remaining: 10,
  resetAt: Math.floor(Date.now() / 1000) + 60,
  limit: 30,
})) as AnyMock;
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../services/rate-limit.service', () => ({ checkRateLimit }));

import { withSpaceRateLimit, SPACE_RATE_LIMITS } from './rate-limit';

function makeCtx(identityId?: ObjectId): RouteContext {
  const url = new URL('https://api.test/api/spaces');
  return {
    request: new Request(url.toString()),
    url,
    params: {},
    query: url.searchParams,
    requestId: 'req-1',
    locale: 'en',
    errors: {
      rateLimited: () =>
        new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 }),
    },
    identitySession: identityId ? { identity: { _id: identityId } } : null,
  } as unknown as RouteContext;
}

describe('routes/spaces/rate-limit', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      limit: 30,
    });
  });

  test('meters authenticated requests per identity with the action config', async () => {
    const identityId = new ObjectId();
    const handler = mock(async () => new Response('ok'));
    const wrapped = withSpaceRateLimit('spaces:message', handler);
    const res = await wrapped(makeCtx(identityId));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(
      'spaces:message',
      identityId.toHexString(),
      SPACE_RATE_LIMITS['spaces:message'],
    );
  });

  test('returns 429 without invoking the handler when the limit trips', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      limit: 5,
    });
    const handler = mock(async () => new Response('ok'));
    const wrapped = withSpaceRateLimit('spaces:create', handler);
    const res = await wrapped(makeCtx(new ObjectId()));
    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  test('does not meter unauthenticated requests (controllers 401 them)', async () => {
    const handler = mock(async () => new Response('unauthorized', { status: 401 }));
    const wrapped = withSpaceRateLimit('spaces:read', handler);
    const res = await wrapped(makeCtx());
    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  test('defines tight limits for expensive actions', () => {
    // Regression guard: creation must stay far below messaging cadence.
    expect(SPACE_RATE_LIMITS['spaces:create'].limit).toBeLessThanOrEqual(10);
    expect(SPACE_RATE_LIMITS['spaces:create'].windowSeconds).toBeGreaterThanOrEqual(600);
    expect(SPACE_RATE_LIMITS['spaces:invite'].limit).toBeLessThanOrEqual(60);
  });
});
