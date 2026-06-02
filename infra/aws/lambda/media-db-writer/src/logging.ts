/**
 * Structured JSON logs for CloudWatch (one JSON object per line).
 * Avoid PII beyond opaque IDs already used in moderation workflows.
 */

export interface ModerationReportLogFields {
  event: string;
  mediaId?: string;
  scanHash?: string;
  status?: string;
  rejectionReason?: string;
  idempotencyKey?: string;
  reportAction?: 'created' | 'deduped_skip' | 'error';
  reportId?: string;
  targetRefType?: string;
  targetRefId?: string;
  targetIdentityId?: string;
  identityId?: string;
  category?: string;
  errorName?: string;
  errorMessage?: string;
  e2eMatched?: boolean;
  matchCount?: number;
  totalMatches?: number;
  sources?: string[];
  enabledServices?: string[];
  entitlement?: string;
}

export function logModerationEvent(fields: ModerationReportLogFields): void {
  console.log(JSON.stringify({ ...fields, source: 'media-db-writer' }));
}
