/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Webhook-shaped tests for billing side-effects (e.g. post-checkout background age checks).
 */
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const USER_ID = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const mockInitiateBackgroundCheck = mock(async () => {});

mock.module('../../config', () => ({
  config: {
    stripe: {
      enabled: true,
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test',
      publishableKey: 'pk_test_fake',
      prices: {
        accessAnnual: '',
        insiderAnnual: '',
        vanguardLifetime: '',
        founderLifetime: '',
      },
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      portalReturnUrl: 'https://example.com/portal-return',
    },
  },
}));

mock.module('../age-verification/background-check.service', () => ({
  initiateBackgroundCheck: mockInitiateBackgroundCheck,
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: mock(), warn: mock(), error: mock(), debug: mock() },
}));

const colFindOne = mock(async () => null);
const colInsertOne = mock(async () => ({}));

mock.module('../../db', () => ({
  getCollection: () => ({
    findOne: colFindOne,
    insertOne: colInsertOne,
  }),
  Collections: { STRIPE_PROCESSED_EVENTS: 'stripe_processed_events' },
}));

const userDoc = {
  _id: USER_ID,
  email: 'buyer@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  maxIdentities: 2,
};

const mockUpdateBilling = mock(async () => {});
const mockUpdateStripeCustomerId = mock(async () => {});

const mockFindById = mock(async (id: string | ObjectId) => {
  const hex = typeof id === 'string' ? id : id.toHexString();
  if (hex === USER_ID.toHexString()) return userDoc as any;
  return null;
});

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    updateBilling: mockUpdateBilling,
    updateStripeCustomerId: mockUpdateStripeCustomerId,
  }),
}));

const mockSubscriptionsRetrieve = mock(async (id: string) => ({
  id,
  status: 'active',
  items: {
    data: [
      {
        price: 'price_test',
        current_period_end: Math.floor(Date.now() / 1000) + 86_400,
      },
    ],
  },
  cancel_at_period_end: false,
  cancel_at: null,
}));

const mockCheckoutSessionsRetrieve = mock(async () => ({
  line_items: { data: [{ price: { id: 'price_lt' } }] },
  payment_intent: 'pi_123',
}));

mock.module('./stripe.client', () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    checkout: { sessions: { retrieve: mockCheckoutSessionsRetrieve } },
  }),
}));

const { applySubscriptionChange } = await import('./billing.service');

async function flushFireAndForget(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('applySubscriptionChange → initiateBackgroundCheck', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockInitiateBackgroundCheck.mockClear();
    mockUpdateBilling.mockClear();
    mockUpdateStripeCustomerId.mockClear();
    mockFindById.mockClear();
    colFindOne.mockClear();
    colInsertOne.mockClear();
    mockSubscriptionsRetrieve.mockClear();
    mockCheckoutSessionsRetrieve.mockClear();
  });

  test('fires after subscription checkout.session.completed', async () => {
    const session = {
      id: 'cs_1',
      client_reference_id: USER_ID.toHexString(),
      mode: 'subscription',
      subscription: 'sub_1',
      customer: 'cus_1',
    };
    const event = { id: 'evt_checkout_sub_1', type: 'checkout.session.completed', data: { object: session } };

    await applySubscriptionChange(event as any);
    await flushFireAndForget();

    expect(mockUpdateBilling).toHaveBeenCalled();
    expect(mockInitiateBackgroundCheck).toHaveBeenCalledTimes(1);
    const callArgs = mockInitiateBackgroundCheck.mock.calls.at(0);
    expect(callArgs).toBeDefined();
    const userArg = (callArgs as unknown as [UserDocument])[0];
    expect(userArg?.email).toBe('buyer@example.com');
  });

  test('fires after one-time payment checkout.session.completed', async () => {
    const session = {
      id: 'cs_2',
      client_reference_id: USER_ID.toHexString(),
      mode: 'payment',
      payment_intent: 'pi_123',
      customer: 'cus_1',
    };
    const event = { id: 'evt_checkout_pay_1', type: 'checkout.session.completed', data: { object: session } };

    await applySubscriptionChange(event as any);
    await flushFireAndForget();

    expect(mockUpdateBilling).toHaveBeenCalled();
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalled();
    expect(mockInitiateBackgroundCheck).toHaveBeenCalledTimes(1);
  });

  test('fires on customer.subscription.updated', async () => {
    const subscription = {
      id: 'sub_2',
      metadata: { userId: USER_ID.toHexString() },
    };
    const event = {
      id: 'evt_sub_upd_1',
      type: 'customer.subscription.updated',
      data: { object: subscription },
    };

    await applySubscriptionChange(event as any);
    await flushFireAndForget();

    expect(mockUpdateBilling).toHaveBeenCalled();
    expect(mockInitiateBackgroundCheck).toHaveBeenCalledTimes(1);
  });
});
