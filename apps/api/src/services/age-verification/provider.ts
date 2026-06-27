/**
 * Provider-agnostic age verification interface.
 *
 * Each provider implementation maps vendor-specific API shapes to
 * this common contract so the orchestration service and alias gate
 * remain vendor-independent.
 */

export type ProviderVerificationStatus =
  | 'started'
  | 'pending'
  | 'approved'
  | 'failed'
  | 'expired';

export interface StartVerificationResult {
  verificationId: string;
  status: ProviderVerificationStatus;
  /** Present when the user must complete interactive verification. */
  redirectUrl?: string;
}

export interface MethodAttemptInfo {
  enabled: boolean;
  maxAttempts: number;
  remaining: number;
}

export interface VerificationStatusResult {
  verificationId: string;
  status: ProviderVerificationStatus;
  approvalMethod?: string;
  threshold?: number;
  backgroundCheck?: string | null;
  createdAt?: string;
  expiresAt?: string;
  /** Per-method attempt tracking (provider-specific key -> attempt info). */
  methodAttempts?: Record<string, MethodAttemptInfo>;
}

export interface StartVerificationInput {
  redirectUrl: string;
  country: string;
  externalUserId: string;
  userInfo?: { email?: string; phone?: string };
  method?: string;
  /** Provider-specific business/settings identifier (e.g. per-jurisdiction for US states). */
  businessSettingsId?: string;
  webhookUrl?: string;
  webhookNotificationLevel?: 'minimal' | 'method-exhausted' | 'detailed';
}

export interface AgeVerificationProvider {
  readonly id: string;

  /**
   * Start a verification. When userInfo (email/phone) is provided,
   * the provider may perform a background check and return an immediate
   * approval. Otherwise (or on background-check failure) a redirect URL
   * is returned for interactive verification.
   */
  startVerification(input: StartVerificationInput): Promise<StartVerificationResult>;

  /** Poll the provider for the current status of a verification. */
  getVerificationStatus(verificationId: string): Promise<VerificationStatusResult>;
}
