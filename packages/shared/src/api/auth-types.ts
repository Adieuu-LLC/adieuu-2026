/**
 * Auth-related request/response types shared with Users API.
 */

export interface RequestOtpParams {
  identifier: string;
  type: 'email' | 'sms';
}

export interface VerifyOtpParams {
  identifier: string;
  code: string;
}

/**
 * Response from OTP verification.
 * May indicate MFA is required.
 */
export interface VerifyOtpResponse {
  /** If true, MFA verification is required before session is created */
  mfaRequired?: boolean;
  /** Token to use for MFA verification (only if mfaRequired) */
  mfaToken?: string;
  /** Available MFA options */
  mfaOptions?: {
    totp: boolean;
    webauthn: boolean;
  };
  /** WebAuthn challenge options (only if webauthn is available) */
  webauthnChallenge?: PublicKeyCredentialRequestOptionsJSON;
}

/**
 * PublicKeyCredentialRequestOptionsJSON from WebAuthn
 */
export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
  userVerification?: 'discouraged' | 'preferred' | 'required';
}

/**
 * Session info returned from /auth/session endpoint.
 * Note: The actual session token is stored in HTTP-only cookies,
 * not exposed to JavaScript.
 */
export interface SessionInfo {
  /** Present in account mode */
  identifier?: string;
  /** Present in account mode */
  identifierType?: 'email' | 'phone';
  /** Number of identities the user has created (account mode) */
  identityCount?: number;
  /** Maximum number of identities allowed (account mode) */
  maxIdentities?: number;
  /**
   * Short-lived HS256 JWT for bridging account→identity transitions.
   * Refreshed on every GET /api/auth/session call. Present in account mode.
   */
  signedToken?: string;
  /** Whether this identity can access platform admin APIs and UI (identity mode) */
  isPlatformAdmin: boolean;
  /** Whether this identity can access the platform moderation panel (identity mode) */
  isPlatformModerator: boolean;
  /** Effective platform-level permissions for the current identity (identity mode) */
  platformPermissions: string[];
  /** IP-derived jurisdiction (account mode only, omits ipHash for privacy). */
  geo?: SessionGeoInfo;
}

/**
 * Subset of the server-side UserGeo exposed to the client.
 * Never includes ipHash or raw IP.
 */
export interface SessionGeoInfo {
  jurisdiction: string;
  countryCode: string;
  regionCode?: string;
  checkedAt: string;
}

/**
 * Detailed session info for session management.
 */
export interface SessionDetails {
  /** Session ID (for revocation) */
  id: string;
  /** User identifier (email or phone) */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** User agent (browser/device info) */
  userAgent?: string;
  /** IP address (partially masked for privacy) */
  ipAddress?: string;
  /** Whether this is the current session */
  isCurrent?: boolean;
}

/**
 * Response from revoking sessions.
 */
export interface RevokeSessionsResponse {
  revokedCount: number;
}

/**
 * Avatar data for rendering deterministic avatars.
 */
export interface AvatarInfo {
  /** Background color (hex) */
  backgroundColor: string;
  /** Skin tone color (hex) */
  skinColor: string;
  /** Hair color (hex) */
  hairColor: string;
  /** Hair style index (0-4) */
  hairStyle: number;
  /** Face shape index (0-3) */
  faceShape: number;
  /** Eye style index (0-3) */
  eyeStyle: number;
  /** Accessory index (0-3, 0 = none) */
  accessory: number;
  /** Facial hair index (0-4, 0 = none) */
  facialHair: number;
  /** Hash used to generate the avatar */
  hash: string;
}

/**
 * User profile returned from /users/me endpoint.
 */
export interface UserProfile {
  id: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
  avatar?: AvatarInfo;
}

/**
 * @deprecated Use SessionInfo instead - sessions are now cookie-based
 */
export interface AuthSession {
  accessToken: string;
  expiresIn: number;
}
