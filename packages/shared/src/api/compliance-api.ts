import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export type VpnAttestationStep = 'sanctioned_membership' | 'utah_residency';
export type VpnAttestationAnswer = 'yes' | 'no';

export interface VpnAttestationParams {
  step: VpnAttestationStep;
  answer: VpnAttestationAnswer;
}

export interface VpnAttestationResponse {
  next?: 'utah_notice' | 'continue';
}

export class ComplianceApi {
  constructor(private client: HttpClient) {}

  async submitVpnAttestation(params: VpnAttestationParams): Promise<ApiResponse<VpnAttestationResponse>> {
    return this.client.post('/api/compliance/vpn-attestation', params);
  }
}
