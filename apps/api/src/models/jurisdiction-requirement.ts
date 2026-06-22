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

/** Provider-specific configuration for age verification in this jurisdiction. */
export interface VerificationConfig {
  /** VerifyMy business settings ID (required per-jurisdiction for US states). */
  vmyBusinessSettingsId?: string;
}

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
  verificationConfig?: VerificationConfig;
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
  verificationConfig?: VerificationConfig;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Reads VerifyMy business settings ID from canonical or legacy document shapes.
 * Supports nested `verificationConfig.vmyBusinessSettingsId` and a legacy
 * top-level `vmyBusinessSettingsId` field from manual DB edits.
 */
export function extractVerificationConfig(
  doc: JurisdictionRequirementDocument,
): VerificationConfig | undefined {
  const nestedId = readOptionalTrimmedString(doc.verificationConfig?.vmyBusinessSettingsId);
  if (nestedId) {
    return { vmyBusinessSettingsId: nestedId };
  }

  const legacyRecord = doc as JurisdictionRequirementDocument & {
    vmyBusinessSettingsId?: unknown;
  };
  const legacyId = readOptionalTrimmedString(legacyRecord.vmyBusinessSettingsId);
  if (legacyId) {
    return { vmyBusinessSettingsId: legacyId };
  }

  return undefined;
}

/** Admin view includes provider configuration and timestamps. */
export interface AdminJurisdictionRequirement {
  jurisdiction: string;
  jurisdictionName: string;
  region: string;
  status: JurisdictionRequirementStatus;
  verificationConfig?: VerificationConfig;
  updatedAt: string;
  createdAt: string;
}

export function toAdminJurisdictionRequirement(
  doc: JurisdictionRequirementDocument,
): AdminJurisdictionRequirement {
  return {
    jurisdiction: doc.jurisdiction,
    jurisdictionName: doc.jurisdictionName,
    region: doc.region,
    status: doc.status,
    verificationConfig: extractVerificationConfig(doc),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
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
    verificationConfig: doc.verificationConfig,
  };
}

/** Client-safe shape (omits internal provider configuration). */
export function toClientJurisdictionRequirement(
  doc: JurisdictionRequirementDocument,
): Omit<PublicJurisdictionRequirement, 'verificationConfig'> {
  const { verificationConfig: _omit, ...rest } = toPublicJurisdictionRequirement(doc);
  return rest;
}
