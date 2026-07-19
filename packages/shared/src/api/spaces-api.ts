import type { ApiResponse } from '../types';
import type { HttpClient, RequestOptions } from './http-client';
import type {
  CreateSpaceParams,
  EditSpaceMessageParams,
  PublicSpace,
  PublicSpaceChannel,
  PublicSpaceInvite,
  PublicSpaceMember,
  PublicSpaceMessage,
  PublicSpaceReaction,
  PublicSpaceRole,
  SendSpaceMessageParams,
  SpaceManageOverview,
  SpaceViewerPermissions,
  UpdateSpaceParams,
} from './spaces-types';

/**
 * Client for the Spaces API. Routes are implemented in a later phase; this
 * surface is stable for the create flow, directory, membership, invites, and
 * (non-E2EE) channel messaging.
 */
export class SpacesApi {
  constructor(private client: HttpClient) {}

  // --- Space lifecycle ---

  async create(params: CreateSpaceParams): Promise<ApiResponse<PublicSpace>> {
    return this.client.post('/api/spaces', params);
  }

  /** Spaces the current identity is a member of. */
  async listMine(): Promise<ApiResponse<{ spaces: PublicSpace[] }>> {
    return this.client.get('/api/spaces');
  }

  /** Discover public/listed spaces (never hidden). */
  async discover(options?: {
    q?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ApiResponse<{ spaces: PublicSpace[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.client.get(`/api/spaces/discover${query ? `?${query}` : ''}`);
  }

  async getBySlug(slug: string): Promise<ApiResponse<PublicSpace>> {
    return this.client.get(`/api/spaces/slug/${encodeURIComponent(slug)}`);
  }

  async checkSlugAvailability(slug: string): Promise<ApiResponse<{ available: boolean }>> {
    return this.client.get(`/api/spaces/slug/${encodeURIComponent(slug)}/available`);
  }

  async get(spaceId: string): Promise<ApiResponse<PublicSpace>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}`);
  }

  async update(spaceId: string, params: UpdateSpaceParams): Promise<ApiResponse<PublicSpace>> {
    return this.client.patch(`/api/spaces/${encodeURIComponent(spaceId)}`, params);
  }

  async delete(spaceId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/spaces/${encodeURIComponent(spaceId)}`);
  }

  /** Current viewer's membership and effective permissions in a Space. */
  async getMyPermissions(spaceId: string): Promise<ApiResponse<SpaceViewerPermissions>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}/me`);
  }

  /** Admin-only Manage overview (stats + recent joins). */
  async getManageOverview(spaceId: string): Promise<ApiResponse<SpaceManageOverview>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}/manage/overview`);
  }

  // --- Membership ---

  async join(spaceId: string): Promise<ApiResponse<PublicSpaceMember>> {
    return this.client.post(`/api/spaces/${encodeURIComponent(spaceId)}/join`, {});
  }

  async leave(spaceId: string): Promise<ApiResponse<void>> {
    return this.client.post(`/api/spaces/${encodeURIComponent(spaceId)}/leave`, {});
  }

  async listMembers(
    spaceId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<ApiResponse<{ members: PublicSpaceMember[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/members${query ? `?${query}` : ''}`
    );
  }

  async removeMember(spaceId: string, identityId: string): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(identityId)}`
    );
  }

  // --- Roles ---

  async listRoles(spaceId: string): Promise<ApiResponse<{ roles: PublicSpaceRole[] }>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}/roles`);
  }

  // --- Channels & messages ---

  async listChannels(spaceId: string): Promise<ApiResponse<{ channels: PublicSpaceChannel[] }>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}/channels`);
  }

  async getMessages(
    spaceId: string,
    channelId: string,
    options?: { limit?: number; cursor?: string; direction?: 'asc' | 'desc' }
  ): Promise<ApiResponse<{ messages: PublicSpaceMessage[]; cursor: string | null; hasNewerPages?: boolean }>> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.direction) params.set('direction', options.direction);
    const query = params.toString();
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages${query ? `?${query}` : ''}`
    );
  }

  async sendMessage(
    spaceId: string,
    channelId: string,
    params: SendSpaceMessageParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PublicSpaceMessage>> {
    return this.client.post(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages`,
      params,
      requestOptions
    );
  }

  async editMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
    body: EditSpaceMessageParams,
  ): Promise<ApiResponse<PublicSpaceMessage>> {
    return this.client.patch(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      body,
    );
  }

  async deleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  async modDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/mod`,
    );
  }

  async getMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<PublicSpaceMessage>> {
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`
    );
  }

  async getMessagesAround(
    spaceId: string,
    channelId: string,
    messageId: string,
    options?: { before?: number; after?: number },
  ): Promise<ApiResponse<{ messages: PublicSpaceMessage[]; cursor: string | null; hasNewerPages?: boolean }>> {
    const params = new URLSearchParams();
    if (options?.before != null) params.set('before', String(options.before));
    if (options?.after != null) params.set('after', String(options.after));
    const query = params.toString();
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/around/${encodeURIComponent(messageId)}${query ? `?${query}` : ''}`,
    );
  }

  // --- Reactions ---

  async addReaction(
    spaceId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<ApiResponse<PublicSpaceReaction>> {
    return this.client.post(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { emoji },
    );
  }

  async removeReaction(
    spaceId: string,
    channelId: string,
    messageId: string,
    reactionId: string,
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(reactionId)}`,
    );
  }

  async getReactions(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<{ reactions: PublicSpaceReaction[] }>> {
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    );
  }

  // --- Pins ---

  async pinMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/pins`,
      { messageId },
    );
  }

  async unpinMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/pins/${encodeURIComponent(messageId)}`,
    );
  }

  async getPinnedMessages(
    spaceId: string,
    channelId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<ApiResponse<{ messages: PublicSpaceMessage[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.client.get(
      `/api/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/pinned-messages${query ? `?${query}` : ''}`,
    );
  }

  // --- Invites (mirrors group invites) ---

  async listInvites(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ invites: PublicSpaceInvite[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/spaces/invites${query ? `?${query}` : ''}`);
  }

  async acceptInvite(inviteId: string): Promise<ApiResponse<PublicSpaceInvite>> {
    return this.client.post(`/api/spaces/invites/${encodeURIComponent(inviteId)}/accept`, {});
  }

  async declineInvite(inviteId: string): Promise<ApiResponse<PublicSpaceInvite>> {
    return this.client.post(`/api/spaces/invites/${encodeURIComponent(inviteId)}/decline`, {});
  }

  async createInvite(
    spaceId: string,
    identityId: string
  ): Promise<ApiResponse<PublicSpaceInvite>> {
    return this.client.post(`/api/spaces/${encodeURIComponent(spaceId)}/invites`, { identityId });
  }

  async listPendingInvites(
    spaceId: string
  ): Promise<ApiResponse<{ invites: PublicSpaceInvite[] }>> {
    return this.client.get(`/api/spaces/${encodeURIComponent(spaceId)}/pending-invites`);
  }

  async revokeInvite(
    spaceId: string,
    inviteId: string
  ): Promise<ApiResponse<PublicSpaceInvite>> {
    return this.client.delete(
      `/api/spaces/${encodeURIComponent(spaceId)}/invites/${encodeURIComponent(inviteId)}`
    );
  }
}
