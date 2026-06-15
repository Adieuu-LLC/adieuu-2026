/**
 * Referral program API types shared between API and UI.
 */

import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface ReferralCodePayload {
  id: string;
  code: string;
  customMessage?: string;
  useCount: number;
  signupCount: number;
  subscriptionCount: number;
  createdAt: string;
}

export interface ReferralStatsPayload {
  codes: ReferralCodePayload[];
  totalSignups: number;
  totalSubscriptions: number;
  hasBeenReferred: boolean;
  referredBy?: { code: string; date: string };
}

export interface ReferralLandingPayload {
  valid: boolean;
  customMessage?: string;
}

export type ReferralRedeemErrorCode =
  | 'REFERRAL_INVALID'
  | 'REFERRAL_INVALID_CODE'
  | 'REFERRAL_SELF'
  | 'REFERRAL_ALREADY_APPLIED'
  | 'REFERRAL_CODE_TAKEN'
  | 'REFERRAL_CODE_LIMIT'
  | 'REFERRAL_INVALID_MESSAGE'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED';

export interface CreateReferralCodeParams {
  code?: string;
  customMessage?: string;
}

export interface UpdateReferralCodeParams {
  code?: string;
  customMessage?: string;
}

export interface RedeemReferralCodeParams {
  code: string;
}

export interface RedeemReferralCodeResponse {
  code: string;
  attributedAt: string;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class ReferralApi {
  constructor(private client: HttpClient) {}

  async getStats(): Promise<ApiResponse<ReferralStatsPayload>> {
    return this.client.get('/api/account/referral');
  }

  async createCode(params?: CreateReferralCodeParams): Promise<ApiResponse<ReferralCodePayload>> {
    return this.client.post('/api/account/referral/codes', params ?? {});
  }

  async updateCode(
    codeId: string,
    params: UpdateReferralCodeParams,
  ): Promise<ApiResponse<ReferralCodePayload>> {
    return this.client.patch(`/api/account/referral/codes/${encodeURIComponent(codeId)}`, params);
  }

  async deleteCode(codeId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.client.delete(`/api/account/referral/codes/${encodeURIComponent(codeId)}`);
  }

  async redeem(params: RedeemReferralCodeParams): Promise<ApiResponse<RedeemReferralCodeResponse>> {
    return this.client.post('/api/account/referral/redeem', params);
  }

  async getLanding(code: string): Promise<ApiResponse<ReferralLandingPayload>> {
    return this.client.get(`/api/refer/${encodeURIComponent(code)}`);
  }
}

/** localStorage key for a referral code accepted on the landing page. */
export const PENDING_REFERRAL_CODE_STORAGE_KEY = 'adieuu:pending-referral-code';

/** Query param used to pass referral code through auth flow. */
export const REFERRAL_QUERY_PARAM = 'ref';

export function readPendingReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(PENDING_REFERRAL_CODE_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function storePendingReferralCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_REFERRAL_CODE_STORAGE_KEY, code.trim().toLowerCase());
  } catch {
    // ignore storage failures
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_CODE_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function resolveReferralCodeFromLocation(search: string): string | null {
  const params = new URLSearchParams(search);
  const ref = params.get(REFERRAL_QUERY_PARAM);
  return ref?.trim().toLowerCase() || null;
}
