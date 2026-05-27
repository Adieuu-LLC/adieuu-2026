/**
 * Support ticket model — user-initiated help requests.
 */

import type { TicketCategory, TicketPriority, TicketStatus } from '@adieuu/shared';
import type { BaseDocument } from './base';

export const TICKET_SUBMITTER_TYPES = ['account', 'identity'] as const;
export type TicketSubmitterType = (typeof TICKET_SUBMITTER_TYPES)[number];

export interface SupportTicketDocument extends BaseDocument {
  /** Human-friendly ticket identifier (e.g. T-abc123) */
  ticketId: string;
  submitterType: TicketSubmitterType;
  /** userId (account) or identityId (alias) */
  submitterId: string;
  category: TicketCategory;
  subcategory?: string;
  title: string;
  body: string;
  attachmentMediaIds: string[];
  status: TicketStatus;
  priority?: TicketPriority;
  /** Moderator identity ID assigned to this ticket */
  assignedTo?: string;
  escalatedAt?: Date;
  escalatedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
  closedAt?: Date;
  closedBy?: string;
  closureReason?: string;
}

export interface CreateSupportTicketInput {
  ticketId: string;
  submitterType: TicketSubmitterType;
  submitterId: string;
  category: TicketCategory;
  subcategory?: string;
  title: string;
  body: string;
  attachmentMediaIds: string[];
}
