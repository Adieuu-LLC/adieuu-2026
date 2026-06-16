import type { PublicIdentity } from '@adieuu/shared';

/** Full API client (identity provider uses one instance with session-expiry handling). */
export type PlatformApiClient = ReturnType<
  typeof import('@adieuu/shared').createApiClient
>;

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
  errorCode?: 'INVALID_PASSPHRASE' | 'NO_SESSION' | 'DEVICE_REGISTRATION_FAILED';
}

export interface CreateIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?:
    | 'USERNAME_TAKEN'
    | 'MAX_IDENTITIES'
    | 'VALIDATION_ERROR'
    | 'E2E_INIT_FAILED'
    | 'PAYLOAD_TOO_LARGE'
    | 'GEOFENCE_BLOCKED'
    | 'AGE_VERIFICATION_REQUIRED'
    | 'AGE_VERIFICATION_FAILED'
    | 'AGE_VERIFICATION_COOLDOWN';
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
    | 'IDENTITY_BANNED'
    | 'GEOFENCE_BLOCKED'
    | 'AGE_VERIFICATION_REQUIRED'
    | 'AGE_VERIFICATION_FAILED'
    | 'AGE_VERIFICATION_COOLDOWN';
  attemptNumber?: number;
  retryAfter?: number;
  isNewDevice?: boolean;
  deviceName?: string;
  suspensionInfo?: SuspensionInfo;
}

export type WebDeviceChoice = 'shared' | 'individual';

/**
 * Context supplied to a migration prompt handler when a remote passphrase
 * change is detected on another device and local keys must be re-wrapped.
 */
export interface MigrationPromptContext {
  identityId: string;
  /** ISO timestamp of the server-side passphrase change, if known. */
  passphraseChangedAt?: string | null;
  /** How many re-wrap attempts have already been made (0 on first prompt). */
  attempt: number;
  /** Why the previous attempt failed, if any. */
  lastError?: 'wrong-passphrase' | 'failed';
}

/**
 * Result returned by a migration prompt handler.
 * - `migrate`: re-wrap local keys using the supplied old passphrase.
 * - `skip`: opt out and fall back to deleting + regenerating device keys
 *   (historical messages encrypted to the old device keys become unreadable).
 */
export type MigrationPromptResult =
  | { action: 'migrate'; oldPassphrase: string }
  | { action: 'skip' };

export type MigrationPromptHandler = (
  ctx: MigrationPromptContext
) => Promise<MigrationPromptResult>;

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
  /**
   * Invoked when a remote passphrase change is detected and local device keys
   * can no longer be decrypted. Lets the user supply their old passphrase to
   * re-wrap local material instead of losing message history.
   */
  onMigrationPrompt?: MigrationPromptHandler;
}

export interface UnlockIdentityOptions {
  /** See {@link LoginIdentityOptions.onMigrationPrompt}. */
  onMigrationPrompt?: MigrationPromptHandler;
}

export interface IdentityContextValue extends IdentityState {
  /** Shared API client; use for requests that must honor identity session expiry. */
  api: PlatformApiClient;
  createIdentity: (
    passphrase: string,
    username: string,
    displayName: string
  ) => Promise<CreateIdentityResult>;
  loginToIdentity: (
    passphrase: string,
    options?: LoginIdentityOptions
  ) => Promise<LoginIdentityResult>;
  unlockIdentity: (
    passphrase: string,
    options?: UnlockIdentityOptions
  ) => Promise<UnlockIdentityResult>;
  logoutFromIdentity: () => Promise<void>;
  deleteIdentity: () => Promise<{ success: boolean; error?: string }>;
  refreshIdentitySession: () => Promise<void>;
  clearSuspension: () => void;
  getWrappingKey: () => Uint8Array | null;
  getWrappingSalt: () => Uint8Array | null;
  getSigningKey: () => Uint8Array | null;
  getCurrentDeviceId: () => string | null;
  /**
   * Replaces the in-memory wrapping key for the active identity. Used after a
   * passphrase change re-wraps local material so the live session keeps using
   * the correct key without requiring a re-login. The previous key is zeroed.
   */
  updateWrappingKey: (newWrappingKey: Uint8Array) => void;
}
