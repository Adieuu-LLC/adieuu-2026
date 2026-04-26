/**
 * Jurisdiction regulatory reference data (from API, not user PII).
 */

export interface JurisdictionLegislationRef {
  name: string;
  url?: string;
  enactmentDate?: string;
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
