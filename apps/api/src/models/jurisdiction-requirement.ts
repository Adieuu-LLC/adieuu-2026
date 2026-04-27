/**
 * Jurisdiction-based regulatory requirements (e.g. age verification obligations).
 * Data is loaded from a seed script; not user-specific.
 */

import type { BaseDocument } from './base';

/** A statute, regulation, or other legal instrument reference */
export interface LegislationRef {
  name: string;
  url?: string;
  /** Human-readable, e.g. "1st October 2024" */
  enactmentDate?: string;
  /** Optional supplementary notes displayed alongside the legislation entry */
  notes?: string;
}

export type JurisdictionRequirementStatus = 'enacted' | 'proposed';

/**
 * Public subset safe for account-session API responses
 */
export interface PublicJurisdictionRequirement {
  jurisdiction: string;
  jurisdictionName: string;
  region: string;
  requirements: string[];
  compatibleMethods: string[];
  regulatoryBody?: string;
  legislation: LegislationRef[];
  notes?: string;
  status: JurisdictionRequirementStatus;
}

/**
 * One row per canonical jurisdiction code (e.g. US-AL, GB, EU).
 */
export interface JurisdictionRequirementDocument extends BaseDocument {
  /** Canonical code matching UserGeo.jurisdiction (e.g. US-TN, GB, EU) */
  jurisdiction: string;
  /** Human-readable name for UI */
  jurisdictionName: string;
  /** High-level region grouping (e.g. "United States", "European Union") */
  region: string;
  /** Normalized requirement slugs, e.g. age_verification */
  requirements: string[];
  /** Methods the platform or vendors may use to satisfy requirements */
  compatibleMethods: string[];
  /** Regulator or enforcement body */
  regulatoryBody?: string;
  /** One or more laws / rules with optional links */
  legislation: LegislationRef[];
  /** Free-form context from the compliance matrix */
  notes?: string;
  status: JurisdictionRequirementStatus;
}

export function toPublicJurisdictionRequirement(
  doc: JurisdictionRequirementDocument,
): PublicJurisdictionRequirement {
  return {
    jurisdiction: doc.jurisdiction,
    jurisdictionName: doc.jurisdictionName,
    region: doc.region,
    requirements: doc.requirements,
    compatibleMethods: doc.compatibleMethods,
    regulatoryBody: doc.regulatoryBody,
    legislation: doc.legislation,
    notes: doc.notes,
    status: doc.status,
  };
}
