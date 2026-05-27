/**
 * Moderation support ticket controller — staff queue and ticket actions.
 *
 * @module routes/moderation/tickets-controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../../constants/platform-permissions';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  MAX_TICKET_BODY_LENGTH,
  type TicketCategory,
  type TicketStatus,
} from '@adieuu/shared';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getSupportTicketRepository } from '../../repositories/support-ticket.repository';
import { getSupportTicketEventRepository } from '../../repositories/support-ticket-event.repository';
import {
  assignTicket,
  unassignTicket,
  addStaffComment,
  escalateTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  getAttachmentUrls,
} from '../../services/support-ticket.service';
import {
  getPlatformCapabilities,
  type PlatformCapabilities,
} from '../../services/platform-capabilities.service';
import type { IdentitySessionData } from '../../services/session.service';
import { isValidObjectId } from '../../utils/isValidObjectId';
import {
  toPublicTicket,
  toPublicTicketEvent,
  type PublicTicket,
  type PublicTicketEvent,
} from '../support/controller';
import type { SupportTicketDocument } from '../../models/support-ticket';

export type TicketModerationFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'forbidden';

export type TicketModerationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: TicketModerationFailureKind; message?: string };

export type SupportStaffGateFailureReason = 'unauthorized' | 'forbidden';

export function canReadSupportTickets(caps: PlatformCapabilities): boolean {
  return caps.permissions.includes(PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS);
}

export function canUpdateSupportTickets(caps: PlatformCapabilities): boolean {
  return caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS);
}

export function canManageEscalatedTickets(caps: PlatformCapabilities): boolean {
  return caps.permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_TICKETS);
}

export async function gateSupportStaffSession(
  session: IdentitySessionData | null,
): Promise<
  | { ok: true; session: IdentitySessionData; caps: PlatformCapabilities }
  | { ok: false; reason: SupportStaffGateFailureReason }
> {
  if (!session) return { ok: false, reason: 'unauthorized' };

  const caps = await getPlatformCapabilities(session.identityId);
  if (!canReadSupportTickets(caps)) return { ok: false, reason: 'forbidden' };

  return { ok: true, session, caps };
}

export const AssignSchema = z.object({
  identityId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identity id'),
});

export const CommentSchema = z.object({
  body: z.string().min(1).max(MAX_TICKET_BODY_LENGTH),
  visibility: z.enum(['internal', 'public']),
});

export const ResolveSchema = z.object({
  resolutionNote: z.string().min(1).max(MAX_TICKET_BODY_LENGTH),
});

export const CloseSchema = z.object({
  reason: z.string().min(1).max(MAX_TICKET_BODY_LENGTH),
});

export const ReopenSchema = z.object({
  reason: z.string().min(1).max(MAX_TICKET_BODY_LENGTH).optional(),
});

function parseTicketObjectId(rawId: string | undefined): string | null {
  if (!rawId || !isValidObjectId(rawId)) return null;
  return rawId;
}

async function enrichTicket(doc: SupportTicketDocument): Promise<PublicTicket> {
  const attachments = await getAttachmentUrls(doc.attachmentMediaIds);
  return toPublicTicket(doc, attachments);
}

async function loadTicketByObjectId(objectId: string): Promise<SupportTicketDocument | null> {
  const repo = getSupportTicketRepository();
  return await repo.findById(objectId);
}

function requiresEscalatedPermission(ticket: SupportTicketDocument): boolean {
  return ticket.status === 'escalated';
}

export type ListTicketsData = {
  tickets: PublicTicket[];
  total: number;
  page: number;
  limit: number;
};

export async function listTicketsResult(
  moderatorId: string,
  searchParams: URLSearchParams,
): Promise<TicketModerationResult<ListTicketsData>> {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25));

  const statusParam = searchParams.get('status');
  const assignedParam = searchParams.get('assigned');
  const categoryParam = searchParams.get('category');

  const filter: Record<string, unknown> = {};
  if (statusParam) {
    const statuses = statusParam.split(',').filter((s) => TICKET_STATUSES.includes(s as TicketStatus));
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = statuses;
  }
  if (assignedParam === 'unassigned') filter.assignedTo = null;
  else if (assignedParam === 'me') filter.assignedTo = moderatorId;
  if (categoryParam && TICKET_CATEGORIES.includes(categoryParam as TicketCategory)) {
    filter.category = categoryParam;
  }

  const repo = getSupportTicketRepository();
  const result = await repo.list({ filter, page, limit });
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

export async function getTicketDetailResult(
  ticketObjectId: string | undefined,
): Promise<TicketModerationResult<TicketDetailData>> {
  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const repo = getSupportTicketRepository();
  const ticket = await repo.findById(id);
  if (!ticket) return { ok: false, kind: 'not_found' };

  const eventRepo = getSupportTicketEventRepository();
  const events = await eventRepo.listByTicketObjectId(id, { includeInternal: true });

  const identityIds = new Set<string>();
  if (ticket.assignedTo) identityIds.add(ticket.assignedTo);
  if (ticket.escalatedBy) identityIds.add(ticket.escalatedBy);
  if (ticket.resolvedBy) identityIds.add(ticket.resolvedBy);
  if (ticket.closedBy) identityIds.add(ticket.closedBy);

  for (const ev of events) {
    if (ev.actorType === 'identity') identityIds.add(ev.actorId);
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
      } catch {
        /* skip */
      }
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

export type SupportStaffRow = {
  identityId: string;
  displayName: string;
  username: string;
};

export async function listSupportStaffResult(): Promise<
  TicketModerationResult<{ staff: SupportStaffRow[] }>
> {
  const identityRepo = getIdentityRepository();
  const identities = await identityRepo.findByAnyPlatformRole([
    PLATFORM_ROLES.ADMIN,
    PLATFORM_ROLES.MODERATOR,
    PLATFORM_ROLES.SUPPORT_AGENT,
  ]);

  const staff: SupportStaffRow[] = identities.map((identity) => ({
    identityId: identity._id instanceof ObjectId ? identity._id.toHexString() : String(identity._id),
    displayName: identity.displayName ?? '',
    username: identity.username ?? '',
  }));

  staff.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { ok: true, data: { staff } };
}

export async function assignTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const result = await assignTicket(actorId, id, parsed.data.identityId);
  if (!result.success) {
    return { ok: false, kind: 'not_found', message: result.error };
  }

  const ticket = await loadTicketByObjectId(id);
  if (!ticket) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(ticket) };
}

export async function unassignTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const result = await unassignTicket(actorId, id);
  if (!result.success) {
    return { ok: false, kind: 'not_found', message: result.error };
  }

  const ticket = await loadTicketByObjectId(id);
  if (!ticket) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(ticket) };
}

export async function addTicketCommentResult(
  actorId: string,
  ticketObjectId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicketEvent>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const result = await addStaffComment(actorId, id, parsed.data.body, parsed.data.visibility);
  if (!result.success) {
    return { ok: false, kind: 'not_found', message: result.error };
  }

  const eventRepo = getSupportTicketEventRepository();
  const event = await eventRepo.findById(new ObjectId(result.data!.eventId));
  if (!event) return { ok: false, kind: 'not_found' };
  return { ok: true, data: toPublicTicketEvent(event) };
}

export async function escalateTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const result = await escalateTicket(actorId, id);
  if (!result.success) {
    if (result.errorCode === 'ALREADY_ESCALATED') {
      return { ok: false, kind: 'bad_request', message: result.error };
    }
    return { ok: false, kind: 'not_found', message: result.error };
  }

  const ticket = await loadTicketByObjectId(id);
  if (!ticket) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(ticket) };
}

export async function resolveTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const ticket = await loadTicketByObjectId(id);
  if (!ticket) return { ok: false, kind: 'not_found' };

  if (requiresEscalatedPermission(ticket) && !canManageEscalatedTickets(caps)) {
    return { ok: false, kind: 'forbidden' };
  }

  const result = await resolveTicket(actorId, id, parsed.data.resolutionNote);
  if (!result.success) {
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  const updated = await loadTicketByObjectId(id);
  if (!updated) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(updated) };
}

export async function closeTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = CloseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const ticket = await loadTicketByObjectId(id);
  if (!ticket) return { ok: false, kind: 'not_found' };

  if (requiresEscalatedPermission(ticket) && !canManageEscalatedTickets(caps)) {
    return { ok: false, kind: 'forbidden' };
  }

  const result = await closeTicket(actorId, id, parsed.data.reason);
  if (!result.success) {
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  const updated = await loadTicketByObjectId(id);
  if (!updated) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(updated) };
}

export async function reopenTicketResult(
  actorId: string,
  ticketObjectId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<TicketModerationResult<PublicTicket>> {
  if (!canUpdateSupportTickets(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseTicketObjectId(ticketObjectId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = ReopenSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const result = await reopenTicket(actorId, id, parsed.data.reason);
  if (!result.success) {
    return { ok: false, kind: 'bad_request', message: result.error };
  }

  const updated = await loadTicketByObjectId(id);
  if (!updated) return { ok: false, kind: 'not_found' };
  return { ok: true, data: await enrichTicket(updated) };
}
