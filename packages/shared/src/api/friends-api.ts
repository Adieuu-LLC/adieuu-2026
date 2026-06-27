import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { PublicIdentity } from './identity-types';

/**
 * Friendship status between two identities
 */
export type FriendshipStatus = 'none' | 'friends' | 'pending_incoming' | 'pending_outgoing';

/**
 * From GET /friends/status/:id — `friendsSince` is set when `status` is `friends`
 * (when the mutual friendship was created, ISO 8601).
 */
export interface FriendshipStatusResult {
  status: FriendshipStatus;
  friendsSince?: string;
}

/**
 * Public friend request
 */
export interface PublicFriendRequest {
  id: string;
  fromIdentityId: string;
  toIdentityId: string;
  status: 'pending' | 'accepted' | 'ignored';
  createdAt: string;
}

/**
 * Friend info with denormalised identity data
 */
export interface FriendInfo {
  identity: PublicIdentity;
  friendsSince: string;
}

/**
 * Incoming friend request with sender identity info
 */
export interface IncomingFriendRequestInfo {
  request: PublicFriendRequest;
  fromIdentity: PublicIdentity;
}

export class FriendsApi {
  constructor(private client: HttpClient) {}

  /**
   * Send a friend request.
   */
  async sendRequest(identityId: string): Promise<ApiResponse<PublicFriendRequest>> {
    return this.client.post('/api/friends/requests', { identityId });
  }

  /**
   * Accept a friend request.
   */
  async acceptRequest(requestId: string): Promise<ApiResponse<PublicFriendRequest>> {
    return this.client.post(`/api/friends/requests/${encodeURIComponent(requestId)}/accept`, {});
  }

  /**
   * Ignore a friend request.
   */
  async ignoreRequest(requestId: string): Promise<ApiResponse<void>> {
    return this.client.post(`/api/friends/requests/${encodeURIComponent(requestId)}/ignore`, {});
  }

  /**
   * Cancel an outgoing friend request.
   */
  async cancelRequest(requestId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/friends/requests/${encodeURIComponent(requestId)}`);
  }

  /**
   * Get incoming friend requests.
   */
  async getIncomingRequests(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ requests: IncomingFriendRequestInfo[]; count: number; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends/requests/incoming${query ? `?${query}` : ''}`);
  }

  /**
   * Get outgoing friend requests.
   */
  async getOutgoingRequests(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ requests: PublicFriendRequest[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends/requests/outgoing${query ? `?${query}` : ''}`);
  }

  /**
   * Get pending incoming request count.
   */
  async getIncomingRequestCount(): Promise<ApiResponse<{ count: number }>> {
    return this.client.get('/api/friends/requests/count');
  }

  /**
   * Get friends list (paginated).
   */
  async getFriends(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ friends: FriendInfo[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends${query ? `?${query}` : ''}`);
  }

  /**
   * Search friends by username/displayName.
   */
  async searchFriends(
    query: string,
    limit?: number
  ): Promise<ApiResponse<{ friends: FriendInfo[] }>> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', limit.toString());
    return this.client.get(`/api/friends/search?${params.toString()}`);
  }

  /**
   * Remove a friend.
   */
  async removeFriend(identityId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/friends/${encodeURIComponent(identityId)}`);
  }

  /**
   * Get friendship status with an identity.
   */
  async getFriendshipStatus(identityId: string): Promise<ApiResponse<FriendshipStatusResult>> {
    return this.client.get(`/api/friends/status/${encodeURIComponent(identityId)}`);
  }
}
