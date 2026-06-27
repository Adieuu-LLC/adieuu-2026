import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  FileLeReportParams,
  ModerationScanEvidenceResponse,
  ModeratorsListResponse,
  PublicReport,
  PublicReportEvent,
  ReportDetailResponse,
  ReportListParams,
  ReportListResponse,
  ResolveReportParams,
} from './moderation-types';
import type {
  CloseSupportTicketParams,
  ModerationTicketDetailResponse,
  ModerationTicketListParams,
  ModerationTicketListResponse,
  PublicSupportTicket,
  PublicSupportTicketEvent,
  ReopenSupportTicketParams,
  ResolveSupportTicketParams,
  StaffTicketCommentParams,
} from './support-ticket-types';

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

  async getReportScanEvidence(id: string): Promise<ApiResponse<ModerationScanEvidenceResponse>> {
    return this.client.get(
      `/api/moderation/reports/${encodeURIComponent(id)}/scan-evidence`
    );
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

  async fileLeReport(id: string, params: FileLeReportParams): Promise<ApiResponse<PublicReport>> {
    return this.client.post(`/api/moderation/reports/${encodeURIComponent(id)}/le-report`, params);
  }

  async listTickets(params?: ModerationTicketListParams): Promise<ApiResponse<ModerationTicketListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    if (params?.assigned) qs.set('assigned', params.assigned);
    if (params?.category) qs.set('category', params.category);
    const query = qs.toString();
    return this.client.get(`/api/moderation/tickets${query ? `?${query}` : ''}`);
  }

  async getTicket(id: string): Promise<ApiResponse<ModerationTicketDetailResponse>> {
    return this.client.get(`/api/moderation/tickets/${encodeURIComponent(id)}`);
  }

  async assignTicket(id: string, identityId: string): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/assign`, { identityId });
  }

  async unassignTicket(id: string): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/unassign`, {});
  }

  async escalateTicket(id: string): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/escalate`, {});
  }

  async addTicketComment(
    id: string,
    params: StaffTicketCommentParams,
  ): Promise<ApiResponse<PublicSupportTicketEvent>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/comment`, params);
  }

  async resolveTicket(id: string, params: ResolveSupportTicketParams): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/resolve`, params);
  }

  async closeTicket(id: string, params: CloseSupportTicketParams): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/close`, params);
  }

  async reopenTicket(id: string, params?: ReopenSupportTicketParams): Promise<ApiResponse<PublicSupportTicket>> {
    return this.client.post(`/api/moderation/tickets/${encodeURIComponent(id)}/reopen`, params ?? {});
  }

  async listSupportStaff(): Promise<ApiResponse<{ staff: Array<{ identityId: string; displayName: string; username: string }> }>> {
    return this.client.get('/api/moderation/support-staff');
  }
}
