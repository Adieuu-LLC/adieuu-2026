import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionTierId, PurchasableProductId } from '../subscriptions';

export interface SubscriptionStatus {
  activeSubscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
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

export class SubscriptionApi {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<ApiResponse<SubscriptionStatus>> {
    return this.client.get('/api/account/subscription');
  }

  async getCatalogPrices(): Promise<ApiResponse<SubscriptionCatalogPricesResponse>> {
    return this.client.get('/api/account/subscription/catalog-prices');
  }

  async createCheckoutSession(product: PurchasableProductId): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/checkout', { product });
  }

  async createPortalSession(): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/portal', {});
  }
}
