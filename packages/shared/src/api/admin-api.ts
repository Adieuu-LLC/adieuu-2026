import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SubscriptionTierId } from '../subscriptions';

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

// ---------------------------------------------------------------------------
// Admin user management types
// ---------------------------------------------------------------------------

export interface AdminUserSearchItem {
  id: string;
  email?: string;
  phone?: string;
  displayName?: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'banned';
}

export interface AdminUserProfile {
  id: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
  geo?: {
    jurisdiction: string;
    countryCode: string;
    regionCode?: string;
    checkedAt: string;
  };
  ageVerification?: {
    status: string;
    verifiedAt?: string;
    failedAt?: string;
    lastJurisdiction?: string;
    optedIn?: boolean;
    expirationCount: number;
    lastExpiredAt?: string;
  };
  billing?: {
    activeSubscriptions: string[];
    entitlements: string[];
    isLifetime: boolean;
    status?: string;
    currentPeriodEnd?: string;
  };
  subscriptionOverrides?: Array<{ tier: string; expiresAt?: string }>;
  entitlementOverrides?: string[];
  moderation: {
    status: 'active' | 'suspended' | 'banned';
    suspendedUntil?: string;
    reason?: string;
    moderatedBy?: string;
    moderatedAt?: string;
  };
}

export interface AdminUserSessionItem {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface GiftSubscriptionInput {
  tier: SubscriptionTierId;
  durationMonths?: number;
}

export interface SuspendAccountInput {
  reason: string;
  durationMs?: number;
}

export interface BanAccountInput {
  reason: string;
}

export interface AddEntitlementInput {
  entitlement: string;
}

export interface SubscriptionOverrideInput {
  tier: SubscriptionTierId;
  durationMonths?: number;
}

export interface AdminSubscriptionOverrideItem {
  tier: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// AdminApi class
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // User management
  // -------------------------------------------------------------------------

  async searchUsers(query: string): Promise<ApiResponse<{ users: AdminUserSearchItem[] }>> {
    return this.client.get(`/api/admin/users/search?q=${encodeURIComponent(query)}`);
  }

  async getUserProfile(userId: string): Promise<ApiResponse<AdminUserProfile>> {
    return this.client.get(`/api/admin/users/${encodeURIComponent(userId)}`);
  }

  async getUserSessions(userId: string): Promise<ApiResponse<{ sessions: AdminUserSessionItem[] }>> {
    return this.client.get(`/api/admin/users/${encodeURIComponent(userId)}/sessions`);
  }

  async getUserAuditLog(
    userId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<ApiResponse<{ entries: AdminAuditEntry[]; total: number }>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return this.client.get(`/api/admin/users/${encodeURIComponent(userId)}/audit-log${qs ? `?${qs}` : ''}`);
  }

  async giftSubscription(userId: string, input: GiftSubscriptionInput): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/gift-subscription`, input);
  }

  async approveAge(userId: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/approve-age`, {});
  }

  async getEntitlements(userId: string): Promise<ApiResponse<{ effective: string[]; overrides: string[] }>> {
    return this.client.get(`/api/admin/users/${encodeURIComponent(userId)}/entitlements`);
  }

  async addEntitlement(userId: string, input: AddEntitlementInput): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/entitlements`, input);
  }

  async removeEntitlement(userId: string, entitlement: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.delete(`/api/admin/users/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(entitlement)}`);
  }

  async getSubscriptionOverrides(
    userId: string,
  ): Promise<ApiResponse<{ effective: string[]; overrides: AdminSubscriptionOverrideItem[] }>> {
    return this.client.get(`/api/admin/users/${encodeURIComponent(userId)}/subscription-overrides`);
  }

  async addSubscriptionOverride(
    userId: string,
    input: SubscriptionOverrideInput,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/subscription-overrides`, input);
  }

  async updateSubscriptionOverride(
    userId: string,
    index: number,
    input: SubscriptionOverrideInput,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.client.put(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription-overrides/${index}`,
      input,
    );
  }

  async removeSubscriptionOverride(
    userId: string,
    index: number,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.client.delete(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription-overrides/${index}`,
    );
  }

  async suspendUser(userId: string, input: SuspendAccountInput): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, input);
  }

  async unsuspendUser(userId: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.delete(`/api/admin/users/${encodeURIComponent(userId)}/suspend`);
  }

  async banUser(userId: string, input: BanAccountInput): Promise<ApiResponse<{ message: string }>> {
    return this.client.post(`/api/admin/users/${encodeURIComponent(userId)}/ban`, input);
  }

  async unbanUser(userId: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.delete(`/api/admin/users/${encodeURIComponent(userId)}/ban`);
  }
}
