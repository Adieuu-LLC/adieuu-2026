import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export interface KlipyItem {
  id: number;
  slug: string;
  title: string;
  type: 'gif' | 'sticker';
  blurPreview: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  url: string;
  /** Still JPG from HD tier when available (hover-to-animate) */
  posterUrl?: string;
  width: number;
  height: number;
  tinyUrl: string;
}

export interface KlipySearchResponse {
  items: KlipyItem[];
  currentPage: number;
  perPage: number;
  hasNext: boolean;
}

export interface KlipySearchParams {
  q: string;
  page?: number;
  per_page?: number;
  /** Conversation ID for per-conversation content filter enforcement. */
  conversationId?: string;
}

export interface KlipyShareParams {
  slug: string;
  type: 'gif' | 'sticker';
  searchTerm?: string;
}

export class KlipyApi {
  constructor(private client: HttpClient) {}

  async searchGifs(params: KlipySearchParams): Promise<ApiResponse<KlipySearchResponse>> {
    const qs = new URLSearchParams({ q: params.q });
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));
    if (params.conversationId) qs.set('conversation_id', params.conversationId);
    return this.client.get(`/api/klipy/gifs/search?${qs}`);
  }

  async trendingGifs(params?: { page?: number; per_page?: number; conversationId?: string }): Promise<ApiResponse<KlipySearchResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.conversationId) qs.set('conversation_id', params.conversationId);
    const query = qs.toString();
    return this.client.get(`/api/klipy/gifs/trending${query ? `?${query}` : ''}`);
  }

  async searchStickers(params: KlipySearchParams): Promise<ApiResponse<KlipySearchResponse>> {
    const qs = new URLSearchParams({ q: params.q });
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));
    if (params.conversationId) qs.set('conversation_id', params.conversationId);
    return this.client.get(`/api/klipy/stickers/search?${qs}`);
  }

  async trendingStickers(params?: { page?: number; per_page?: number; conversationId?: string }): Promise<ApiResponse<KlipySearchResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.conversationId) qs.set('conversation_id', params.conversationId);
    const query = qs.toString();
    return this.client.get(`/api/klipy/stickers/trending${query ? `?${query}` : ''}`);
  }

  async share(params: KlipyShareParams): Promise<ApiResponse<{ ok: boolean }>> {
    return this.client.post('/api/klipy/share', params);
  }
}
