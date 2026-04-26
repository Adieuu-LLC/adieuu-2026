/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, afterAll, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubscriptionRetrieve: any = mock((): any =>
  Promise.resolve({
    id: 'sub_123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 86400,
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: 'price_access_annual' } }],
    },
  }),
);

const mockCheckoutSessionRetrieve: any = mock((): any =>
  Promise.resolve({
    id: 'cs_123',
    line_items: { data: [] },
  }),
);

const mockCheckoutSessionCreate: any = mock((): any =>
  Promise.resolve({ id: 'cs_new', url: 'https://checkout.stripe.com/test' }),
);

const mockCustomerCreate: any = mock((): any =>
  Promise.resolve({ id: 'cus_new_123' }),
);

const mockPortalSessionCreate: any = mock((): any =>
  Promise.resolve({ url: 'https://billing.stripe.com/portal' }),
);

mock.module('../../config', () => ({
  config: {
    stripe: {
      enabled: true,
      secretKey: 'sk_test_xxx',
      webhookSecret: 'whsec_xxx',
      publishableKey: 'pk_test_xxx',
      prices: {
        accessAnnual: 'price_access_annual',
        insiderAnnual: 'price_insider_annual',
        vanguardLifetime: 'price_vanguard_lifetime',
        founderLifetime: 'price_founder_lifetime',
      },
      successUrl: 'http://localhost:3000/account/subscription?status=success',
      cancelUrl: 'http://localhost:3000/account/subscription?status=cancelled',
      portalReturnUrl: 'http://localhost:3000/account/subscription',
    },
  },
}));

const mockFindById: any = mock((): any => Promise.resolve(null));
const mockUpdateStripeCustomerId: any = mock((): any => Promise.resolve());
const mockUpdateBilling: any = mock((): any => Promise.resolve());

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    updateStripeCustomerId: mockUpdateStripeCustomerId,
    updateBilling: mockUpdateBilling,
  }),
}));

const mockFindOne: any = mock((): any => Promise.resolve(null));
const mockInsertOne: any = mock((): any => Promise.resolve({ insertedId: 'test' }));

mock.module('../../db', () => ({
  getCollection: () => ({
    findOne: mockFindOne,
    insertOne: mockInsertOne,
  }),
  Collections: {
    STRIPE_PROCESSED_EVENTS: 'stripe_processed_events',
  },
}));

mock.module('./stripe.client', () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockSubscriptionRetrieve },
    checkout: { sessions: { create: mockCheckoutSessionCreate, retrieve: mockCheckoutSessionRetrieve } },
    customers: { create: mockCustomerCreate },
    billingPortal: { sessions: { create: mockPortalSessionCreate } },
  }),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import {
  tierIdsForPriceIds,
  entitlementsForPriceIds,
  applySubscriptionChange,
  getOrCreateStripeCustomer,
  createCheckoutSessionForProduct,
  createBillingPortalSession,
} from './billing.service';
import type { UserBilling, UserDocument } from '../../models/user';
import { ObjectId } from 'mongodb';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockFindOne.mockReset();
  mockInsertOne.mockReset();
  mockFindById.mockReset();
  mockUpdateBilling.mockReset();
  mockUpdateStripeCustomerId.mockReset();
  mockSubscriptionRetrieve.mockClear();
  mockCheckoutSessionRetrieve.mockClear();
  mockCheckoutSessionCreate.mockClear();
  mockCustomerCreate.mockClear();
  mockPortalSessionCreate.mockClear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeUser(overrides?: Partial<UserDocument>): UserDocument {
  return {
    _id: new ObjectId(),
    emailVerified: true,
    email: 'test@example.com',
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3600000,
    identityLoginAttempts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserDocument;
}

function fakeStripeEvent(type: string, object: unknown): { id: string; type: string; data: { object: unknown } } {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    data: { object },
  };
}

// ---------------------------------------------------------------------------
// Price -> tier / entitlement mapping
// ---------------------------------------------------------------------------

describe('tierIdsForPriceIds', () => {
  test('maps Access annual price to access tier', () => {
    expect(tierIdsForPriceIds(['price_access_annual'])).toEqual(['access']);
  });

  test('maps Insider annual price to insider tier', () => {
    expect(tierIdsForPriceIds(['price_insider_annual'])).toEqual(['insider']);
  });

  test('maps Vanguard lifetime price to insider tier', () => {
    expect(tierIdsForPriceIds(['price_vanguard_lifetime'])).toEqual(['insider']);
  });

  test('maps Founder lifetime price to insider tier', () => {
    expect(tierIdsForPriceIds(['price_founder_lifetime'])).toEqual(['insider']);
  });

  test('deduplicates tiers from multiple prices granting the same tier', () => {
    const tiers = tierIdsForPriceIds(['price_vanguard_lifetime', 'price_founder_lifetime']);
    expect(tiers).toEqual(['insider']);
  });

  test('returns both tiers when Access and Insider prices are present', () => {
    const tiers = tierIdsForPriceIds(['price_access_annual', 'price_insider_annual']);
    expect(tiers).toContain('access');
    expect(tiers).toContain('insider');
    expect(tiers).toHaveLength(2);
  });

  test('returns empty array for unknown price IDs', () => {
    expect(tierIdsForPriceIds(['price_unknown_999'])).toEqual([]);
  });

  test('handles mixed known and unknown price IDs', () => {
    expect(tierIdsForPriceIds(['price_unknown_999', 'price_access_annual'])).toEqual(['access']);
  });

  test('returns empty array for empty input', () => {
    expect(tierIdsForPriceIds([])).toEqual([]);
  });
});

describe('entitlementsForPriceIds', () => {
  test('returns vanguard entitlement for Vanguard price', () => {
    expect(entitlementsForPriceIds(['price_vanguard_lifetime'])).toEqual(['vanguard']);
  });

  test('returns founder entitlement for Founder price', () => {
    expect(entitlementsForPriceIds(['price_founder_lifetime'])).toEqual(['founder']);
  });

  test('returns both entitlements when both lifetime prices present', () => {
    const ents = entitlementsForPriceIds(['price_vanguard_lifetime', 'price_founder_lifetime']);
    expect(ents).toContain('vanguard');
    expect(ents).toContain('founder');
    expect(ents).toHaveLength(2);
  });

  test('returns no entitlements for recurring subscriptions', () => {
    expect(entitlementsForPriceIds(['price_access_annual'])).toEqual([]);
    expect(entitlementsForPriceIds(['price_insider_annual'])).toEqual([]);
  });

  test('returns empty array for unknown price IDs', () => {
    expect(entitlementsForPriceIds(['price_unknown'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

describe('getOrCreateStripeCustomer', () => {
  test('returns existing stripeCustomerId if present', async () => {
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    const result = await getOrCreateStripeCustomer(user);
    expect(result).toBe('cus_existing');
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  test('creates new customer and persists id when missing', async () => {
    const user = fakeUser();
    const result = await getOrCreateStripeCustomer(user);
    expect(result).toBe('cus_new_123');
    expect(mockCustomerCreate).toHaveBeenCalled();
    expect(mockUpdateStripeCustomerId).toHaveBeenCalledWith(user._id, 'cus_new_123');
  });
});

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

describe('createCheckoutSessionForProduct', () => {
  test('creates a subscription checkout for access product', async () => {
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    const result = await createCheckoutSessionForProduct(user, 'access');
    expect(result.url).toBe('https://checkout.stripe.com/test');
    const call = mockCheckoutSessionCreate.mock.calls[0] as [Record<string, unknown>];
    expect(call[0].mode).toBe('subscription');
    expect(call[0].subscription_data).toBeDefined();
  });

  test('creates a payment checkout for vanguard product', async () => {
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    const result = await createCheckoutSessionForProduct(user, 'vanguard');
    expect(result.url).toBe('https://checkout.stripe.com/test');
    const call = mockCheckoutSessionCreate.mock.calls[0] as [Record<string, unknown>];
    expect(call[0].mode).toBe('payment');
    expect(call[0].payment_intent_data).toBeDefined();
    expect(call[0].subscription_data).toBeUndefined();
  });

  test('creates a payment checkout for founder product', async () => {
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    await createCheckoutSessionForProduct(user, 'founder');
    const call = mockCheckoutSessionCreate.mock.calls[0] as [Record<string, unknown>];
    expect(call[0].mode).toBe('payment');
  });

  test('throws when Stripe returns no URL', async () => {
    mockCheckoutSessionCreate.mockResolvedValueOnce({ id: 'cs_fail', url: null });
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    await expect(createCheckoutSessionForProduct(user, 'access')).rejects.toThrow(
      'Stripe did not return a checkout URL',
    );
  });
});

// ---------------------------------------------------------------------------
// Portal session creation
// ---------------------------------------------------------------------------

describe('createBillingPortalSession', () => {
  test('throws when user has no stripeCustomerId', async () => {
    const user = fakeUser();
    await expect(createBillingPortalSession(user)).rejects.toThrow('User has no Stripe customer');
  });

  test('returns portal URL when user has customer id', async () => {
    const user = fakeUser({ stripeCustomerId: 'cus_existing' });
    const result = await createBillingPortalSession(user);
    expect(result.url).toBe('https://billing.stripe.com/portal');
  });
});

// ---------------------------------------------------------------------------
// applySubscriptionChange — webhook event processing
// ---------------------------------------------------------------------------

describe('applySubscriptionChange', () => {
  test('skips already-processed events (idempotency)', async () => {
    mockFindOne.mockResolvedValueOnce({ eventId: 'evt_dup' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange({ id: 'evt_dup', type: 'checkout.session.completed', data: { object: {} } } as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  test('marks events as processed after handling', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_new',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_access_annual' } }] },
    });

    const event = fakeStripeEvent('customer.subscription.created', {
      id: 'sub_new',
      metadata: { userId: user._id.toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockInsertOne).toHaveBeenCalled();
  });

  test('ignores unhandled event types without marking processed', async () => {
    const event = fakeStripeEvent('charge.refunded', {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  // --- checkout.session.completed (subscription mode) ---

  test('handles subscription checkout: sets tiers and subscription id', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_access',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_access_annual' } }] },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_sub',
      mode: 'subscription',
      subscription: 'sub_access',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    expect(mockUpdateBilling).toHaveBeenCalled();
    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toEqual(['access']);
    expect(billing.entitlements).toEqual([]);
    expect(billing.isLifetime).toBe(false);
    expect(billing.stripeSubscriptionId).toBe('sub_access');
    expect(billing.status).toBe('active');
  });

  test('handles subscription checkout: persists stripeCustomerId when missing', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_access_annual' } }] },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_cust',
      mode: 'subscription',
      subscription: 'sub_1',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_new_from_checkout',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateStripeCustomerId).toHaveBeenCalledWith(user._id, 'cus_new_from_checkout');
  });

  // --- checkout.session.completed (payment mode — lifetime) ---

  test('handles payment checkout (Vanguard): sets insider tier, vanguard entitlement, lifetime', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_pay',
      line_items: {
        data: [{ price: { id: 'price_vanguard_lifetime' } }],
      },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_pay',
      mode: 'payment',
      payment_intent: 'pi_vanguard',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    expect(mockUpdateBilling).toHaveBeenCalled();
    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toContain('insider');
    expect(billing.entitlements).toContain('vanguard');
    expect(billing.isLifetime).toBe(true);
    expect(billing.status).toBe('active');
    expect(billing.stripePaymentIntentId).toBe('pi_vanguard');
  });

  test('handles payment checkout (Founder): sets insider tier, founder entitlement, lifetime', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_founder',
      line_items: {
        data: [{ price: { id: 'price_founder_lifetime' } }],
      },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_founder',
      mode: 'payment',
      payment_intent: 'pi_founder',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toContain('insider');
    expect(billing.entitlements).toContain('founder');
    expect(billing.isLifetime).toBe(true);
  });

  test('payment checkout with no line items does not update billing', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_empty',
      line_items: { data: [] },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_empty',
      mode: 'payment',
      payment_intent: 'pi_empty',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  // --- Lifetime purchase merges with existing recurring sub ---

  test('lifetime purchase preserves existing recurring subscription data', async () => {
    const existingBilling: UserBilling = {
      activeSubscriptions: ['access'],
      entitlements: [],
      isLifetime: false,
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 180 * 86400 * 1000),
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: 'sub_existing',
      updatedAt: new Date(),
    };
    const user = fakeUser({ billing: existingBilling });
    mockFindById.mockResolvedValue(user);
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_upgrade',
      line_items: { data: [{ price: { id: 'price_vanguard_lifetime' } }] },
    });

    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_upgrade',
      mode: 'payment',
      payment_intent: 'pi_upgrade',
      client_reference_id: user._id.toHexString(),
      customer: 'cus_test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toContain('insider');
    expect(billing.activeSubscriptions).toContain('access');
    expect(billing.entitlements).toContain('vanguard');
    expect(billing.isLifetime).toBe(true);
    expect(billing.stripeSubscriptionId).toBe('sub_existing');
  });

  // --- customer.subscription.updated ---

  test('subscription update event syncs billing from Stripe', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_upd',
      status: 'past_due',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: true,
      items: { data: [{ price: { id: 'price_insider_annual' } }] },
    });

    const event = fakeStripeEvent('customer.subscription.updated', {
      id: 'sub_upd',
      metadata: { userId: user._id.toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toEqual(['insider']);
    expect(billing.status).toBe('past_due');
    expect(billing.cancelAtPeriodEnd).toBe(true);
  });

  test('subscription event with missing userId metadata is silently skipped', async () => {
    const event = fakeStripeEvent('customer.subscription.updated', {
      id: 'sub_no_user',
      metadata: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  test('subscription event for unknown user is silently skipped', async () => {
    mockFindById.mockResolvedValue(null);
    const event = fakeStripeEvent('customer.subscription.updated', {
      id: 'sub_ghost',
      metadata: { userId: new ObjectId().toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  // --- Subscription event preserves lifetime tiers/entitlements ---

  test('subscription update event preserves lifetime tiers and entitlements', async () => {
    const existingBilling: UserBilling = {
      activeSubscriptions: ['insider'],
      entitlements: ['vanguard'],
      isLifetime: true,
      status: 'active',
      stripePaymentIntentId: 'pi_lifetime',
      updatedAt: new Date(),
    };
    const user = fakeUser({ billing: existingBilling });
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_recurring',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_access_annual' } }] },
    });

    const event = fakeStripeEvent('customer.subscription.updated', {
      id: 'sub_recurring',
      metadata: { userId: user._id.toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toContain('insider');
    expect(billing.activeSubscriptions).toContain('access');
    expect(billing.entitlements).toContain('vanguard');
    expect(billing.isLifetime).toBe(true);
    expect(billing.stripePaymentIntentId).toBe('pi_lifetime');
  });

  // --- customer.subscription.deleted ---

  test('subscription deleted clears billing for non-lifetime user', async () => {
    const existingBilling: UserBilling = {
      activeSubscriptions: ['access'],
      entitlements: [],
      isLifetime: false,
      status: 'active',
      stripeSubscriptionId: 'sub_del',
      updatedAt: new Date(),
    };
    const user = fakeUser({ billing: existingBilling });
    mockFindById.mockResolvedValue(user);

    const event = fakeStripeEvent('customer.subscription.deleted', {
      id: 'sub_del',
      metadata: { userId: user._id.toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toEqual([]);
    expect(billing.entitlements).toEqual([]);
    expect(billing.isLifetime).toBe(false);
    expect(billing.status).toBe('canceled');
  });

  test('subscription deleted preserves lifetime access', async () => {
    const existingBilling: UserBilling = {
      activeSubscriptions: ['insider'],
      entitlements: ['founder'],
      isLifetime: true,
      status: 'active',
      stripeSubscriptionId: 'sub_del_lt',
      stripePaymentIntentId: 'pi_founder',
      updatedAt: new Date(),
    };
    const user = fakeUser({ billing: existingBilling });
    mockFindById.mockResolvedValue(user);

    const event = fakeStripeEvent('customer.subscription.deleted', {
      id: 'sub_del_lt',
      metadata: { userId: user._id.toHexString() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    const billing = mockUpdateBilling.mock.calls[0]![1] as UserBilling;
    expect(billing.activeSubscriptions).toContain('insider');
    expect(billing.entitlements).toContain('founder');
    expect(billing.isLifetime).toBe(true);
    expect(billing.status).toBe('active');
    expect(billing.stripePaymentIntentId).toBe('pi_founder');
  });

  // --- invoice events ---

  test('invoice.payment_succeeded triggers subscription sync', async () => {
    const user = fakeUser();
    mockFindById.mockResolvedValue(user);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      id: 'sub_inv',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_insider_annual' } }] },
      metadata: { userId: user._id.toHexString() },
    });

    const event = fakeStripeEvent('invoice.payment_succeeded', {
      subscription: 'sub_inv',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);

    expect(mockSubscriptionRetrieve).toHaveBeenCalled();
    expect(mockUpdateBilling).toHaveBeenCalled();
  });

  test('invoice.payment_failed with no subscription is no-op', async () => {
    const event = fakeStripeEvent('invoice.payment_failed', {
      subscription: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockSubscriptionRetrieve).not.toHaveBeenCalled();
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  // --- checkout.session.completed edge cases ---

  test('checkout with no userId is silently skipped', async () => {
    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_no_user',
      mode: 'subscription',
      subscription: 'sub_orphan',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  test('checkout for unknown user does not crash', async () => {
    mockFindById.mockResolvedValue(null);
    const event = fakeStripeEvent('checkout.session.completed', {
      id: 'cs_unknown',
      mode: 'subscription',
      subscription: 'sub_unknown',
      client_reference_id: new ObjectId().toHexString(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applySubscriptionChange(event as any);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });
});
