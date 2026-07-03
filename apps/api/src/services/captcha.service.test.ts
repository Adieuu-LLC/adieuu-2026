import { describe, expect, test, mock, beforeEach } from 'bun:test';

const mockVerifyCaptchaResponse = mock(() => Promise.resolve({
  wasAbleToVerify: () => true as boolean,
  shouldAccept: () => true as boolean,
}));

mock.module('@friendlycaptcha/server-sdk', () => ({
  FriendlyCaptchaClient: class {
    verifyCaptchaResponse = mockVerifyCaptchaResponse;
  },
}));

mock.module('../config', () => ({
  config: {
    friendlyCaptcha: {
      enabled: true,
      apiKey: 'test-api-key',
      sitekey: 'test-sitekey',
    },
  },
}));

mock.module('../utils/adieuuLogger', () => {
  const stub = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { default: stub };
});

const { verifyCaptcha } = await import('./captcha.service');

beforeEach(() => {
  mockVerifyCaptchaResponse.mockReset();
  mockVerifyCaptchaResponse.mockImplementation(() => Promise.resolve({
    wasAbleToVerify: () => true,
    shouldAccept: () => true,
  }));
});

describe('verifyCaptcha', () => {
  test('returns valid for a correct captcha response', async () => {
    const result = await verifyCaptcha('valid-response-token');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('returns invalid when response is missing', async () => {
    const result = await verifyCaptcha(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('response_missing');
  });

  test('returns invalid when response is empty string', async () => {
    const result = await verifyCaptcha('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('response_missing');
  });

  test('returns invalid when captcha response is rejected', async () => {
    mockVerifyCaptchaResponse.mockImplementation(() => Promise.resolve({
      wasAbleToVerify: () => true,
      shouldAccept: () => false,
    }));
    const result = await verifyCaptcha('invalid-response');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('response_invalid');
  });

  test('returns valid (fail-open) when service is unreachable', async () => {
    mockVerifyCaptchaResponse.mockImplementation(() => Promise.resolve({
      wasAbleToVerify: () => false,
      shouldAccept: () => true,
    }));
    const result = await verifyCaptcha('some-response');
    expect(result.valid).toBe(true);
  });

  test('returns valid (fail-open) when SDK throws unexpectedly', async () => {
    mockVerifyCaptchaResponse.mockImplementation(() => Promise.reject(new Error('Network timeout')));
    const result = await verifyCaptcha('some-response');
    expect(result.valid).toBe(true);
  });
});

describe('verifyCaptcha (disabled)', () => {
  test('always returns valid when feature is disabled', async () => {
    const disabledModule = await (async () => {
      mock.module('../config', () => ({
        config: {
          friendlyCaptcha: {
            enabled: false,
            apiKey: 'real-key-but-disabled',
            sitekey: 'test-sitekey',
          },
        },
      }));
      return import('./captcha.service');
    })();
    mockVerifyCaptchaResponse.mockReset();
    const result = await disabledModule.verifyCaptcha('anything');
    expect(result.valid).toBe(true);
    expect(mockVerifyCaptchaResponse).not.toHaveBeenCalled();
  });
});
