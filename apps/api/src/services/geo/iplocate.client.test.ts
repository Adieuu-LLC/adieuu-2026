import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';

const originalFetch = globalThis.fetch;

mock.module('../../config', () => ({
  config: {
    geo: {
      iplocate: {
        apiKey: '',
        baseUrl: 'https://www.iplocate.io/api/lookup',
        timeoutMs: 2500,
      },
    },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  },
}));

import { lookupIp } from './iplocate.client';

afterAll(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe('lookupIp', () => {
  test('returns parsed result on 200', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            country_code: 'US',
            subdivision: 'Tennessee',
            city: 'Nashville',
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;

    const result = await lookupIp('1.2.3.4');
    expect(result).toEqual({
      countryCode: 'US',
      subdivisionName: 'Tennessee',
      city: 'Nashville',
    });
  });

  test('returns null on non-200', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('rate limited', { status: 429 })),
    ) as unknown as typeof fetch;

    const result = await lookupIp('1.2.3.4');
    expect(result).toBeNull();
  });

  test('returns null on network error', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('network down')),
    ) as unknown as typeof fetch;

    const result = await lookupIp('1.2.3.4');
    expect(result).toBeNull();
  });

  test('returns null when response has no country_code', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ city: 'London' }), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    const result = await lookupIp('1.2.3.4');
    expect(result).toBeNull();
  });

  test('returns null on malformed JSON', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('not json', { status: 200 })),
    ) as unknown as typeof fetch;

    const result = await lookupIp('1.2.3.4');
    expect(result).toBeNull();
  });

  test('handles missing optional fields', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ country_code: 'DE' }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;

    const result = await lookupIp('5.6.7.8');
    expect(result).toEqual({
      countryCode: 'DE',
      subdivisionName: undefined,
      city: undefined,
    });
  });
});
