/**
 * Public jurisdiction requirement lookups (account session only).
 */

import type { RouteContext } from '../../router/types';
import { success } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import elog from '../../utils/adieuuLogger';
import { requireAccountSession } from '../../services/session.service';
import { getJurisdictionRequirementRepository } from '../../repositories/jurisdiction-requirement.repository';
import {
  toPublicJurisdictionRequirement,
  type PublicJurisdictionRequirement,
} from '../../models/jurisdiction-requirement';

/** Maximum distinct jurisdiction codes accepted per query (protects oversized `$in` queries). */
export const MAX_JURISDICTION_QUERY_CODES = 100;

/**
 * Parses comma-separated jurisdiction codes from a query param: sanitizes the raw string,
 * then each segment with `alphanumdash` (matches seeded codes like US-TN, EU, CA-PROPOSED).
 */
export function parseSanitizedJurisdictionCodes(param: string | null): string[] {
  const { value: rawClean, deltas } = sanitizeString(param ?? '', 'general');
  if (deltas > 0) {
    elog.warn('Jurisdiction query sanitization modified input', { deltas });
  }

  if (!rawClean.trim()) return [];

  const out: string[] = [];
  for (const segment of rawClean.split(',')) {
    const { value: cleaned } = sanitizeString(segment.trim(), 'alphanumdash');
    const code = cleaned.toUpperCase();
    if (code) out.push(code);
  }
  return out;
}

function jurisdictionQueryRaw(ctx: RouteContext): string | null {
  return ctx.query.get('jurisdictions') ?? ctx.query.get('jurisdiction');
}

/**
 * GET `/geo/requirements` — jurisdiction regulatory rows for the authenticated account session.
 */
export async function getJurisdictionRequirementsCtrl(
  ctx: RouteContext,
): Promise<Response> {
  const session = await requireAccountSession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }

  const codes = parseSanitizedJurisdictionCodes(jurisdictionQueryRaw(ctx));

  if (new Set(codes).size > MAX_JURISDICTION_QUERY_CODES) {
    return ctx.errors.validationFailed();
  }

  if (codes.length === 0) {
    return success([]);
  }

  const data = await getJurisdictionRequirementsByCodes(codes);
  return success(data);
}

/**
 * Returns regulatory rows for the given jurisdiction codes (e.g. US-TN, EU, FR).
 * Unknown codes are omitted (empty array element positions not preserved).
 */
export async function getJurisdictionRequirementsByCodes(
  rawCodes: string[],
): Promise<PublicJurisdictionRequirement[]> {
  const repo = getJurisdictionRequirementRepository();
  const docs = await repo.findByJurisdictions(rawCodes);
  return docs.map(toPublicJurisdictionRequirement);
}
