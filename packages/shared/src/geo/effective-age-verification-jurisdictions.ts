import type { PublicJurisdictionRequirement } from './jurisdiction-types';

export type AvJurisdictionSource = 'regulatory' | 'admin';

export interface EffectiveAvJurisdiction {
  jurisdiction: string;
  jurisdictionName: string;
  region: string;
  source: AvJurisdictionSource;
}

const ADMIN_OVERRIDE_REGION = 'Admin overrides';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Merges regulatory catalog rows with admin override jurisdictions into the
 * effective age-verification jurisdiction list (deduped, sorted).
 */
export function mergeEffectiveAvJurisdictions(
  catalog: PublicJurisdictionRequirement[],
  adminOverrides: string[],
  enrichedOverrides: PublicJurisdictionRequirement[] = [],
): EffectiveAvJurisdiction[] {
  const byCode = new Map<string, EffectiveAvJurisdiction>();

  for (const row of catalog) {
    const jurisdiction = normalizeCode(row.jurisdiction);
    byCode.set(jurisdiction, {
      jurisdiction,
      jurisdictionName: row.jurisdictionName,
      region: row.region,
      source: 'regulatory',
    });
  }

  const enrichedByCode = new Map(
    enrichedOverrides.map((row) => [normalizeCode(row.jurisdiction), row]),
  );

  for (const raw of adminOverrides) {
    const jurisdiction = normalizeCode(raw);
    if (!jurisdiction || byCode.has(jurisdiction)) continue;

    const enriched = enrichedByCode.get(jurisdiction);
    byCode.set(jurisdiction, {
      jurisdiction,
      jurisdictionName: enriched?.jurisdictionName ?? jurisdiction,
      region: enriched?.region ?? ADMIN_OVERRIDE_REGION,
      source: 'admin',
    });
  }

  return [...byCode.values()].sort((a, b) => {
    const regionCompare = a.region.localeCompare(b.region);
    if (regionCompare !== 0) return regionCompare;
    return a.jurisdictionName.localeCompare(b.jurisdictionName);
  });
}
