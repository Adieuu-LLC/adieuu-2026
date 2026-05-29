/**
 * Support ticket service — submission, comments, and moderation workflows.
 */

import { ObjectId } from 'mongodb';
import {
  TICKET_CATEGORIES,
  MAX_TICKET_ATTACHMENTS,
  MAX_TICKET_BODY_LENGTH,
  MAX_TICKET_TITLE_LENGTH,
  isValidTicketSubcategory,
  type TicketCategory,
  type TicketStatus,
} from '@adieuu/shared';
import type { TicketSubmitterType } from '../models/support-ticket';
import type {
  SupportTicketActorType,
  SupportTicketEventType,
} from '../models/support-ticket-event';
import { getSupportTicketRepository } from '../repositories/support-ticket.repository';
import { getSupportTicketEventRepository } from '../repositories/support-ticket-event.repository';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import { checkRateLimit, type RateLimitConfig } from './rate-limit.service';
import { createNotification } from './notification.service';
import elog from '../utils/adieuuLogger';

const TICKET_CREATE_RATE_LIMIT: RateLimitConfig = { limit: 3, windowSeconds: 3600 };
const TICKET_COMMENT_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSeconds: 600 };

const TERMINAL_STATUSES: TicketStatus[] = ['resolved', 'closed'];

export type SubmitterContext =
  | { type: 'account'; id: string }
  | { type: 'identity'; id: string };

export type SupportTicketErrorCode =
  | 'INVALID_CATEGORY'
  | 'INVALID_SUBCATEGORY'
  | 'TITLE_TOO_LONG'
  | 'BODY_TOO_LONG'
  | 'TOO_MANY_ATTACHMENTS'
  | 'INVALID_ATTACHMENT'
  | 'ATTACHMENT_NOT_READY'
  | 'ATTACHMENT_NOT_OWNED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'TICKET_CLOSED'
  | 'INVALID_STATUS'
  | 'ALREADY_ESCALATED';

export type ServiceResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode: SupportTicketErrorCode };

function generateTicketId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  const randomPart = Array.from(randomBytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8);
  return `T-${randomPart}`;
}

function actorTypeFromSubmitter(type: TicketSubmitterType): SupportTicketActorType {
  return type;
}

async function validateAttachments(
  submitter: SubmitterContext,
  attachmentMediaIds: string[],
): Promise<ServiceResult<string[]>> {
  if (attachmentMediaIds.length > MAX_TICKET_ATTACHMENTS) {
    return {
      success: false,
      error: `Maximum ${MAX_TICKET_ATTACHMENTS} attachments allowed`,
      errorCode: 'TOO_MANY_ATTACHMENTS',
    };
  }

  if (attachmentMediaIds.length === 0) {
    return { success: true, data: [] };
  }

  const mediaRepo = getMediaUploadRepository();
  const uniqueIds = [...new Set(attachmentMediaIds)];

  for (const mediaId of uniqueIds) {
    const doc = await mediaRepo.findByMediaId(mediaId);
    if (!doc || doc.purpose !== 'ticket_attachment') {
      return { success: false, error: 'Invalid attachment', errorCode: 'INVALID_ATTACHMENT' };
    }

    if (doc.status !== 'ready') {
      return {
        success: false,
        error: 'Attachment is not ready',
        errorCode: 'ATTACHMENT_NOT_READY',
      };
    }

    if (submitter.type === 'identity') {
      const ownerId = doc.identityId?.toHexString();
      if (ownerId !== submitter.id) {
        return {
          success: false,
          error: 'Attachment not owned by submitter',
          errorCode: 'ATTACHMENT_NOT_OWNED',
        };
      }
    } else {
      const ownerId = doc.userId?.toHexString();
      if (ownerId !== submitter.id) {
        return {
          success: false,
          error: 'Attachment not owned by submitter',
          errorCode: 'ATTACHMENT_NOT_OWNED',
        };
      }
    }
  }

  return { success: true, data: uniqueIds };
}

export interface CreateTicketInput {
  category: string;
  subcategory?: string;
  title: string;
  body: string;
  attachmentMediaIds?: string[];
}

export async function createSupportTicket(
  submitter: SubmitterContext,
  input: CreateTicketInput,
): Promise<ServiceResult<{ ticketId: string; objectId: string }>> {
  const rateKey = `support:ticket:create:${submitter.type}:${submitter.id}`;
  const rl = await checkRateLimit(rateKey, submitter.id, TICKET_CREATE_RATE_LIMIT);
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
  }

  if (!TICKET_CATEGORIES.includes(input.category as TicketCategory)) {
    return { success: false, error: 'Invalid category', errorCode: 'INVALID_CATEGORY' };
  }

  const category = input.category as TicketCategory;

  if (input.subcategory && !isValidTicketSubcategory(category, input.subcategory)) {
    return { success: false, error: 'Invalid subcategory', errorCode: 'INVALID_SUBCATEGORY' };
  }

  if (input.title.length === 0 || input.title.length > MAX_TICKET_TITLE_LENGTH) {
    return { success: false, error: 'Invalid title length', errorCode: 'TITLE_TOO_LONG' };
  }

  if (input.body.length === 0 || input.body.length > MAX_TICKET_BODY_LENGTH) {
    return { success: false, error: 'Invalid body length', errorCode: 'BODY_TOO_LONG' };
  }

  const attachmentResult = await validateAttachments(
    submitter,
    input.attachmentMediaIds ?? [],
  );
  if (!attachmentResult.success) {
    return attachmentResult;
  }

  const ticketId = generateTicketId();
  const repo = getSupportTicketRepository();
  const ticket = await repo.createTicket({
    ticketId,
    submitterType: submitter.type,
    submitterId: submitter.id,
    category,
    subcategory: input.subcategory,
    title: input.title.trim(),
    body: input.body,
    attachmentMediaIds: attachmentResult.data,
  });

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'status_change',
    actorType: actorTypeFromSubmitter(submitter.type),
    actorId: submitter.id,
    body: 'Ticket created',
    metadata: { from: null, to: 'open' },
  });

  void import('./support-ticket-assignment.service')
    .then(({ autoAssignNewTicket }) => autoAssignNewTicket(ticket))
    .catch((err) => {
      elog.warn('Failed to auto-assign support ticket', { ticketId: ticket.ticketId, error: err });
    });

  return {
    success: true,
    data: { ticketId: ticket.ticketId, objectId: ticket._id.toHexString() },
  };
}

export function isTicketOwner(
  submitter: SubmitterContext,
  ticket: { submitterType: TicketSubmitterType; submitterId: string },
): boolean {
  return ticket.submitterType === submitter.type && ticket.submitterId === submitter.id;
}

export async function addSubmitterComment(
  submitter: SubmitterContext,
  ticketId: string,
  body: string,
): Promise<ServiceResult<{ eventId: string }>> {
  if (body.length === 0 || body.length > MAX_TICKET_BODY_LENGTH) {
    return { success: false, error: 'Invalid comment length', errorCode: 'BODY_TOO_LONG' };
  }

  const rateKey = `support:ticket:comment:${submitter.type}:${submitter.id}`;
  const rl = await checkRateLimit(rateKey, submitter.id, TICKET_COMMENT_RATE_LIMIT);
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
  }

  const repo = getSupportTicketRepository();
  const ticket = await repo.findByTicketId(ticketId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (!isTicketOwner(submitter, ticket)) {
    return { success: false, error: 'Forbidden', errorCode: 'FORBIDDEN' };
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Ticket is closed', errorCode: 'TICKET_CLOSED' };
  }

  const eventRepo = getSupportTicketEventRepository();
  const event = await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'comment_public',
    actorType: actorTypeFromSubmitter(submitter.type),
    actorId: submitter.id,
    body,
  });

  if (ticket.assignedTo) {
    void emitTicketNotification(ticket.assignedTo, 'support_ticket_user_reply', {
      ticketId: ticket.ticketId,
      ticketObjectId: ticket._id.toHexString(),
      title: ticket.title,
    });
  }

  return { success: true, data: { eventId: event._id.toHexString() } };
}

export async function addStaffComment(
  actorIdentityId: string,
  ticketObjectId: string,
  body: string,
  visibility: 'internal' | 'public',
): Promise<ServiceResult<{ eventId: string }>> {
  if (body.length === 0 || body.length > MAX_TICKET_BODY_LENGTH) {
    return { success: false, error: 'Invalid comment length', errorCode: 'BODY_TOO_LONG' };
  }

  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventType: SupportTicketEventType =
    visibility === 'internal' ? 'comment_internal' : 'comment_public';

  const eventRepo = getSupportTicketEventRepository();
  const event = await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType,
    actorType: 'identity',
    actorId: actorIdentityId,
    body,
  });

  if (ticket.status === 'open') {
    await repo.setStatus(ticket._id.toHexString(), 'in_progress');
    await eventRepo.createEvent({
      ticketObjectId: ticket._id,
      ticketId: ticket.ticketId,
      eventType: 'status_change',
      actorType: 'system',
      actorId: 'system',
      metadata: { from: 'open', to: 'in_progress' },
    });
  }

  if (visibility === 'public' && ticket.submitterType === 'identity') {
    void emitTicketNotification(ticket.submitterId, 'support_ticket_reply', {
      ticketId: ticket.ticketId,
      ticketObjectId: ticket._id.toHexString(),
      title: ticket.title,
      staffIdentityId: actorIdentityId,
    });
  }

  return { success: true, data: { eventId: event._id.toHexString() } };
}

export type AssignTicketOptions = {
  actorType?: SupportTicketActorType;
  notifyAssignee?: boolean;
  skipIfSameAssignee?: boolean;
};

export async function assignTicket(
  actorIdentityId: string,
  ticketObjectId: string,
  assigneeIdentityId: string,
  options: AssignTicketOptions = {},
): Promise<ServiceResult> {
  const {
    actorType = 'identity',
    notifyAssignee = true,
    skipIfSameAssignee = true,
  } = options;

  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const previousAssignee = ticket.assignedTo ?? null;
  if (skipIfSameAssignee && previousAssignee === assigneeIdentityId) {
    return { success: true, data: undefined };
  }

  const updated = await repo.assign(ticketObjectId, assigneeIdentityId);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'assignment_change',
    actorType,
    actorId: actorIdentityId,
    body: previousAssignee
      ? `Reassigned from ${previousAssignee.slice(0, 8)}… to ${assigneeIdentityId.slice(0, 8)}…`
      : `Assigned to ${assigneeIdentityId.slice(0, 8)}…`,
    metadata: { from: previousAssignee, assignedTo: assigneeIdentityId },
  });

  if (notifyAssignee && assigneeIdentityId !== actorIdentityId) {
    void emitTicketNotification(assigneeIdentityId, 'support_ticket_assigned', {
      ticketId: ticket.ticketId,
      ticketObjectId: ticket._id.toHexString(),
      title: ticket.title,
    });
  }

  return { success: true, data: undefined };
}

export async function unassignTicket(
  actorIdentityId: string,
  ticketObjectId: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const previousAssignee = ticket.assignedTo ?? null;
  const updated = await repo.unassign(ticketObjectId);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'assignment_change',
    actorType: 'identity',
    actorId: actorIdentityId,
    body: previousAssignee
      ? `Unassigned from ${previousAssignee.slice(0, 8)}…`
      : 'Unassigned',
    metadata: { from: previousAssignee, assignedTo: null },
  });

  return { success: true, data: undefined };
}

export async function escalateTicket(
  actorIdentityId: string,
  ticketObjectId: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  if (ticket.status === 'escalated') {
    return { success: false, error: 'Already escalated', errorCode: 'ALREADY_ESCALATED' };
  }

  const updated = await repo.escalate(ticketObjectId, actorIdentityId);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'escalation',
    actorType: 'identity',
    actorId: actorIdentityId,
    body: 'Ticket escalated to admin review',
    metadata: { from: ticket.status, to: 'escalated' },
  });

  return { success: true, data: undefined };
}

export async function resolveTicket(
  actorIdentityId: string,
  ticketObjectId: string,
  resolutionNote: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  const updated = await repo.resolve(ticketObjectId, actorIdentityId, resolutionNote);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'status_change',
    actorType: 'identity',
    actorId: actorIdentityId,
    body: resolutionNote,
    metadata: { from: ticket.status, to: 'resolved' },
  });

  return { success: true, data: undefined };
}

export async function resolveTicketBySubmitter(
  submitter: SubmitterContext,
  ticketId: string,
  note?: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findByTicketId(ticketId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (!isTicketOwner(submitter, ticket)) {
    return { success: false, error: 'Forbidden', errorCode: 'FORBIDDEN' };
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  const resolutionNote = note || 'Resolved by submitter';
  const updated = await repo.resolve(ticket._id.toHexString(), submitter.id, resolutionNote);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'status_change',
    actorType: actorTypeFromSubmitter(submitter.type),
    actorId: submitter.id,
    body: resolutionNote,
    metadata: { from: ticket.status, to: 'resolved' },
  });

  return { success: true, data: undefined };
}

export async function closeTicket(
  actorIdentityId: string,
  ticketObjectId: string,
  closureReason: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  const updated = await repo.close(ticketObjectId, actorIdentityId, closureReason);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'status_change',
    actorType: 'identity',
    actorId: actorIdentityId,
    body: closureReason,
    metadata: { from: ticket.status, to: 'closed' },
  });

  return { success: true, data: undefined };
}

export async function reopenTicket(
  actorIdentityId: string,
  ticketObjectId: string,
  reason?: string,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(ticketObjectId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (!TERMINAL_STATUSES.includes(ticket.status)) {
    return { success: false, error: 'Invalid status', errorCode: 'INVALID_STATUS' };
  }

  const updated = await repo.reopen(ticketObjectId);
  if (!updated) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  const eventRepo = getSupportTicketEventRepository();
  await eventRepo.createEvent({
    ticketObjectId: ticket._id,
    ticketId: ticket.ticketId,
    eventType: 'status_change',
    actorType: 'identity',
    actorId: actorIdentityId,
    body: reason ? `Ticket reopened: ${reason}` : 'Ticket reopened',
    metadata: { from: ticket.status, to: 'open' },
  });

  return { success: true, data: undefined };
}

async function emitTicketNotification(
  recipientIdentityId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await createNotification(recipientIdentityId, type, data);
  } catch (err) {
    elog.warn('Failed to emit ticket notification', { type, recipientIdentityId, error: err });
  }
}

export async function countUnreadSupportTicketsForSubmitter(
  submitter: SubmitterContext,
): Promise<number> {
  const repo = getSupportTicketRepository();
  return await repo.countUnreadForSubmitter(submitter.type, submitter.id);
}

export async function markSupportTicketReadBySubmitter(
  submitter: SubmitterContext,
  ticketId: string,
  readAt?: Date,
): Promise<ServiceResult> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findByTicketId(ticketId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found', errorCode: 'NOT_FOUND' };
  }

  if (!isTicketOwner(submitter, ticket)) {
    return { success: false, error: 'Forbidden', errorCode: 'FORBIDDEN' };
  }

  await repo.markSubmitterRead(ticket._id.toHexString(), readAt);
  return { success: true, data: undefined };
}

export async function getAttachmentUrls(
  mediaIds: string[],
): Promise<Array<{ mediaId: string; cdnUrl: string; contentType: string }>> {
  if (mediaIds.length === 0) return [];

  const mediaRepo = getMediaUploadRepository();
  const results: Array<{ mediaId: string; cdnUrl: string; contentType: string }> = [];

  for (const mediaId of mediaIds) {
    const doc = await mediaRepo.findByMediaId(mediaId);
    if (doc?.cdnUrl) {
      results.push({ mediaId, cdnUrl: doc.cdnUrl, contentType: doc.contentType });
    }
  }

  return results;
}

/** Exported for tests */
export { generateTicketId };
