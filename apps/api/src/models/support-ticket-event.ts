/**
 * Support ticket event model — timeline entries for a support ticket.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export const SUPPORT_TICKET_EVENT_TYPES = [
  'comment_public',
  'comment_internal',
  'status_change',
  'assignment_change',
  'escalation',
] as const;

export type SupportTicketEventType = (typeof SUPPORT_TICKET_EVENT_TYPES)[number];

export const SUPPORT_TICKET_ACTOR_TYPES = ['account', 'identity', 'system'] as const;
export type SupportTicketActorType = (typeof SUPPORT_TICKET_ACTOR_TYPES)[number];

export interface SupportTicketEventDocument extends BaseDocument {
  /** Mongo ObjectId of the parent ticket document */
  ticketObjectId: ObjectId;
  /** Human-friendly ticket ID for denormalized lookups */
  ticketId: string;
  eventType: SupportTicketEventType;
  actorType: SupportTicketActorType;
  actorId: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSupportTicketEventInput {
  ticketObjectId: ObjectId;
  ticketId: string;
  eventType: SupportTicketEventType;
  actorType: SupportTicketActorType;
  actorId: string;
  body?: string;
  metadata?: Record<string, unknown>;
}
