import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

/** Canonical platform setting keys (must match API `platform_settings.key`). */
export const PLATFORM_SETTING_KEYS = {
  AUTH_ALLOWLIST_ENFORCED: 'platform-auth-allowlist-enforced',
  AUTH_ALLOWLIST_EMAIL: 'platform-auth-allowlist-email',
  AUTH_ALLOWLIST_PHONE: 'platform-auth-allowlist-phone',
  ADMIN_ACCOUNT_LIST: 'platform-admin-account-list',
  MODERATOR_ACCOUNT_LIST: 'platform-moderator-account-list',
  AGE_VERIFICATION_ENABLED: 'platform-age-verification-enabled',
  AGE_VERIFICATION_AUTO_EMAIL_CHECK: 'platform-age-verification-auto-email-check',
  AGE_VERIFICATION_ACTIVE_PROVIDER: 'platform-age-verification-active-provider',
  AGE_VERIFICATION_VERIFYMY_ENV: 'platform-age-verification-verifymy-env',
  AGE_VERIFICATION_REQUIRED_MODE: 'platform-age-verification-required-mode',
  AGE_VERIFICATION_REQUIRED_JURISDICTIONS: 'platform-age-verification-required-jurisdictions',
  GEOFENCE_BLOCKED_JURISDICTIONS: 'platform-geofence-blocked-jurisdictions',
  GEOFENCE_LAW_LINKS: 'platform-geofence-law-links',
} as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export interface AdminMetrics {
  totalUsers: number;
  totalIdentities: number;
  activeIdentities15m: number;
  activeIdentities24h: number;
}

export type PlatformSettingValueType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'stringArray'
  | 'objectIdArray';

export interface PublicPlatformSetting {
  key: string;
  description?: string;
  valueType: PlatformSettingValueType;
  value: unknown;
  lastUpdatedBy?: string;
  updatedAt: string;
  createdAt: string;
}

export interface PutPlatformSettingBody {
  valueType: PlatformSettingValueType;
  value: unknown;
  description?: string;
}

export interface PlatformAdminRow {
  identityId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  /** True when the identity id is listed but no longer exists in the database */
  stale?: boolean;
}

export class AdminApi {
  constructor(private client: HttpClient) {}

  async getMetrics(): Promise<ApiResponse<AdminMetrics>> {
    return this.client.get('/api/admin/metrics');
  }

  async getPlatformSettings(): Promise<ApiResponse<PublicPlatformSetting[]>> {
    return this.client.get('/api/admin/platform-settings');
  }

  async getPlatformSetting(key: string): Promise<ApiResponse<PublicPlatformSetting>> {
    return this.client.get(`/api/admin/platform-settings/${encodeURIComponent(key)}`);
  }

  async putPlatformSetting(
    key: string,
    body: PutPlatformSettingBody
  ): Promise<ApiResponse<PublicPlatformSetting>> {
    return this.client.put(`/api/admin/platform-settings/${encodeURIComponent(key)}`, body);
  }

  async listPlatformAdmins(): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.get('/api/admin/platform-admins');
  }

  async addPlatformAdmin(params: {
    identityId: string;
  }): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.post('/api/admin/platform-admins', params);
  }

  async removePlatformAdmin(
    identityId: string
  ): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.delete(`/api/admin/platform-admins/${encodeURIComponent(identityId)}`);
  }
}
