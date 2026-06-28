import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export interface AccountDataExport {
  account: Record<string, unknown>;
  sessions: Record<string, unknown>[];
  mfaTotp: Record<string, unknown>[];
  mfaWebAuthn: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  ageVerifications: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  referralCodes: Record<string, unknown>[];
  referralAttributions: Record<string, unknown>[];
  promoRedemptions: Record<string, unknown>[];
  sponsorshipRequests: Record<string, unknown>[];
  sponsorshipLogs: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  identityCount: number;
  exportedAt: string;
}

export class AccountDataApi {
  constructor(private client: HttpClient) {}

  async getDataExport(): Promise<ApiResponse<AccountDataExport>> {
    return this.client.get('/api/account/data-export');
  }

  async requestDeletion(): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post('/api/account/delete/request', {});
  }

  async confirmDeletion(code: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post('/api/account/delete/confirm', { code });
  }
}
