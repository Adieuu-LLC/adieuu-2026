import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export interface ThemeListParams {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  sort?: 'newest' | 'downloads' | 'upvotes';
}

export interface ThemeListResponse {
  themes: import('../types/theme').CommunityTheme[];
  total: number;
  page: number;
  limit: number;
}

/** Checksums of colours for themes this identity has already shared (GET /themes/me/shared-checksums). */
export interface MySharedThemeChecksumsResponse {
  checksums: string[];
}

export class ThemesApi {
  constructor(private client: HttpClient) {}

  /**
   * List colour checksums for themes the current alias has already shared to the community.
   * Requires identity session.
   */
  async listMySharedChecksums(): Promise<ApiResponse<MySharedThemeChecksumsResponse>> {
    return this.client.get('/api/themes/me/shared-checksums');
  }

  /**
   * List community themes with optional search/filter.
   * Public endpoint -- no auth required.
   */
  async list(params?: ThemeListParams): Promise<ApiResponse<ThemeListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.sort) qs.set('sort', params.sort);
    const query = qs.toString();
    return this.client.get(`/api/themes${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single community theme by ID.
   * Public endpoint -- no auth required.
   */
  async get(id: string): Promise<ApiResponse<import('../types/theme').CommunityTheme>> {
    return this.client.get(`/api/themes/${encodeURIComponent(id)}`);
  }

  /**
   * Upload/share a theme publicly. Requires identity session.
   */
  async create(data: {
    name: string;
    description?: string;
    theme: import('../types/theme').ThemeDefinition;
    tags?: string[];
  }): Promise<ApiResponse<import('../types/theme').CommunityTheme>> {
    return this.client.post('/api/themes', data);
  }

  /**
   * Delete a community theme. Requires identity session; must be the author.
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/themes/${encodeURIComponent(id)}`);
  }

  /**
   * Upvote a community theme. Requires identity session. Idempotent.
   */
  async upvote(id: string): Promise<ApiResponse<{ upvoted: boolean; upvotes: number }>> {
    return this.client.post(`/api/themes/${encodeURIComponent(id)}/upvote`, {});
  }

  /**
   * Report a community theme. Requires identity session.
   */
  async report(id: string): Promise<ApiResponse<void>> {
    return this.client.post(`/api/themes/${encodeURIComponent(id)}/report`, {});
  }
}
