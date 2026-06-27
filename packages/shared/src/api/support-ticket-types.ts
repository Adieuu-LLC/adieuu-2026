import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../constants/support-ticket-categories';

export type TicketSubmitterType = 'account' | 'identity';

export type SupportTicketEventType =
  | 'comment_public'
  | 'comment_internal'
  | 'status_change'
  | 'assignment_change'
  | 'escalation';

export type SupportTicketActorType = 'account' | 'identity' | 'system';

export interface TicketAttachment {
  mediaId: string;
  cdnUrl: string;
  contentType: string;
}

export interface PublicSupportTicket {
  id: string;
  ticketId: string;
  submitterType: TicketSubmitterType;
  submitterId: string;
  category: TicketCategory;
  subcategory?: string;
  title: string;
  body: string;
  attachmentMediaIds: string[];
  attachments?: TicketAttachment[];
  status: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  /** Display name of the assigned moderator (resolved server-side) */
  assignedToName?: string;
  escalatedAt?: string;
  escalatedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  closedAt?: string;
  closedBy?: string;
  closureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSupportTicketEvent {
  id: string;
  ticketId: string;
  eventType: SupportTicketEventType;
  actorType: SupportTicketActorType;
  actorId: string;
  body?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateSupportTicketParams {
  category: TicketCategory;
  subcategory?: string;
  title: string;
  body: string;
  attachmentMediaIds?: string[];
}

export interface SupportTicketListParams {
  page?: number;
  limit?: number;
}

export interface SupportTicketListResponse {
  tickets: PublicSupportTicket[];
  total: number;
  page: number;
  limit: number;
}

export interface SupportTicketDetailResponse {
  ticket: PublicSupportTicket;
  events: PublicSupportTicketEvent[];
  identityProfiles?: Record<string, { displayName: string; username: string; avatarUrl?: string }>;
}

export interface AddSupportTicketCommentParams {
  body: string;
}

export interface UserResolveSupportTicketParams {
  note?: string;
}

export interface ModerationTicketListParams {
  page?: number;
  limit?: number;
  status?: string;
  assigned?: 'all' | 'me' | 'unassigned';
  category?: TicketCategory;
}

export interface ModerationTicketListResponse {
  tickets: PublicSupportTicket[];
  total: number;
  page: number;
  limit: number;
}

export interface ModerationTicketDetailResponse {
  ticket: PublicSupportTicket;
  events: PublicSupportTicketEvent[];
  identityProfiles: Record<string, { displayName: string; username: string; avatarUrl?: string }>;
}

export interface ResolveSupportTicketParams {
  resolutionNote: string;
}

export interface CloseSupportTicketParams {
  reason: string;
}

export interface ReopenSupportTicketParams {
  reason?: string;
}

export interface StaffTicketCommentParams {
  body: string;
  visibility: 'internal' | 'public';
}
