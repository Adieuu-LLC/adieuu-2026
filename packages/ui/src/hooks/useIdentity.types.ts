import type { PublicIdentity } from '@adieuu/shared';

/**
 * Identity session status:
 * - `loading`: Initial state, checking session
 * - `logged_in`: Fully authenticated with wrapping key available
 * - `locked`: Server session valid but wrapping key not available (needs passphrase)
 * - `logged_out`: No active identity session
 * - `no_identity`: User has no identity created yet
 * - `suspended`: Identity is suspended or banned by moderation
 */
export type IdentityStatus =
  | 'loading'
  | 'logged_in'
  | 'locked'
  | 'logged_out'
  | 'no_identity'
  | 'suspended';

/**
 * Moderation suspension details surfaced to the UI.
 */
export interface SuspensionInfo {
  type: 'suspended' | 'banned';
  reason?: string;
  reportId?: string;
  suspendedUntil?: string;
}

export interface IdentityState {
  status: IdentityStatus;
  identity: PublicIdentity | null;
  hasIdentity: boolean;
  identityCount: number;
  maxIdentities: number;
  canCreateMore: boolean;
  suspensionInfo?: SuspensionInfo;
}

export interface UnlockIdentityResult {
  success: boolean;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'NO_SESSION';
}

export interface CreateIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  backupCodes?: string[];
  error?: string;
  errorCode?:
    | 'USERNAME_TAKEN'
    | 'MAX_IDENTITIES'
    | 'VALIDATION_ERROR'
    | 'E2E_INIT_FAILED'
    | 'PAYLOAD_TOO_LARGE';
}

export interface LoginIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?:
    | 'INVALID_PASSPHRASE'
    | 'LOCKED_OUT'
    | 'RATE_LIMITED'
    | 'KEY_DERIVATION_FAILED'
    | 'E2E_SETUP_FAILED'
    | 'BUNDLE_DECRYPT_FAILED'
    | 'KEY_GENERATION_FAILED'
    | 'DEVICE_REGISTRATION_FAILED'
    | 'IDENTITY_SUSPENDED'
    | 'IDENTITY_BANNED';
  attemptNumber?: number;
  retryAfter?: number;
  isNewDevice?: boolean;
  deviceName?: string;
  suspensionInfo?: SuspensionInfo;
}

export type WebDeviceChoice = 'shared' | 'individual';

export type LoginStatus =
  | 'authenticating'
  | 'deriving_keys'
  | 'loading_device'
  | 'decrypting_bundle'
  | 'web_device_choice'
  | 'generating_keys'
  | 'registering_device'
  | 'complete';

export interface LoginIdentityOptions {
  onStatusChange?: (status: LoginStatus) => void;
  onWebDeviceChoice?: () => Promise<WebDeviceChoice>;
}

export interface IdentityContextValue extends IdentityState {
  createIdentity: (
    passphrase: string,
    username: string,
    displayName: string
  ) => Promise<CreateIdentityResult>;
  loginToIdentity: (
    passphrase: string,
    options?: LoginIdentityOptions
  ) => Promise<LoginIdentityResult>;
  unlockIdentity: (passphrase: string) => Promise<UnlockIdentityResult>;
  logoutFromIdentity: () => Promise<void>;
  deleteIdentity: () => Promise<{ success: boolean; error?: string }>;
  refreshIdentitySession: () => Promise<void>;
  clearSuspension: () => void;
  getWrappingKey: () => Uint8Array | null;
  getWrappingSalt: () => Uint8Array | null;
  getSigningKey: () => Uint8Array | null;
  getCurrentDeviceId: () => string | null;
}
