/**
 * Session model
 * Represents an authenticated session stored in MongoDB.
 *
 * Unified model for both account and identity sessions. The `type` discriminator
 * determines which fields are present and which routes accept the session.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { SubscriptionTierId } from '@adieuu/shared';

/** Session type discriminator */
export type SessionType = 'account' | 'identity';

/**
 * Session document stored in MongoDB (source of truth)
 */
export interface SessionDocument extends BaseDocument {
  /** Unique session identifier (used in cookie) */
  sessionId: string;

  /** Discriminator: determines which routes accept this session */
  type: SessionType;

  // -- Account-type fields --------------------------------------------------

  /** Reference to the user document (account sessions only) */
  userId?: ObjectId;

  /** User identifier (email or phone) for display purposes (account sessions only) */
  identifier?: string;

  /** Identifier type (account sessions only) */
  identifierType?: 'email' | 'phone';

  // -- Identity-type fields -------------------------------------------------

  /** Reference to the identity document (identity sessions only) */
  identityId?: ObjectId;

  /**
   * Effective max video duration (seconds) bound from the account bridging token
   * at identity login. Identity routes use this without loading User.
   */
  maxVideoDurationSeconds?: number;

  /** Active subscription tier ids bound from the account bridging token (identity sessions only). */
  subscriptions?: SubscriptionTierId[];

  /** Feature entitlements bound from the account bridging token (identity sessions only). */
  entitlements?: string[];

  // -- Common fields --------------------------------------------------------

  /** Session expiration timestamp */
  expiresAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** User agent string for security logging */
  userAgent?: string;

  /** IP address for security logging */
  ipAddress?: string;

  /** Whether the session has been explicitly revoked */
  revoked: boolean;
}

/**
 * Input for creating an account-type session.
 */
export interface CreateAccountSessionInput {
  sessionId: string;
  type: 'account';
  userId: ObjectId;
  identifier: string;
  identifierType: 'email' | 'phone';
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Input for creating an identity-type session.
 */
export interface CreateIdentitySessionInput {
  sessionId: string;
  type: 'identity';
  identityId: ObjectId;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  maxVideoDurationSeconds?: number;
  subscriptions?: SubscriptionTierId[];
  entitlements?: string[];
}

/**
 * Union of all session creation inputs.
 */
export type CreateSessionInput = CreateAccountSessionInput | CreateIdentitySessionInput;

/**
 * Session data for Redis cache (lightweight version)
 */
export interface CachedSessionData {
  /** Session type discriminator */
  type: SessionType;
  /** User ID as hex string (account sessions only) */
  userId?: string;
  /** User identifier (email or phone) (account sessions only) */
  identifier?: string;
  /** Identifier type (account sessions only) */
  identifierType?: 'email' | 'phone';
  /** Identity ID as hex string (identity sessions only) */
  identityId?: string;
  /** Effective max video duration (seconds), identity sessions only */
  maxVideoDurationSeconds?: number;
  /** Active subscription tier ids (identity sessions only) */
  subscriptions?: SubscriptionTierId[];
  /** Feature entitlements (identity sessions only) */
  entitlements?: string[];
  /** Session expiration timestamp (ms) */
  expiresAt: number;
  /** Last activity timestamp (ms) */
  lastActivityAt: number;
}

/**
 * Public session representation (safe to send to client)
 */
export interface PublicSession {
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
 * Mask IP address for privacy (show first two octets only)
 * e.g., "192.168.1.100" -> "192.168.*.*"
 */
export function maskIpAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 or other format - just show first part
  return ip.split(':').slice(0, 2).join(':') + ':*';
}

/**
 * Convert a SessionDocument to PublicSession (safe for client).
 * Only meaningful for account-type sessions.
 */
export function toPublicSession(
  doc: SessionDocument,
  currentSessionId?: string
): PublicSession {
  return {
    id: doc.sessionId,
    identifier: doc.identifier ?? '',
    identifierType: doc.identifierType ?? 'email',
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
    userAgent: doc.userAgent,
    ipAddress: maskIpAddress(doc.ipAddress),
    isCurrent: currentSessionId ? doc.sessionId === currentSessionId : undefined,
  };
}

/**
 * Public identity session representation (safe to send to client)
 */
export interface PublicIdentitySession {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  userAgent?: string;
  ipAddress?: string;
  isCurrent?: boolean;
}

/**
 * Convert a SessionDocument (identity-type) to PublicIdentitySession
 */
export function toPublicIdentitySession(
  doc: SessionDocument,
  currentSessionId?: string
): PublicIdentitySession {
  return {
    id: doc.sessionId,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
    userAgent: doc.userAgent,
    ipAddress: maskIpAddress(doc.ipAddress),
    isCurrent: currentSessionId ? doc.sessionId === currentSessionId : undefined,
  };
}

/**
 * Convert a SessionDocument to CachedSessionData (for Redis)
 */
export function toCachedSession(doc: SessionDocument): CachedSessionData {
  const base: CachedSessionData = {
    type: doc.type,
    expiresAt: doc.expiresAt.getTime(),
    lastActivityAt: doc.lastActivityAt.getTime(),
  };

  if (doc.type === 'account') {
    base.userId = doc.userId?.toHexString();
    base.identifier = doc.identifier;
    base.identifierType = doc.identifierType;
  } else {
    base.identityId = doc.identityId?.toHexString();
    if (doc.maxVideoDurationSeconds !== undefined) {
      base.maxVideoDurationSeconds = doc.maxVideoDurationSeconds;
    }
    if (doc.subscriptions) {
      base.subscriptions = doc.subscriptions;
    }
    if (doc.entitlements) {
      base.entitlements = doc.entitlements;
    }
  }

  return base;
}
