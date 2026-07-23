import { describe, expect, test, mock, beforeEach } from 'bun:test';

const mockRedisSet = mock(() => Promise.resolve('OK'));
const mockRedisGet = mock(() => Promise.resolve(null as string | null));
const mockIsRedisConnected = mock(() => true);
const mockGetRedis = mock(() => ({
  set: mockRedisSet,
  get: mockRedisGet,
}));

mock.module('../db', () => ({
  getRedis: mockGetRedis,
  isRedisConnected: mockIsRedisConnected,
}));

mock.module('../utils/adieuuLogger', () => {
  const stub = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { default: stub };
});

const { markCaptchaVerified, isCaptchaVerifiedRecently } = await import('./captcha-session.service');

beforeEach(() => {
  mockRedisSet.mockReset();
  mockRedisGet.mockReset();
  mockIsRedisConnected.mockReset();

  mockRedisSet.mockImplementation(() => Promise.resolve('OK'));
  mockRedisGet.mockImplementation(() => Promise.resolve(null));
  mockIsRedisConnected.mockImplementation(() => true);
});

describe('markCaptchaVerified', () => {
  test('sets the correct Redis key with 15-minute TTL', async () => {
    await markCaptchaVerified('session-123');
    expect(mockRedisSet).toHaveBeenCalledWith(
      'captcha:verified:session-123',
      expect.any(String),
      'EX',
      15 * 60,
    );
  });

  test('does nothing when Redis is not connected', async () => {
    mockIsRedisConnected.mockImplementation(() => false);
    await markCaptchaVerified('session-123');
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});

describe('isCaptchaVerifiedRecently', () => {
  test('returns true when key exists', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve(Date.now().toString()));
    const result = await isCaptchaVerifiedRecently('session-123');
    expect(result).toBe(true);
  });

  test('returns false when key does not exist', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve(null));
    const result = await isCaptchaVerifiedRecently('session-123');
    expect(result).toBe(false);
  });

  test('returns false (fail-closed) when Redis is not connected', async () => {
    mockIsRedisConnected.mockImplementation(() => false);
    const result = await isCaptchaVerifiedRecently('session-123');
    expect(result).toBe(false);
  });

  test('returns false (fail-closed) when Redis throws', async () => {
    mockRedisGet.mockImplementation(() => Promise.reject(new Error('Connection lost')));
    const result = await isCaptchaVerifiedRecently('session-123');
    expect(result).toBe(false);
  });
});
