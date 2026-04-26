/**
 * Public jurisdiction requirement lookups (account session only).
 */

import { getJurisdictionRequirementRepository } from '../../repositories/jurisdiction-requirement.repository';
import {
  toPublicJurisdictionRequirement,
  type PublicJurisdictionRequirement,
} from '../../models/jurisdiction-requirement';

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
