import type { ApiResponse } from '../types';
import type { HttpClient, RequestOptions } from './http-client';
import type { PublicReaction, SendReactionParams } from './conversations-types';

export class ReactionsApi {
  constructor(private client: HttpClient) {}

  async add(
    conversationId: string,
    messageId: string,
    params: SendReactionParams,
    options?: RequestOptions
  ): Promise<ApiResponse<PublicReaction>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      params,
      options
    );
  }

  async remove(
    conversationId: string,
    reactionId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/reactions/${encodeURIComponent(reactionId)}`
    );
  }

  async getForMessages(
    conversationId: string,
    messageIds: string[]
  ): Promise<ApiResponse<{ reactions: PublicReaction[] }>> {
    const query = `messageIds=${messageIds.map(encodeURIComponent).join(',')}`;
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/reactions?${query}`
    );
  }
}
