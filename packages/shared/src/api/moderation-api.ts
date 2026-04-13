import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  ModeratorsListResponse,
  PublicReport,
  PublicReportEvent,
  ReportDetailResponse,
  ReportListParams,
  ReportListResponse,
  ResolveReportParams,
} from './moderation-types';

export class ModerationApi {
  constructor(private client: HttpClient) {}

  async listModerators(): Promise<ApiResponse<ModeratorsListResponse>> {
    return this.client.get('/api/moderation/moderators');
  }

  async listReports(params?: ReportListParams): Promise<ApiResponse<ReportListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    if (params?.assigned) qs.set('assigned', params.assigned);
    if (params?.type) qs.set('type', params.type);
    if (params?.category) qs.set('category', params.category);
    if (params?.targetIdentityId) qs.set('targetIdentityId', params.targetIdentityId);
    if (params?.reporterIdentityId) qs.set('reporterIdentityId', params.reporterIdentityId);
    const query = qs.toString();
    return this.client.get(`/api/moderation/reports${query ? `?${query}` : ''}`);
  }

  async getReport(id: string): Promise<ApiResponse<ReportDetailResponse>> {
    return this.client.get(`/api/moderation/reports/${encodeURIComponent(id)}`);
  }

  async assignReport(id: string, identityId: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/assign`, { identityId });
  }

  async unassignReport(id: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/unassign`, {});
  }

  async escalateReport(id: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/escalate`, {});
  }

  async changeCategory(id: string, category: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/category`, { category });
  }

  async addComment(id: string, body: string, visibility: 'internal' | 'public'): Promise<ApiResponse<PublicReportEvent>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/comment`, { body, visibility });
  }

  async resolveReport(id: string, params: ResolveReportParams): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/resolve`, params);
  }

  async closeReport(id: string, reason: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/close`, { reason });
  }

  async reopenReport(id: string, reason?: string): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/reopen`, { reason });
  }
}
