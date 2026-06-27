/**
 * Jurisdiction regulatory reference data (from API, not user PII).
 */

/** Requirement slugs that imply age or ID verification is needed. */
export const AGE_VERIFICATION_REQUIREMENT_SLUGS = [
  'age_verification',
  'highly_effective_age_assurance',
  'appropriate_age_assurance',
  'reliable_age_and_identity_verification',
  'age_assurance',
] as const;

export type AgeVerificationRequirementSlug = (typeof AGE_VERIFICATION_REQUIREMENT_SLUGS)[number];

const AGE_VERIFICATION_REQUIREMENT_SLUG_SET = new Set<string>(AGE_VERIFICATION_REQUIREMENT_SLUGS);

/** Returns true when a requirement slug triggers age/ID verification enforcement. */
export function requirementImpliesAgeVerification(requirement: string): boolean {
  return AGE_VERIFICATION_REQUIREMENT_SLUG_SET.has(requirement);
}

export interface JurisdictionLegislationRef {
  name: string;
  url?: string;
  enactmentDate?: string;
  notes?: string;
}

export type JurisdictionRequirementStatus = 'enacted' | 'proposed';

export interface PublicJurisdictionRequirement {
  jurisdiction: string;
  jurisdictionName: string;
  region: string;
  requirements: string[];
  compatibleMethods: string[];
  regulatoryBody?: string;
  legislation: JurisdictionLegislationRef[];
  notes?: string;
  status: JurisdictionRequirementStatus;
}
