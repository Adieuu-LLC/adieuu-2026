/**
 * Webhooks controller and route tests.
 *
 * Validates Stripe signature verification, event processing, and route wiring.
 * All Stripe and billing interactions are mocked — no network access required.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockApplySubscriptionChange = mock(() => Promise.resolve());

const stripeConfig = {
  enabled: true,
  secretKey: 'sk_test_xxx',
  webhookSecret: 'whsec_test_xxx',
};

mock.module('../../config', () => ({
  config: {
    stripe: stripeConfig,
  },
}));

const mockConstructEventAsync = mock((body: string, sig: string, secret: string) => {
  if (sig === 'valid-sig') {
    return Promise.resolve({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: { object: {} },
    });
  }
  return Promise.reject(new Error('Invalid signature'));
});

mock.module('../../services/billing/stripe.client', () => ({
  getStripe: () => ({
    webhooks: {
      constructEventAsync: mockConstructEventAsync,
    },
  }),
}));

mock.module('../../services/billing/billing.service', () => ({
  applySubscriptionChange: mockApplySubscriptionChange,
  billingErrorLogFields: (err: unknown) => ({
    errorMessage: err instanceof Error ? err.message : String(err),
  }),
}));

const mockElogInfo = mock();
const mockElogWarn = mock();
const mockElogError = mock();

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mockElogInfo,
    warn: mockElogWarn,
    error: mockElogError,
    debug: mock(),
  },
}));

import { Router } from '../../router';
import { handleStripeWebhookResult } from './controller';
import { webhookRoutes } from './index';

const DEFAULT_STRIPE_CONFIG = {
  enabled: true,
  secretKey: 'sk_test_xxx',
  webhookSecret: 'whsec_test_xxx',
};

function createHandler() {
  const app = new Router();
  app.merge(webhookRoutes, '/api');
  return app.handler();
}

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  Object.assign(stripeConfig, DEFAULT_STRIPE_CONFIG);
  mockApplySubscriptionChange.mockReset();
  mockApplySubscriptionChange.mockImplementation(() => Promise.resolve());
  mockConstructEventAsync.mockClear();
  mockElogInfo.mockClear();
  mockElogWarn.mockClear();
  mockElogError.mockClear();
});

describe('handleStripeWebhookResult', () => {
  test('returns stripe_disabled when Stripe is not enabled', async () => {
    stripeConfig.enabled = false;

    const result = await handleStripeWebhookResult({
      rawBody: '{}',
      signature: 'valid-sig',
    });

    expect(result).toEqual({ ok: false, kind: 'stripe_disabled' });
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  test('returns missing_signature when header is absent', async () => {
    const result = await handleStripeWebhookResult({
      rawBody: '{}',
      signature: null,
    });

    expect(result).toEqual({ ok: false, kind: 'missing_signature' });
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  test('returns missing_body when rawBody is undefined', async () => {
    const result = await handleStripeWebhookResult({
      rawBody: undefined,
      signature: 'valid-sig',
    });

    expect(result).toEqual({ ok: false, kind: 'missing_body' });
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  test('returns webhook_not_configured when secret is empty', async () => {
    stripeConfig.webhookSecret = '';

    const result = await handleStripeWebhookResult({
      rawBody: '{}',
      signature: 'valid-sig',
    });

    expect(result).toEqual({ ok: false, kind: 'webhook_not_configured' });
    expect(mockElogError).toHaveBeenCalled();
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  test('returns invalid_signature on bad signature', async () => {
    const result = await handleStripeWebhookResult({
      rawBody: '{}',
      signature: 'bad-sig',
    });

    expect(result).toEqual({ ok: false, kind: 'invalid_signature' });
    expect(mockElogWarn).toHaveBeenCalled();
    expect(mockApplySubscriptionChange).not.toHaveBeenCalled();
  });

  test('returns ok and calls applySubscriptionChange on valid event', async () => {
    const result = await handleStripeWebhookResult({
      rawBody: JSON.stringify({ type: 'checkout.session.completed' }),
      signature: 'valid-sig',
    });

    expect(result).toEqual({ ok: true, data: { received: true } });
    expect(mockApplySubscriptionChange).toHaveBeenCalled();
    expect(mockElogInfo).toHaveBeenCalled();
  });

  test('returns ok even when applySubscriptionChange rejects', async () => {
    mockApplySubscriptionChange.mockImplementation(() =>
      Promise.reject(new Error('processing failed')),
    );

    const result = await handleStripeWebhookResult({
      rawBody: JSON.stringify({ type: 'checkout.session.completed' }),
      signature: 'valid-sig',
    });

    expect(result).toEqual({ ok: true, data: { received: true } });
    expect(mockElogError).toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe', () => {
  test('returns 400 when stripe-signature header is missing', async () => {
    const handler = createHandler();

    const req = new Request('http://localhost:4000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Missing signature');
  });

  test('returns 400 on invalid signature', async () => {
    const handler = createHandler();

    const req = new Request('http://localhost:4000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'bad-sig',
      },
      body: JSON.stringify({ test: true }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid signature');
  });

  test('returns 200 and calls applySubscriptionChange on valid event', async () => {
    const handler = createHandler();

    const req = new Request('http://localhost:4000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'valid-sig',
      },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(mockApplySubscriptionChange).toHaveBeenCalled();
  });
});
