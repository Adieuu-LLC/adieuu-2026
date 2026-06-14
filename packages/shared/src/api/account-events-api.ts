/**
 * Account pending events API types shared between API and UI.
 */

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionTierId } from '../subscriptions';

export type PendingAccountEventType = 'subscription_upgraded';

export type SubscriptionUpgradeSource =
  | 'sponsorship'
  | 'promo_code'
  | 'admin_gift'
  | 'purchase';

export interface PendingAccountEventData {
  tier: SubscriptionTierId;
  source: SubscriptionUpgradeSource;
  sponsorFirstName?: string;
  sponsorLastInitial?: string;
  isLifetime?: boolean;
}

export interface PublicPendingAccountEvent {
  id: string;
  type: PendingAccountEventType;
  data: PendingAccountEventData;
  createdAt: string;
}

export interface PendingAccountEventsResponse {
  events: PublicPendingAccountEvent[];
}

export interface DismissPendingAccountEventParams {
  eventId: string;
}

export interface DismissPendingAccountEventResponse {
  dismissed: boolean;
}

export class AccountEventsApi {
  constructor(private client: HttpClient) {}

  async getPending(): Promise<ApiResponse<PendingAccountEventsResponse>> {
    return this.client.get('/api/account/events/pending');
  }

  async dismiss(
    params: DismissPendingAccountEventParams,
  ): Promise<ApiResponse<DismissPendingAccountEventResponse>> {
    return this.client.post('/api/account/events/dismiss', params);
  }
}
