/**
 * Sponsorship API types shared between API and UI.
 */

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { PurchasableProductId } from '../subscriptions';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/** Public directory entry (never exposes userId or email). */
export interface SponsorshipDirectoryEntry {
  id: string;
  firstName: string;
  lastInitial: string;
  jurisdiction: string;
  message?: string;
  preferredProduct?: PurchasableProductId;
  createdAt: string;
}

/** Status of the current user's own sponsorship request. */
export interface SponsorshipRequestStatus {
  hasRequest: boolean;
  status?: 'active' | 'fulfilled' | 'withdrawn';
  createdAt?: string;
  fulfilledProduct?: PurchasableProductId;
  fulfilledAt?: string;
  sponsorRevealed?: boolean;
  sponsorFirstName?: string;
  sponsorLastInitial?: string;
}

/** Body for POST /api/sponsorship/request */
export interface CreateSponsorshipRequestParams {
  firstName: string;
  lastInitial: string;
  message?: string;
  preferredProduct?: PurchasableProductId;
}

/** Body for POST /api/sponsorship/checkout */
export interface SponsorshipCheckoutParams {
  requestId: string;
  product: PurchasableProductId;
  revealIdentity: boolean;
  sponsorFirstName?: string;
  sponsorLastInitial?: string;
}

/** Directory listing response. */
export interface SponsorshipDirectoryResponse {
  entries: SponsorshipDirectoryEntry[];
  hasMore: boolean;
}

/** Sponsor stats for the callout card. */
export interface SponsorStats {
  lifetimeCount: number;
  activeCount: number;
  hasAchievementOptIn: boolean;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class SponsorshipApi {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<ApiResponse<SponsorshipRequestStatus>> {
    return this.client.get('/api/sponsorship/status');
  }

  async createRequest(
    params: CreateSponsorshipRequestParams,
  ): Promise<ApiResponse<{ id: string }>> {
    return this.client.post('/api/sponsorship/request', params);
  }

  async withdrawRequest(): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.delete('/api/sponsorship/request');
  }

  async getDirectory(cursor?: string): Promise<ApiResponse<SponsorshipDirectoryResponse>> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.client.get(`/api/sponsorship/directory${query}`);
  }

  async createCheckout(
    params: SponsorshipCheckoutParams,
  ): Promise<ApiResponse<{ url: string }>> {
    return this.client.post('/api/sponsorship/checkout', params);
  }

  async getSponsorStats(): Promise<ApiResponse<SponsorStats>> {
    return this.client.get('/api/sponsorship/sponsor-stats');
  }

  async setSponsorAchievement(
    enabled: boolean,
  ): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post('/api/sponsorship/sponsor-achievement', { enabled });
  }
}
