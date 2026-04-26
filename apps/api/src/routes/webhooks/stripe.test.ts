import { describe, expect, test, mock, afterAll, beforeEach } from 'bun:test';

const mockApplySubscriptionChange = mock(() => Promise.resolve());

mock.module('../../config', () => ({
  config: {
    stripe: {
      enabled: true,
      secretKey: 'sk_test_xxx',
      webhookSecret: 'whsec_test_xxx',
    },
  },
}));

const mockConstructEvent = mock((body: string, sig: string, secret: string) => {
  if (sig === 'valid-sig') {
    return { id: 'evt_123', type: 'checkout.session.completed', data: { object: {} } };
  }
  throw new Error('Invalid signature');
});

mock.module('../../services/billing/stripe.client', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

mock.module('../../services/billing/billing.service', () => ({
  applySubscriptionChange: mockApplySubscriptionChange,
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockApplySubscriptionChange.mockReset();
  mockConstructEvent.mockClear();
});

describe('POST /webhooks/stripe', () => {
  test('returns 400 when stripe-signature header is missing', async () => {
    const { stripeWebhookRoutes } = await import('./stripe');
    const handler = stripeWebhookRoutes.handler();

    const req = new Request('http://localhost:4000/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 on invalid signature', async () => {
    const { stripeWebhookRoutes } = await import('./stripe');
    const handler = stripeWebhookRoutes.handler();

    const req = new Request('http://localhost:4000/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'bad-sig',
      },
      body: JSON.stringify({ test: true }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test('returns 200 and calls applySubscriptionChange on valid event', async () => {
    const { stripeWebhookRoutes } = await import('./stripe');
    const handler = stripeWebhookRoutes.handler();

    const req = new Request('http://localhost:4000/webhooks/stripe', {
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
