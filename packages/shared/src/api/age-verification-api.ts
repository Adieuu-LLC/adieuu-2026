import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { AgeVerificationDetails } from './auth-types';

export class AgeVerificationApi {
  constructor(private client: HttpClient) {}

  /**
   * Returns the latest age verification attempt for the current account session,
   * or null if no attempt exists. Account session required.
   */
  async getCurrent(): Promise<ApiResponse<AgeVerificationDetails | null>> {
    return this.client.get('/api/age-verification/current');
  }
}
