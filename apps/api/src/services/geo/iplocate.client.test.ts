import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';

const mockFetch = mock((_url: string) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        country_code: 'US',
        subdivision: 'Tennessee',
        privacy: { is_anonymous: true, is_abuser: false },
      }),
  } as Response),
);

import { lookupIp } from './iplocate.client';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockFetch.mockClear();
});

describe('lookupIp privacy fields', () => {
  test('parses is_anonymous and is_abuser from privacy object', async () => {
    const result = await lookupIp('8.8.8.8', mockFetch as typeof fetch);
    expect(result?.countryCode).toBe('US');
    expect(result?.privacy?.isAnonymous).toBe(true);
    expect(result?.privacy?.isAbuser).toBe(false);
  });

  test('defaults privacy flags to false when absent', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ country_code: 'DE' }),
      } as Response),
    );
    const result = await lookupIp('8.8.8.8', mockFetch as typeof fetch);
    expect(result?.privacy).toBeUndefined();
  });
});
