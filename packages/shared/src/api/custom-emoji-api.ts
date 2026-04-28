import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  PublicCustomEmoji,
  CustomEmojiListResponse,
  CreateCustomEmojiParams,
  UpdateCustomEmojiParams,
} from './custom-emoji-types';

export class CustomEmojiApi {
  constructor(private client: HttpClient) {}

  async list(): Promise<ApiResponse<CustomEmojiListResponse>> {
    return this.client.get('/api/custom-emojis');
  }

  async create(
    params: CreateCustomEmojiParams
  ): Promise<ApiResponse<PublicCustomEmoji>> {
    return this.client.post('/api/custom-emojis', params);
  }

  async get(id: string): Promise<ApiResponse<PublicCustomEmoji>> {
    return this.client.get(`/api/custom-emojis/${encodeURIComponent(id)}`);
  }

  async update(
    id: string,
    params: UpdateCustomEmojiParams
  ): Promise<ApiResponse<PublicCustomEmoji>> {
    return this.client.patch(
      `/api/custom-emojis/${encodeURIComponent(id)}`,
      params
    );
  }

  async delete(id: string): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/custom-emojis/${encodeURIComponent(id)}`
    );
  }
}
