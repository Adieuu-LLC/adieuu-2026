import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { PublicJurisdictionRequirement } from '../geo/jurisdiction-types';

export class GeoApi {
  constructor(private client: HttpClient) {}

  /**
   * Returns regulatory reference rows for the given jurisdiction codes
   * (e.g. US-TN, EU, FR). Account session required.
   */
  async getJurisdictionRequirements(
    jurisdictions: string[],
  ): Promise<ApiResponse<PublicJurisdictionRequirement[]>> {
    const q = jurisdictions.map((c) => c.trim()).filter(Boolean).join(',');
    if (!q) {
      return { success: true, data: [] };
    }
    return this.client.get(
      `/api/geo/requirements?jurisdictions=${encodeURIComponent(q)}`,
    );
  }

  /**
   * Returns all seeded jurisdictions that require age/ID verification (public, no session).
   */
  async getJurisdictionRequirementsCatalog(): Promise<
    ApiResponse<PublicJurisdictionRequirement[]>
  > {
    return this.client.get('/api/geo/requirements/catalog');
  }
}
