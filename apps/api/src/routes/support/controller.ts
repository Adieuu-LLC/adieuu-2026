/**
 * Support ticket controller — user-facing ticket submission and comments.
 *
 * @module routes/support/controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import {
  TICKET_CATEGORIES,
  MAX_TICKET_BODY_LENGTH,
  MAX_TICKET_TITLE_LENGTH,
  MAX_TICKET_ATTACHMENTS,
} from '@adieuu/shared';
import type { SupportTicketDocument } from '../../models/support-ticket';
import type { SupportTicketEventDocument } from '../../models/support-ticket-event';
import { getSupportTicketRepository } from '../../repositories/support-ticket.repository';
import { getSupportTicketEventRepository } from '../../repositories/support-ticket-event.repository';
import {
  createSupportTicket,
  addSubmitterComment,
  resolveTicketBySubmitter,
  getAttachmentUrls,
  isTicketOwner,
  countUnreadSupportTicketsForSubmitter,
  markSupportTicketReadBySubmitter,
  type SubmitterContext,
} from '../../services/support-ticket.service';
import { getIdentityRepository } from '../../repositories/identity.repository';
import {
  getSessionFromRequest,
  type AccountSessionData,
  type IdentitySessionData,
} from '../../services/session.service';

export type SupportFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'unauthorized';

export type SupportResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: SupportFailureKind; message?: string; retryAfter?: number };

export const CreateTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES as unknown as [string, ...string[]]),
  subcategory: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(MAX_TICKET_TITLE_LENGTH),
  body: z.string().min(1).max(MAX_TICKET_BODY_LENGTH),
  attachmentMediaIds: z.array(z.string().min(1).max(200)).max(MAX_TICKET_ATTACHMENTS).optional(),
});

export const CommentSchema = z.object({
  body: z.string().min(1).max(MAX_TICKET_BODY_LENGTH),
});

export const UserResolveSchema = z.object({
  note: z.string().max(500).optional(),
});

export type PublicTicket = ReturnType<typeof toPublicTicket>;
export type PublicTicketEvent = ReturnType<typeof toPublicTicketEvent>;

export async function resolveSubmitterContext(
  request: Request,
): Promise<SubmitterContext | null> {
  const session = await getSessionFromRequest(request);
  if (!session) return null;
  if (session.type === 'account') {
    return { type: 'account', id: (session as AccountSessionData).userId };
  }
  return { type: 'identity', id: (session as IdentitySessionData).identityId };
}

export function toPublicTicket(
  doc: SupportTicketDocument,
  attachments?: Array<{ mediaId: string; cdnUrl: string; contentType: string }>,
) {
  return {
    id: doc._id.toHexString(),
    ticketId: doc.ticketId,
    submitterType: doc.submitterType,
    submitterId: doc.submitterId,
    category: doc.category,
    subcategory: doc.subcategory,
    title: doc.title,
    body: doc.body,
    attachmentMediaIds: doc.attachmentMediaIds,
    attachments,
    status: doc.status,
    priority: doc.priority,
    assignedTo: doc.assignedTo,
    escalatedAt: doc.escalatedAt?.toISOString(),
    escalatedBy: doc.escalatedBy,
    resolvedAt: doc.resolvedAt?.toISOString(),
    resolvedBy: doc.resolvedBy,
    resolutionNote: doc.resolutionNote,
    closedAt: doc.closedAt?.toISOString(),
    closedBy: doc.closedBy,
    closureReason: doc.closureReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toPublicTicketEvent(doc: SupportTicketEventDocument) {
  return {
    id: doc._id.toHexString(),
    ticketId: doc.ticketId,
    eventType: doc.eventType,
    actorType: doc.actorType,
    actorId: doc.actorId,
    body: doc.body,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function enrichTicket(doc: SupportTicketDocument): Promise<PublicTicket & { assignedToName?: string }> {
  const attachments = await getAttachmentUrls(doc.attachmentMediaIds);
  const ticket = toPublicTicket(doc, attachments);

  let assignedToName: string | undefined;
  if (doc.assignedTo) {
    const identityRepo = getIdentityRepository();
    const identity = await identityRepo.findByIdentityId(doc.assignedTo);
    if (identity) {
      assignedToName = identity.displayName || identity.username || undefined;
    }
  }

  return { ...ticket, assignedToName };
}

export async function createTicketResult(
  submitter: SubmitterContext,
  body: unknown,
): Promise<SupportResult<{ ticketId: string }>> {
  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await createSupportTicket(submitter, parsed.data);
  if (!result.success) {
    switch (result.errorCode) {
      case 'RATE_LIMITED':
        return { ok: false, kind: 'rate_limited' };
      case 'INVALID_CATEGORY':
      case 'INVALID_SUBCATEGORY':
      case 'TITLE_TOO_LONG':
      case 'BODY_TOO_LONG':
      case 'TOO_MANY_ATTACHMENTS':
      case 'INVALID_ATTACHMENT':
      case 'ATTACHMENT_NOT_READY':
      case 'ATTACHMENT_NOT_OWNED':
        return { ok: false, kind: 'bad_request', message: result.error };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  return { ok: true, data: { ticketId: result.data.ticketId } };
}

export type ListOwnTicketsData = {
  tickets: PublicTicket[];
  total: number;
  page: number;
  limit: number;
};

export async function listOwnTicketsResult(
  submitter: SubmitterContext,
  searchParams: URLSearchParams,
): Promise<SupportResult<ListOwnTicketsData>> {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25));

  const repo = getSupportTicketRepository();
  const result = await repo.list({
    filter: { submitterType: submitter.type, submitterId: submitter.id },
    page,
    limit,
  });

  const tickets = await Promise.all(result.tickets.map((t) => enrichTicket(t)));

  return {
    ok: true,
    data: {
      tickets,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  };
}

export type TicketDetailData = {
  ticket: PublicTicket;
  events: PublicTicketEvent[];
  identityProfiles: Record<string, { displayName: string; username: string; avatarUrl?: string }>;
};

export async function getOwnTicketResult(
  submitter: SubmitterContext,
  ticketId: string,
): Promise<SupportResult<TicketDetailData>> {
  const repo = getSupportTicketRepository();
  const ticket = await repo.findByTicketId(ticketId);
  if (!ticket) {
    return { ok: false, kind: 'not_found' };
  }

  if (!isTicketOwner(submitter, ticket)) {
    return { ok: false, kind: 'forbidden' };
  }

  await markSupportTicketReadBySubmitter(submitter, ticketId);

  const eventRepo = getSupportTicketEventRepository();
  const events = await eventRepo.listByTicketObjectId(ticket._id, { includeInternal: false });

  const identityIds = new Set<string>();
  if (ticket.assignedTo) identityIds.add(ticket.assignedTo);
  if (submitter.type === 'identity') identityIds.add(submitter.id);
  for (const ev of events) {
    if (ev.actorType === 'identity') {
      identityIds.add(ev.actorId);
    }
  }

  const identityRepo = getIdentityRepository();
  const identityProfiles: TicketDetailData['identityProfiles'] = {};
  await Promise.all(
    [...identityIds].map(async (iid) => {
      try {
        const identity = await identityRepo.findByIdentityId(iid);
        if (identity) {
          identityProfiles[iid] = {
            displayName: identity.displayName ?? '',
            username: identity.username ?? '',
            avatarUrl: identity.avatarUrl,
          };
        }
      } catch { /* swallow lookup failures */ }
    }),
  );

  return {
    ok: true,
    data: {
      ticket: await enrichTicket(ticket),
      events: events.map(toPublicTicketEvent),
      identityProfiles,
    },
  };
}

export async function getUnreadSupportTicketCountResult(
  submitter: SubmitterContext,
): Promise<SupportResult<{ unreadCount: number }>> {
  const unreadCount = await countUnreadSupportTicketsForSubmitter(submitter);
  return { ok: true, data: { unreadCount } };
}

export async function addOwnCommentResult(
  submitter: SubmitterContext,
  ticketId: string,
  body: unknown,
): Promise<SupportResult<PublicTicketEvent>> {
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await addSubmitterComment(submitter, ticketId, parsed.data.body);
  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return { ok: false, kind: 'not_found' };
      case 'FORBIDDEN':
        return { ok: false, kind: 'forbidden' };
      case 'RATE_LIMITED':
        return { ok: false, kind: 'rate_limited' };
      case 'TICKET_CLOSED':
        return { ok: false, kind: 'bad_request', message: result.error };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  const eventRepo = getSupportTicketEventRepository();
  const event = await eventRepo.findById(new ObjectId(result.data.eventId));
  if (!event) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true, data: toPublicTicketEvent(event) };
}

export async function resolveOwnTicketResult(
  submitter: SubmitterContext,
  ticketId: string,
  body: unknown,
): Promise<SupportResult> {
  const parsed = UserResolveSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const result = await resolveTicketBySubmitter(submitter, ticketId, parsed.data.note);
  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return { ok: false, kind: 'not_found' };
      case 'FORBIDDEN':
        return { ok: false, kind: 'forbidden' };
      case 'INVALID_STATUS':
        return { ok: false, kind: 'bad_request', message: result.error };
      default:
        return { ok: false, kind: 'bad_request', message: result.error };
    }
  }

  return { ok: true, data: undefined };
}
