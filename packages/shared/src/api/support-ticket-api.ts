import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  AddSupportTicketCommentParams,
  CreateSupportTicketParams,
  PublicSupportTicket,
  PublicSupportTicketEvent,
  SupportTicketDetailResponse,
  SupportTicketListParams,
  SupportTicketListResponse,
  UserResolveSupportTicketParams,
} from './support-ticket-types';

export class SupportTicketApi {
  constructor(private client: HttpClient) {}

  async createTicket(params: CreateSupportTicketParams): Promise<ApiResponse<{ ticketId: string }>> {
    return this.client.post('/api/support/tickets', params);
  }

  async listTickets(params?: SupportTicketListParams): Promise<ApiResponse<SupportTicketListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.client.get(`/api/support/tickets${query ? `?${query}` : ''}`);
  }

  async getTicket(ticketId: string): Promise<ApiResponse<SupportTicketDetailResponse>> {
    return this.client.get(`/api/support/tickets/${encodeURIComponent(ticketId)}`);
  }

  async addComment(
    ticketId: string,
    params: AddSupportTicketCommentParams,
  ): Promise<ApiResponse<PublicSupportTicketEvent>> {
    return this.client.post(`/api/support/tickets/${encodeURIComponent(ticketId)}/comments`, params);
  }

  async resolveTicket(
    ticketId: string,
    params: UserResolveSupportTicketParams,
  ): Promise<ApiResponse<void>> {
    return this.client.post(`/api/support/tickets/${encodeURIComponent(ticketId)}/resolve`, params);
  }
}

export type { PublicSupportTicket, PublicSupportTicketEvent };
