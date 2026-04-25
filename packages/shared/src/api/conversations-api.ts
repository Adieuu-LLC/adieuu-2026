import type { ApiResponse } from '../types';
import type { MessagePaginationDirection } from '../messaging/messagePagination';
import type { HttpClient, RequestOptions } from './http-client';
import type {
  ConversationPreferences,
  ConversationPreferencesPatch,
  ConversationType,
  FormerMember,
  GroupInvitePreview,
  PinnedMessagesPageResponse,
  PublicConversation,
  PublicGroupInvite,
  PublicMessage,
  SendMessageParams,
  EditMessageParams,
} from './conversations-types';

export class ConversationsApi {
  constructor(private client: HttpClient) {}

  async create(params: {
    type: ConversationType;
    participants: string[];
    encryptedName?: string;
    nameNonce?: string;
    /** DM only: create a new thread even if one already exists with this peer. */
    forceNew?: boolean;
  }): Promise<ApiResponse<PublicConversation>> {
    return this.client.post('/api/conversations', params);
  }

  async list(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ conversations: PublicConversation[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/conversations${query ? `?${query}` : ''}`);
  }

  async get(conversationId: string): Promise<ApiResponse<PublicConversation>> {
    return this.client.get(`/api/conversations/${encodeURIComponent(conversationId)}`);
  }

  async updateName(
    conversationId: string,
    encryptedName: string,
    nameNonce: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      { encryptedName, nameNonce }
    );
  }

  async updateMemberSettings(
    conversationId: string,
    encryptedMemberSettings: string,
    memberSettingsNonce: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}/member-settings`,
      { encryptedMemberSettings, memberSettingsNonce }
    );
  }

  async sendMessage(
    conversationId: string,
    params: SendMessageParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PublicMessage>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      params,
      requestOptions
    );
  }

  async getMessages(
    conversationId: string,
    options?: {
      limit?: number;
      /** Message id anchor; requires `direction`. */
      cursor?: string;
      /** With `cursor`: page toward the past or toward the present. Omit both for the initial newest page. */
      direction?: MessagePaginationDirection;
    }
  ): Promise<
    ApiResponse<{
      messages: PublicMessage[];
      /** Pass as `cursor` with `direction=older` for the next page toward the past. */
      cursor: string | null;
      pageOldestId: string | null;
      pageNewestId: string | null;
      hasNewerPages: boolean;
    }>
  > {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.direction) params.set('direction', options.direction);
    const query = params.toString();
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`
    );
  }

  /**
   * Load a window around a message (newest-first), for reply navigation / deep links.
   */
  async getMessagesAround(
    conversationId: string,
    centerMessageId: string,
    options?: { before?: number; after?: number }
  ): Promise<
    ApiResponse<{
      messages: PublicMessage[];
      cursor: string | null;
      pageOldestId: string | null;
      pageNewestId: string | null;
      hasNewerPages: boolean;
    }>
  > {
    const params = new URLSearchParams();
    if (options?.before != null) params.set('before', String(options.before));
    if (options?.after != null) params.set('after', String(options.after));
    const query = params.toString();
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/around/${encodeURIComponent(centerMessageId)}${query ? `?${query}` : ''}`
    );
  }

  /**
   * Load one message. Use `include=revisionHistory` to fetch E2E edit history blobs.
   */
  async getMessage(
    conversationId: string,
    messageId: string,
    options?: { include?: 'revisionHistory' }
  ): Promise<ApiResponse<PublicMessage>> {
    const params = new URLSearchParams();
    if (options?.include) params.set('include', options.include);
    const query = params.toString();
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}${query ? `?${query}` : ''}`
    );
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    params: EditMessageParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PublicMessage>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      params,
      requestOptions
    );
  }

  async deleteMessageForSelf(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`
    );
  }

  async deleteMessageForEveryone(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/everyone`
    );
  }

  async addMember(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation | PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/members`,
      { identityId }
    );
  }

  async removeMember(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(identityId)}`
    );
  }

  async getFormerMembers(
    conversationId: string
  ): Promise<ApiResponse<FormerMember[]>> {
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/former-members`
    );
  }

  async listPendingInvitesForConversation(
    conversationId: string
  ): Promise<ApiResponse<{ invites: PublicGroupInvite[] }>> {
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/pending-invites`
    );
  }

  async revokeGroupInvite(
    conversationId: string,
    inviteId: string
  ): Promise<ApiResponse<PublicGroupInvite>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/invites/${encodeURIComponent(inviteId)}`
    );
  }

  async leave(
    conversationId: string,
    options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/leave`,
      options ?? {}
    );
  }

  async promoteToAdmin(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/admins`,
      { identityId }
    );
  }

  async terminateGroup(conversationId: string): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}`
    );
  }

  async listInvites(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ invites: PublicGroupInvite[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/conversations/invites${query ? `?${query}` : ''}`);
  }

  async acceptInvite(inviteId: string): Promise<ApiResponse<PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/accept`,
      {}
    );
  }

  async declineInvite(inviteId: string): Promise<ApiResponse<PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/decline`,
      {}
    );
  }

  async getInvitePreview(inviteId: string): Promise<ApiResponse<GroupInvitePreview>> {
    return this.client.get(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/preview`
    );
  }

  async updateGifsDisabled(
    conversationId: string,
    gifsDisabled: boolean
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}/gifs`,
      { gifsDisabled }
    );
  }

  async updateMessageSearchCachePolicy(
    conversationId: string,
    disallowPersistentMessageSearchCache: boolean
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}/message-search-cache`,
      { disallowPersistentMessageSearchCache }
    );
  }

  async pinMessage(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/pins`,
      { messageId }
    );
  }

  async unpinMessage(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`
    );
  }

  async getPinnedMessages(
    conversationId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<ApiResponse<PinnedMessagesPageResponse>> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/pinned-messages${query ? `?${query}` : ''}`
    );
  }

  async listPreferences(): Promise<ApiResponse<ConversationPreferences[]>> {
    return this.client.get('/api/conversations/preferences');
  }

  async updatePreferences(
    conversationId: string,
    patch: ConversationPreferencesPatch
  ): Promise<ApiResponse<ConversationPreferences>> {
    return this.client.patch(
      `/api/conversations/preferences/${encodeURIComponent(conversationId)}`,
      patch
    );
  }
}
