import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  CreateFeedbackCommentParams,
  CreateFeedbackPostParams,
  CreateFeedbackPostResponse,
  FeedbackDetailResponse,
  FeedbackListParams,
  FeedbackListResponse,
  PublicFeedbackComment,
  UpdateFeedbackStatusParams,
} from './feedback-types';

export class FeedbackApi {
  constructor(private client: HttpClient) {}

  async createPost(
    params: CreateFeedbackPostParams,
  ): Promise<ApiResponse<CreateFeedbackPostResponse>> {
    return this.client.post('/api/feedback', params);
  }

  async listPosts(params?: FeedbackListParams): Promise<ApiResponse<FeedbackListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.category) qs.set('category', params.category);
    if (params?.status) qs.set('status', params.status);
    if (params?.hasStaffResponse !== undefined) {
      qs.set('hasStaffResponse', String(params.hasStaffResponse));
    }
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return this.client.get(`/api/feedback${query ? `?${query}` : ''}`);
  }

  async getPost(postId: string): Promise<ApiResponse<FeedbackDetailResponse>> {
    return this.client.get(`/api/feedback/${encodeURIComponent(postId)}`);
  }

  async upvotePost(postId: string): Promise<ApiResponse<{ upvoteCount: number; hasUpvoted: boolean }>> {
    return this.client.post(`/api/feedback/${encodeURIComponent(postId)}/upvote`, {});
  }

  async removeUpvote(postId: string): Promise<ApiResponse<{ upvoteCount: number; hasUpvoted: boolean }>> {
    return this.client.delete(`/api/feedback/${encodeURIComponent(postId)}/upvote`);
  }

  async addComment(
    postId: string,
    params: CreateFeedbackCommentParams,
  ): Promise<ApiResponse<PublicFeedbackComment>> {
    return this.client.post(
      `/api/feedback/${encodeURIComponent(postId)}/comments`,
      params,
    );
  }

  async updateStatus(
    postId: string,
    params: UpdateFeedbackStatusParams,
  ): Promise<ApiResponse<void>> {
    return this.client.patch(
      `/api/feedback/${encodeURIComponent(postId)}/status`,
      params,
    );
  }
}
