import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { PublicIdentity } from './identity-types';

/**
 * Blocked identity with info
 */
export interface BlockedIdentity {
  identity: PublicIdentity;
  blockedAt: string;
}

/**
 * Block check result
 */
export interface BlockCheckResult {
  blocked: boolean;
  blockedAt?: string;
}

export interface BlockCheckEitherResult {
  blockedByEither: boolean;
  blockedByYou: boolean;
}

export class BlocksApi {
  constructor(private client: HttpClient) {}

  /**
   * Block an identity.
   */
  async block(identityId: string): Promise<ApiResponse<void>> {
    return this.client.post('/api/blocks', { identityId });
  }

  /**
   * Unblock an identity.
   */
  async unblock(identityId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/blocks/${encodeURIComponent(identityId)}`);
  }

  /**
   * Get blocked identities list.
   */
  async getBlocked(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ blocks: BlockedIdentity[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/blocks${query ? `?${query}` : ''}`);
  }

  /**
   * Check if an identity is blocked by you.
   */
  async checkBlocked(identityId: string): Promise<ApiResponse<BlockCheckResult>> {
    return this.client.get(`/api/blocks/check/${encodeURIComponent(identityId)}`);
  }

  /**
   * Bidirectional block check: has either party blocked the other?
   */
  async checkBlockedByEither(identityId: string): Promise<ApiResponse<BlockCheckEitherResult>> {
    return this.client.get(`/api/blocks/check-either/${encodeURIComponent(identityId)}`);
  }
}
