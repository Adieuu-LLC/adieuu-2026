import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionTierId, PurchasableProductId } from '../subscriptions';

export type SubscriptionPlanBadge = 'lifetime' | 'expiring' | 'annual';

export interface SubscriptionStatus {
  activeSubscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
  planBadge: SubscriptionPlanBadge;
  planExpiresAt: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  hasStripeCustomer: boolean;
  /** ISO date of the earliest-expiring sponsorship override (for expiry banner). */
  sponsoredExpiry: string | null;
}

export interface SubscriptionCatalogPriceEntry {
  unitAmountUsdCents: number;
  billing: 'annual' | 'one_time';
}

/** Maps each purchasable product to its Stripe list price in USD (when configured). */
export type SubscriptionCatalogPricesMap = Partial<
  Record<PurchasableProductId, SubscriptionCatalogPriceEntry>
>;

export interface SubscriptionCatalogPricesResponse {
  prices: SubscriptionCatalogPricesMap;
}

export interface BillingInvoiceEntry {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  periodStart: string;
  periodEnd: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface BillingPaymentMethod {
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingPromoRedemptionEntry {
  shortcode: string;
  description: string | null;
  redeemedAt: string;
  subscriptionOverride: { tier: string; expiresAt: string } | null;
  entitlements: string[];
}

export interface BillingRenewalInfo {
  status: string | null;
  isLifetime: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  autoRenew: boolean;
}

export interface BillingDetailsPayload {
  invoices: BillingInvoiceEntry[];
  paymentMethod: BillingPaymentMethod | null;
  promoRedemptions: BillingPromoRedemptionEntry[];
  renewal: BillingRenewalInfo;
}

export class SubscriptionApi {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<ApiResponse<SubscriptionStatus>> {
    return this.client.get('/api/account/subscription');
  }

  async getCatalogPrices(): Promise<ApiResponse<SubscriptionCatalogPricesResponse>> {
    return this.client.get('/api/account/subscription/catalog-prices');
  }

  async getBillingDetails(): Promise<ApiResponse<BillingDetailsPayload>> {
    return this.client.get('/api/account/subscription/billing-details');
  }

  async createCheckoutSession(product: PurchasableProductId): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/checkout', { product });
  }

  async createPortalSession(): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/portal', {});
  }
}
