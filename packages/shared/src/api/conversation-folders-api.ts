import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  ConversationFolder,
  CreateConversationFolderParams,
  UpdateConversationFolderParams,
} from './conversation-folder-types';

export class ConversationFoldersApi {
  constructor(private client: HttpClient) {}

  async list(): Promise<ApiResponse<ConversationFolder[]>> {
    return this.client.get('/api/conversation-folders');
  }

  async create(
    params: CreateConversationFolderParams,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.post('/api/conversation-folders', params);
  }

  async update(
    folderId: string,
    params: UpdateConversationFolderParams,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.patch(
      `/api/conversation-folders/${encodeURIComponent(folderId)}`,
      params,
    );
  }

  async addConversation(
    folderId: string,
    conversationId: string,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.post(
      `/api/conversation-folders/${encodeURIComponent(folderId)}/conversations`,
      { conversationId },
    );
  }

  async removeConversation(
    folderId: string,
    conversationId: string,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.delete(
      `/api/conversation-folders/${encodeURIComponent(folderId)}/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  async addSpace(
    folderId: string,
    spaceId: string,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.post(
      `/api/conversation-folders/${encodeURIComponent(folderId)}/spaces`,
      { spaceId },
    );
  }

  async removeSpace(
    folderId: string,
    spaceId: string,
  ): Promise<ApiResponse<ConversationFolder>> {
    return this.client.delete(
      `/api/conversation-folders/${encodeURIComponent(folderId)}/spaces/${encodeURIComponent(spaceId)}`,
    );
  }

  async delete(folderId: string): Promise<ApiResponse<ConversationFolder>> {
    return this.client.delete(
      `/api/conversation-folders/${encodeURIComponent(folderId)}`,
    );
  }
}
