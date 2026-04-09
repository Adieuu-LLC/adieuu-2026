/**
 * Report event model — timeline entries for a platform report.
 *
 * Covers state transitions, internal/public comments, and enforcement
 * action audit records.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export const REPORT_EVENT_TYPES = [
  'status_change',
  'comment_internal',
  'comment_public',
  'assignment_change',
  'category_change',
  'enforcement_action',
] as const;
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];

export interface ReportEventDocument extends BaseDocument {
  /** The report this event belongs to */
  reportId: ObjectId;

  eventType: ReportEventType;

  /** Identity ID of the actor (moderator/admin/system) */
  actorIdentityId: string;

  /** Human-readable body (comment text, reason, etc.) */
  body?: string;

  /** Structured metadata for the event (old/new values, enforcement details) */
  metadata?: Record<string, unknown>;
}

export interface CreateReportEventInput {
  reportId: ObjectId;
  eventType: ReportEventType;
  actorIdentityId: string;
  body?: string;
  metadata?: Record<string, unknown>;
}
