import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const redisMock = {
  set: mock(() => Promise.resolve('OK')) as AnyMock,
  get: mock(() => Promise.resolve(null)) as AnyMock,
  del: mock(() => Promise.resolve(1)) as AnyMock,
  exists: mock(() => Promise.resolve(0)) as AnyMock,
  ttl: mock(() => Promise.resolve(-1)) as AnyMock,
};

const isRedisConnectedMock = mock(() => true) as AnyMock;

mock.module('../config', () => ({
  config: {
    security: {
      otpSecret: 'test-otp-secret',
      sessionSecret: 'test-session-secret',
    },
  },
}));

mock.module('../db', () => ({
  getRedis: () => redisMock,
  isRedisConnected: () => isRedisConnectedMock(),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
  },
}));

import { createOtp, verifyOtp } from './otp.service';

describe('otp.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    redisMock.del.mockReset();
    redisMock.exists.mockReset();
    redisMock.ttl.mockReset();
    isRedisConnectedMock.mockReset();

    redisMock.set.mockImplementation(() => Promise.resolve('OK'));
    redisMock.get.mockImplementation(() => Promise.resolve(null));
    redisMock.del.mockImplementation(() => Promise.resolve(1));
    isRedisConnectedMock.mockImplementation(() => true);
  });

  test('createOtp returns null when redis is unavailable', async () => {
    isRedisConnectedMock.mockImplementation(() => false);
    const result = await createOtp('user@example.com', 'email');
    expect(result).toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  test('createOtp stores hashed OTP with expiration', async () => {
    const result = await createOtp('user@example.com', 'email');
    expect(result).toMatch(/^\d{6}$/);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const [key, value, exKeyword, ttl] = redisMock.set.mock.calls[0]! as unknown as [
      string,
      string,
      string,
      number,
    ];
    expect(key.startsWith('otp:')).toBe(true);
    expect(exKeyword).toBe('EX');
    expect(ttl).toBe(600);
    const parsed = JSON.parse(value) as { hash: string; attempts: number; type: string };
    expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.attempts).toBe(0);
    expect(parsed.type).toBe('email');
  });

  test('verifyOtp returns not_found when no OTP exists', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(null));
    const result = await verifyOtp('user@example.com', '111111');
    expect(result).toEqual({ valid: false, error: 'not_found' });
  });

  test('verifyOtp deletes key on successful verification', async () => {
    const identifier = 'user@example.com';
    const code = await createOtp(identifier, 'email');
    const storedPayload = redisMock.set.mock.calls[0]![1] as string;
    redisMock.get.mockImplementation(() => Promise.resolve(storedPayload));

    const result = await verifyOtp(identifier, code!);
    expect(result).toEqual({ valid: true });
    expect(redisMock.del).toHaveBeenCalledWith(expect.stringMatching(/^otp:/));
  });

  test('verifyOtp increments attempts and applies backoff on invalid code', async () => {
    const identifier = 'user@example.com';
    redisMock.get.mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          hash: 'not-the-right-hash',
          attempts: 1,
          createdAt: Date.now(),
          type: 'email',
        })
      )
    );

    const result = await verifyOtp(identifier, '000000');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid');
    expect(result.failedAttempts).toBe(2);
    expect(result.retryAfterSeconds).toBe(4);
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(/^otp:/),
      expect.any(String),
      'KEEPTTL'
    );
  });

  test('verifyOtp returns backoff when retry is too soon', async () => {
    redisMock.get.mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          hash: 'otp-hash:correct:user@example.com',
          attempts: 2,
          createdAt: Date.now(),
          type: 'email',
          backoffUntil: Date.now() + 10_000,
        })
      )
    );

    const result = await verifyOtp('user@example.com', '000000');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('backoff');
    expect(result.failedAttempts).toBe(2);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('verifyOtp returns max_attempts when limit reached', async () => {
    redisMock.get.mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          hash: 'otp-hash:correct:user@example.com',
          attempts: 5,
          createdAt: Date.now(),
          type: 'email',
        })
      )
    );

    const result = await verifyOtp('user@example.com', '000000');
    expect(result).toEqual({ valid: false, error: 'max_attempts', failedAttempts: 5 });
  });

  test('verifyOtp handles malformed redis payload as not_found', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve('{not-json'));
    const result = await verifyOtp('user@example.com', '000000');
    expect(result).toEqual({ valid: false, error: 'not_found' });
    expect(redisMock.del).toHaveBeenCalledWith(expect.stringMatching(/^otp:/));
  });
});

