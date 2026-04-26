import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionTierId } from '../subscriptions';

export interface SubscriptionStatus {
  activeSubscriptions: SubscriptionTierId[];
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
}

export class SubscriptionApi {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<ApiResponse<SubscriptionStatus>> {
    return this.client.get('/api/account/subscription');
  }

  async createCheckoutSession(tier: SubscriptionTierId): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/checkout', { tier });
  }

  async createPortalSession(): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/account/subscription/portal', {});
  }
}
