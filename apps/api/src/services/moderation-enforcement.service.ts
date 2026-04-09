/**
 * Moderation enforcement — executes actions from report resolution.
 *
 * Each enforcement action is recorded to the report event timeline.
 * Failures are caught and logged but do not prevent the resolution from
 * being persisted (partial enforcement is auditable).
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getSessionRepository } from '../repositories/session.repository';
import { getE2EMediaRepository } from '../repositories/e2e-media.repository';
import { getReportEventRepository } from '../repositories/report-event.repository';
import { deleteE2EMedia } from './e2e-upload.service';
import elog from '../utils/adieuuLogger';

export interface EnforcementActions {
  removeContent: boolean;
  warnUser: boolean;
  suspendAliasMs: number;
  banAlias: boolean;
}

export interface EnforcementContext {
  reportId: ObjectId;
  targetIdentityId?: string;
  targetRef: { type: string; id: string };
  actorIdentityId: string;
  reason: string;
}

export async function executeEnforcement(
  actions: EnforcementActions,
  ctx: EnforcementContext,
): Promise<void> {
  const eventRepo = getReportEventRepository();

  if (ctx.targetRef.type === 'e2e_media') {
    try {
      const e2eRepo = getE2EMediaRepository();
      await e2eRepo.updateById(ctx.targetRef.id, {
        moderationReason: ctx.reason,
      });
    } catch (err) {
      elog.error('Enforcement: failed to update e2e_media moderationReason', { err, ctx });
    }
  }

  if (actions.removeContent) {
    try {
      const removed = await removeContent(ctx.targetRef);
      await eventRepo.createEvent({
        reportId: ctx.reportId,
        eventType: 'enforcement_action',
        actorUserId: ctx.actorUserId,
        body: removed
          ? `Content removed (${ctx.targetRef.type}:${ctx.targetRef.id})`
          : `Content removal skipped — not found or unsupported type`,
        metadata: { action: 'remove_content', targetRef: ctx.targetRef, success: removed },
      });
    } catch (err) {
      elog.error('Enforcement: content removal failed', { err, ctx });
      await eventRepo.createEvent({
        reportId: ctx.reportId,
        eventType: 'enforcement_action',
        actorUserId: ctx.actorUserId,
        body: 'Content removal failed',
        metadata: { action: 'remove_content', error: String(err) },
      });
    }
  }

  if (ctx.targetIdentityId) {
    const identityRepo = getIdentityRepository();

    if (actions.warnUser) {
      try {
        await identityRepo.updateById(ctx.targetIdentityId, {
          moderationReason: ctx.reason,
          moderationReportId: ctx.reportId.toHexString(),
        });
        await eventRepo.createEvent({
          reportId: ctx.reportId,
          eventType: 'enforcement_action',
          actorUserId: ctx.actorUserId,
          body: `Warning issued to identity ${ctx.targetIdentityId}`,
          metadata: { action: 'warn', identityId: ctx.targetIdentityId },
        });
      } catch (err) {
        elog.error('Enforcement: warn failed', { err, ctx });
      }
    }

    if (actions.suspendAliasMs > 0) {
      try {
        const until = new Date(Date.now() + actions.suspendAliasMs);
        await identityRepo.updateById(ctx.targetIdentityId, {
          suspendedUntil: until,
          moderationReason: ctx.reason,
          moderationReportId: ctx.reportId.toHexString(),
        });

        const identitySessionRepo = getIdentitySessionRepository();
        const revokedCount = await identitySessionRepo.revokeAllForIdentity(ctx.targetIdentityId);
        elog.info('Enforcement: revoked identity sessions on suspend', {
          identityId: ctx.targetIdentityId,
          revokedCount,
        });

        await eventRepo.createEvent({
          reportId: ctx.reportId,
          eventType: 'enforcement_action',
          actorUserId: ctx.actorUserId,
          body: `Identity ${ctx.targetIdentityId} suspended until ${until.toISOString()}`,
          metadata: { action: 'suspend', identityId: ctx.targetIdentityId, until: until.toISOString(), durationMs: actions.suspendAliasMs, sessionsRevoked: revokedCount },
        });
      } catch (err) {
        elog.error('Enforcement: suspend failed', { err, ctx });
      }
    }

    if (actions.banAlias) {
      try {
        await identityRepo.updateById(ctx.targetIdentityId, {
          isBanned: true,
          moderationReason: ctx.reason,
          moderationReportId: ctx.reportId.toHexString(),
        });

        const identitySessionRepo = getIdentitySessionRepository();
        const revokedCount = await identitySessionRepo.revokeAllForIdentity(ctx.targetIdentityId);
        elog.info('Enforcement: revoked identity sessions on ban', {
          identityId: ctx.targetIdentityId,
          revokedCount,
        });

        await eventRepo.createEvent({
          reportId: ctx.reportId,
          eventType: 'enforcement_action',
          actorUserId: ctx.actorUserId,
          body: `Identity ${ctx.targetIdentityId} permanently banned`,
          metadata: { action: 'ban', identityId: ctx.targetIdentityId, sessionsRevoked: revokedCount },
        });
      } catch (err) {
        elog.error('Enforcement: ban failed', { err, ctx });
      }
    }
  }
}

async function removeContent(targetRef: { type: string; id: string }): Promise<boolean> {
  switch (targetRef.type) {
    case 'e2e_media':
      return await deleteE2EMedia(targetRef.id);
    case 'media_upload':
      // Regular media uploads are already deleted from S3 by the processor on rejection.
      // The DB record is updated to 'rejected' by the db-writer Lambda.
      return true;
    default:
      elog.warn('Unsupported target type for content removal', { targetRef });
      return false;
  }
}
