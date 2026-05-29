/**
 * Support ticket auto-assignment — round-robin among recently active staff.
 *
 * Prefers support_agent roles; falls back to moderators/admins when no support
 * agents were recently active. If nobody was active in the last 15 minutes,
 * leaves the ticket unassigned and notifies all platform admins.
 */

import { PLATFORM_ROLES } from '../constants/platform-permissions';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { getIdentityRepository } from '../repositories/identity.repository';
import type { SupportTicketDocument } from '../models/support-ticket';
import { createNotification } from './notification.service';
import elog from '../utils/adieuuLogger';
import type { AssignTicketOptions } from './support-ticket.service';

const RECENTLY_ACTIVE_MS = 15 * 60 * 1000;

const fallbackRoundRobinCursor = new Map<string, number>();

export type StaffPool = 'support_agent' | 'fallback';

function identityIdFromDoc(identity: { _id: { toHexString(): string } | string }): string {
  return typeof identity._id === 'string' ? identity._id : identity._id.toHexString();
}

function hasPlatformRole(identity: { platformRoles?: string[] }, role: string): boolean {
  return identity.platformRoles?.includes(role) ?? false;
}

export function classifyStaffPool(identity: { platformRoles?: string[] }): StaffPool | null {
  if (hasPlatformRole(identity, PLATFORM_ROLES.SUPPORT_AGENT)) {
    return 'support_agent';
  }
  if (
    hasPlatformRole(identity, PLATFORM_ROLES.MODERATOR) ||
    hasPlatformRole(identity, PLATFORM_ROLES.ADMIN)
  ) {
    return 'fallback';
  }
  return null;
}

export async function isIdentityRecentlyActive(identityId: string): Promise<boolean> {
  if (!isRedisConnected()) return false;

  try {
    const redis = getRedis();
    const online = await redis.get(RedisKeys.chatOnline(identityId));
    if (online) return true;

    const lastSeenRaw = await redis.get(RedisKeys.chatLastSeen(identityId));
    if (!lastSeenRaw) return false;

    const lastSeen = Date.parse(lastSeenRaw);
    if (Number.isNaN(lastSeen)) return false;

    return Date.now() - lastSeen <= RECENTLY_ACTIVE_MS;
  } catch (error) {
    elog.warn('Failed to read staff presence for support assignment', { identityId, error });
    return false;
  }
}

export async function filterRecentlyActiveStaff(identityIds: string[]): Promise<string[]> {
  const results = await Promise.all(
    identityIds.map(async (identityId) =>
      (await isIdentityRecentlyActive(identityId)) ? identityId : null,
    ),
  );
  return results.filter((id): id is string => id !== null);
}

export async function pickRoundRobinAssignee(
  identityIds: string[],
  pool: StaffPool,
): Promise<string | null> {
  if (identityIds.length === 0) return null;

  const sorted = [...identityIds].sort();
  const redisKey =
    pool === 'support_agent'
      ? RedisKeys.supportTicketAssignRoundRobinSupportAgent()
      : RedisKeys.supportTicketAssignRoundRobinFallback();

  let nextIndex = 0;

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const lastId = await redis.get(redisKey);
      if (lastId) {
        const lastIndex = sorted.indexOf(lastId);
        if (lastIndex >= 0) {
          nextIndex = (lastIndex + 1) % sorted.length;
        }
      }
      const picked = sorted[nextIndex]!;
      await redis.set(redisKey, picked);
      return picked;
    } catch (error) {
      elog.warn('Failed to update support ticket round-robin cursor', { pool, error });
    }
  }

  const lastFallbackIndex = fallbackRoundRobinCursor.get(pool) ?? -1;
  nextIndex = (lastFallbackIndex + 1) % sorted.length;
  fallbackRoundRobinCursor.set(pool, nextIndex);

  return sorted[nextIndex] ?? null;
}

async function notifyAllAdminsOfUnassignedTicket(ticket: SupportTicketDocument): Promise<void> {
  const identityRepo = getIdentityRepository();
  const admins = await identityRepo.findByPlatformRole(PLATFORM_ROLES.ADMIN);
  const ticketObjectId = ticket._id.toHexString();

  await Promise.all(
    admins.map(async (admin) => {
      const adminId = identityIdFromDoc(admin);
      try {
        await createNotification(adminId, 'support_ticket_new_unassigned', {
          ticketId: ticket.ticketId,
          ticketObjectId,
          title: ticket.title,
        });
      } catch (error) {
        elog.warn('Failed to notify admin of unassigned support ticket', {
          adminId,
          ticketId: ticket.ticketId,
          error,
        });
      }
    }),
  );
}

async function invokeAssignTicket(
  actorIdentityId: string,
  ticketObjectId: string,
  assigneeIdentityId: string,
  options: AssignTicketOptions,
) {
  const { assignTicket } = await import('./support-ticket.service');
  return assignTicket(actorIdentityId, ticketObjectId, assigneeIdentityId, options);
}

/**
 * Auto-assign a newly created ticket to recently active staff, or notify admins.
 */
export async function autoAssignNewTicket(ticket: SupportTicketDocument): Promise<void> {
  const identityRepo = getIdentityRepository();
  const staff = await identityRepo.findByAnyPlatformRole([
    PLATFORM_ROLES.SUPPORT_AGENT,
    PLATFORM_ROLES.MODERATOR,
    PLATFORM_ROLES.ADMIN,
  ]);

  const supportAgentIds: string[] = [];
  const fallbackIds: string[] = [];

  for (const member of staff) {
    const pool = classifyStaffPool(member);
    if (!pool) continue;
    const id = identityIdFromDoc(member);
    if (pool === 'support_agent') {
      supportAgentIds.push(id);
    } else {
      fallbackIds.push(id);
    }
  }

  const activeSupportAgents = await filterRecentlyActiveStaff(supportAgentIds);
  const assigneeFromSupportAgents = await pickRoundRobinAssignee(
    activeSupportAgents,
    'support_agent',
  );
  if (assigneeFromSupportAgents) {
    const result = await invokeAssignTicket('system', ticket._id.toHexString(), assigneeFromSupportAgents, {
      actorType: 'system',
      notifyAssignee: true,
      skipIfSameAssignee: false,
    });
    if (result.success) {
      return;
    }
    elog.warn('Auto-assign to support agent failed', {
      ticketId: ticket.ticketId,
      assignee: assigneeFromSupportAgents,
      error: result.error,
    });
  }

  const activeFallback = await filterRecentlyActiveStaff(fallbackIds);
  const assigneeFromFallback = await pickRoundRobinAssignee(activeFallback, 'fallback');
  if (assigneeFromFallback) {
    const result = await invokeAssignTicket('system', ticket._id.toHexString(), assigneeFromFallback, {
      actorType: 'system',
      notifyAssignee: true,
      skipIfSameAssignee: false,
    });
    if (result.success) {
      return;
    }
    elog.warn('Auto-assign to fallback staff failed', {
      ticketId: ticket.ticketId,
      assignee: assigneeFromFallback,
      error: result.error,
    });
  }

  await notifyAllAdminsOfUnassignedTicket(ticket);
}
