/**
 * Promotional code API types shared between API and UI.
 */

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionStatus } from './subscription-api';
import type { SubscriptionTierId } from '../subscriptions';

// ---------------------------------------------------------------------------
// User-facing types
// ---------------------------------------------------------------------------

export type PromoCodeRedeemErrorCode =
  | 'PROMO_INVALID'
  | 'PROMO_NOT_FOUND'
  | 'PROMO_EXPIRED'
  | 'PROMO_JURISDICTION'
  | 'PROMO_MAX_USES'
  | 'PROMO_ALREADY_REDEEMED'
  | 'PROMO_MISSING_REQUIRED'
  | 'PROMO_INCOMPATIBLE'
  | 'PROMO_AUDIENCE';

export type PromoCodeAudience = 'all' | 'first_time' | 'unsubscribed';

export interface RedeemPromoCodeParams {
  shortcode: string;
}

export interface RedeemPromoCodeResponse {
  shortcode: string;
  subscriptionApplied?: { tier: SubscriptionTierId; expiresAt: string };
  entitlementsApplied: string[];
  subscriptionStatus: SubscriptionStatus;
}

// ---------------------------------------------------------------------------
// Admin types
// ---------------------------------------------------------------------------

export interface PromoCodeSubscriptionGrant {
  tier: SubscriptionTierId;
  durationMonths: number;
}

export interface PublicPromoCode {
  shortcode: string;
  description?: string;
  subscription?: PromoCodeSubscriptionGrant;
  entitlements: string[];
  requiredCodes: string[];
  incompatibleCodes: string[];
  maxUses: number | null;
  currentUses: number;
  jurisdictions: string[];
  audience?: PromoCodeAudience;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPromoRedemption {
  id: string;
  userId: string;
  shortcode: string;
  redeemedAt: string;
  subscriptionOverrideApplied?: { tier: SubscriptionTierId; expiresAt: string };
  entitlementsApplied: string[];
  stripeAction?: 'trial' | 'credit' | 'override';
}

export interface CreatePromoCodeParams {
  shortcode: string;
  description?: string;
  subscription?: PromoCodeSubscriptionGrant;
  entitlements?: string[];
  requiredCodes?: string[];
  incompatibleCodes?: string[];
  maxUses?: number | null;
  jurisdictions?: string[];
  audience?: PromoCodeAudience;
  validFrom?: string | null;
  validTo?: string | null;
}

export type UpdatePromoCodeParams = Omit<CreatePromoCodeParams, 'shortcode'>;

export interface PromoCodeListResponse {
  codes: PublicPromoCode[];
  total: number;
}

export interface PromoRedemptionListResponse {
  redemptions: PublicPromoRedemption[];
  total: number;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class PromoCodeApi {
  constructor(private client: HttpClient) {}

  async redeem(params: RedeemPromoCodeParams): Promise<ApiResponse<RedeemPromoCodeResponse>> {
    return this.client.post('/api/account/promo-code/redeem', params);
  }

  async listAdmin(
    params?: { limit?: number; offset?: number },
  ): Promise<ApiResponse<PromoCodeListResponse>> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return this.client.get(`/api/admin/promo-codes${qs ? `?${qs}` : ''}`);
  }

  async createAdmin(params: CreatePromoCodeParams): Promise<ApiResponse<PublicPromoCode>> {
    return this.client.post('/api/admin/promo-codes', params);
  }

  async updateAdmin(
    shortcode: string,
    params: UpdatePromoCodeParams,
  ): Promise<ApiResponse<PublicPromoCode>> {
    return this.client.put(`/api/admin/promo-codes/${encodeURIComponent(shortcode)}`, params);
  }

  async deleteAdmin(shortcode: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.client.delete(`/api/admin/promo-codes/${encodeURIComponent(shortcode)}`);
  }

  async listRedemptionsAdmin(
    shortcode: string,
    params?: { limit?: number; offset?: number },
  ): Promise<ApiResponse<PromoRedemptionListResponse>> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return this.client.get(
      `/api/admin/promo-codes/${encodeURIComponent(shortcode)}/redemptions${qs ? `?${qs}` : ''}`,
    );
  }
}
