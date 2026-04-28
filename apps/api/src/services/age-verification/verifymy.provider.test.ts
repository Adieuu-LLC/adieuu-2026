import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { createHmac, createHash, createCipheriv } from 'crypto';

const MOCK_API_KEY = 'test-api-key';
const MOCK_API_SECRET = 'test-api-secret-32-chars-long!!';

mock.module('../../config', () => ({
  config: {
    verifymy: {
      apiKey: MOCK_API_KEY,
      apiSecret: MOCK_API_SECRET,
      environment: 'sandbox' as const,
      sandboxBaseUrl: 'https://sandbox.verifymyage.com',
      productionBaseUrl: 'https://oauth.verifymyage.com',
      timeoutMs: 10_000,
    },
  },
}));

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: () => Promise.resolve(null),
  }),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { warn: () => {}, error: () => {}, info: () => {} },
}));

const { VerifyMyProvider } = await import('./verifymy.provider');

let fetchCalls: { url: string; init: RequestInit }[] = [];
let fetchResponse: { ok: boolean; status: number; body: unknown } = {
  ok: true,
  status: 200,
  body: {},
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchResponse = { ok: true, status: 200, body: {} };

  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(fetchResponse.body), {
      status: fetchResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('VerifyMyProvider', () => {
  describe('startVerification', () => {
    test('sends POST to sandbox /api/v3/verifications with HMAC auth', async () => {
      fetchResponse.body = {
        verification_id: 'vid-123',
        verification_status: 'started',
        start_verification_url: 'https://verify.verifymyage.com/flow/vid-123',
      };

      const provider = new VerifyMyProvider();
      const result = await provider.startVerification({
        redirectUrl: 'https://api.example.com/callback',
        country: 'US',
        externalUserId: 'user-1',
      });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]!.url).toBe('https://sandbox.verifymyage.com/api/v3/verifications');
      expect(fetchCalls[0]!.init.method).toBe('POST');

      const authHeader = (fetchCalls[0]!.init.headers as Record<string, string>)['Authorization'];
      expect(authHeader).toMatch(/^hmac test-api-key:/);

      const body = fetchCalls[0]!.init.body as string;
      const expectedHmac = createHmac('sha256', MOCK_API_SECRET).update(body).digest('hex');
      expect(authHeader).toBe(`hmac ${MOCK_API_KEY}:${expectedHmac}`);

      expect(result.verificationId).toBe('vid-123');
      expect(result.status).toBe('started');
      expect(result.redirectUrl).toBe('https://verify.verifymyage.com/flow/vid-123');
    });

    test('maps instant approval (background check succeeded)', async () => {
      fetchResponse.body = {
        verification_id: 'vid-456',
        verification_status: 'approved',
      };

      const provider = new VerifyMyProvider();
      const result = await provider.startVerification({
        redirectUrl: 'https://api.example.com/callback',
        country: 'gb',
        externalUserId: 'user-2',
        userInfo: { email: 'test@example.com' },
      });

      expect(result.status).toBe('approved');
      expect(result.redirectUrl).toBeUndefined();

      const sentBody = JSON.parse(fetchCalls[0]!.init.body as string);
      expect(sentBody.user_info).toBeDefined();
      expect(sentBody.user_info.email).toBeDefined();
      expect(sentBody.user_info.email).not.toBe('test@example.com');
    });

    test('encrypts user_info with AES-256-CFB', async () => {
      fetchResponse.body = {
        verification_id: 'vid-enc',
        verification_status: 'started',
        start_verification_url: 'https://verify.verifymyage.com/flow/vid-enc',
      };

      const provider = new VerifyMyProvider();
      await provider.startVerification({
        redirectUrl: 'https://api.example.com/callback',
        country: 'us',
        externalUserId: 'user-enc',
        userInfo: { email: 'enc@test.com', phone: '+15551234567' },
      });

      const sentBody = JSON.parse(fetchCalls[0]!.init.body as string);
      expect(sentBody.user_info.email).toBeDefined();
      expect(sentBody.user_info.phone).toBeDefined();

      const key = createHash('sha256').update(MOCK_API_SECRET).digest();
      const emailBuf = Buffer.from(sentBody.user_info.email, 'base64');
      const emailIv = emailBuf.subarray(0, 16);
      const emailCipher = emailBuf.subarray(16);
      const { createDecipheriv } = await import('crypto');
      const decipher = createDecipheriv('aes-256-cfb', key, emailIv);
      const decrypted = Buffer.concat([decipher.update(emailCipher), decipher.final()]).toString('utf8');
      expect(decrypted).toBe('enc@test.com');
    });

    test('includes method parameter when provided', async () => {
      fetchResponse.body = {
        verification_id: 'vid-method',
        verification_status: 'started',
        start_verification_url: 'https://verify.verifymyage.com/flow/vid-method',
      };

      const provider = new VerifyMyProvider();
      await provider.startVerification({
        redirectUrl: 'https://api.example.com/callback',
        country: 'de',
        externalUserId: 'user-3',
        method: 'AgeEstimation',
      });

      const sentBody = JSON.parse(fetchCalls[0]!.init.body as string);
      expect(sentBody.method).toBe('AgeEstimation');
    });

    test('includes webhook params when provided', async () => {
      fetchResponse.body = {
        verification_id: 'vid-wh',
        verification_status: 'started',
        start_verification_url: 'https://verify.verifymyage.com/flow/vid-wh',
      };

      const provider = new VerifyMyProvider();
      await provider.startVerification({
        redirectUrl: 'https://api.example.com/callback',
        country: 'us',
        externalUserId: 'user-wh',
        webhookUrl: 'https://api.example.com/webhook',
        webhookNotificationLevel: 'detailed',
      });

      const sentBody = JSON.parse(fetchCalls[0]!.init.body as string);
      expect(sentBody.webhook).toBe('https://api.example.com/webhook');
      expect(sentBody.webhook_notification_level).toBe('detailed');
    });

    test('throws on non-OK response', async () => {
      fetchResponse = { ok: false, status: 422, body: { error: 'Bad request' } };
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify(fetchResponse.body), { status: 422 }),
      ) as unknown as typeof fetch;

      const provider = new VerifyMyProvider();
      await expect(
        provider.startVerification({
          redirectUrl: 'https://api.example.com/callback',
          country: 'us',
          externalUserId: 'user-err',
        }),
      ).rejects.toThrow('VerifyMy API error: 422');
    });
  });

  describe('getVerificationStatus', () => {
    test('sends GET with HMAC of empty string', async () => {
      fetchResponse.body = {
        id: 'vid-status',
        status: 'pending',
        approval_method: null,
        background_check: null,
        created_at: '2026-04-28T12:00:00Z',
        expires_at: '2026-04-28T18:00:00Z',
        age_gate: {
          email: { enabled: true, max_attempts: 3, remaining_attempts: 2 },
          fae: { enabled: true, max_attempts: 5, remaining_attempts: 5 },
          idscan: { enabled: false, max_attempts: 0, remaining_attempts: 0 },
        },
      };

      const provider = new VerifyMyProvider();
      const result = await provider.getVerificationStatus('vid-status');

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]!.url).toBe('https://sandbox.verifymyage.com/api/v3/verifications/vid-status');
      expect(fetchCalls[0]!.init.method).toBe('GET');

      const authHeader = (fetchCalls[0]!.init.headers as Record<string, string>)['Authorization'];
      const expectedHmac = createHmac('sha256', MOCK_API_SECRET).update('/api/v3/verifications/vid-status').digest('hex');
      expect(authHeader).toBe(`hmac ${MOCK_API_KEY}:${expectedHmac}`);

      expect(result.verificationId).toBe('vid-status');
      expect(result.status).toBe('pending');
      expect(result.expiresAt).toBe('2026-04-28T18:00:00Z');
    });

    test('maps age_gate to methodAttempts with maxAttempts', async () => {
      fetchResponse.body = {
        id: 'vid-gate',
        status: 'started',
        age_gate: {
          email: { enabled: true, max_attempts: 3, remaining_attempts: 1 },
          fae: { enabled: true, max_attempts: 5, remaining_attempts: 5 },
        },
      };

      const provider = new VerifyMyProvider();
      const result = await provider.getVerificationStatus('vid-gate');

      expect(result.methodAttempts).toBeDefined();
      expect(result.methodAttempts!.email).toEqual({
        enabled: true,
        maxAttempts: 3,
        remaining: 1,
      });
      expect(result.methodAttempts!.fae).toEqual({
        enabled: true,
        maxAttempts: 5,
        remaining: 5,
      });
    });

    test('maps approved status and approval_method', async () => {
      fetchResponse.body = {
        id: 'vid-approved',
        status: 'approved',
        approval_method: 'AgeEstimation',
        threshold: 25,
        background_check: 'email',
      };

      const provider = new VerifyMyProvider();
      const result = await provider.getVerificationStatus('vid-approved');

      expect(result.status).toBe('approved');
      expect(result.approvalMethod).toBe('AgeEstimation');
      expect(result.threshold).toBe(25);
      expect(result.backgroundCheck).toBe('email');
    });

    test('maps unknown status to started', async () => {
      fetchResponse.body = { id: 'vid-unk', status: 'some_new_status' };

      const provider = new VerifyMyProvider();
      const result = await provider.getVerificationStatus('vid-unk');

      expect(result.status).toBe('started');
    });

    test('throws on non-OK response', async () => {
      globalThis.fetch = mock(async () =>
        new Response('Internal Server Error', { status: 500 }),
      ) as unknown as typeof fetch;

      const provider = new VerifyMyProvider();
      await expect(provider.getVerificationStatus('vid-err')).rejects.toThrow('VerifyMy API error: 500');
    });
  });
});
