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
}

export class SubscriptionApi {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<ApiResponse<SubscriptionStatus>> {
    return this.client.get('/api/account/subscription');
  }

  async createCheckoutSession(product: PurchasableProductId): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/checkout', { product });
  }

  async createPortalSession(): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/portal', {});
  }
}
