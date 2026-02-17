/**
 * Identity Session model
 * Represents an authenticated identity session stored in MongoDB
 *
 * SECURITY NOTE: Identity sessions are intentionally NOT linked to user sessions.
 * Both sessions must be valid for identity-protected routes, but they cannot
 * be correlated in the database to maintain user-identity unlinkability.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Identity session document stored in MongoDB
 */
export interface IdentitySessionDocument extends BaseDocument {
  /** Unique session identifier (used in cookie) */
  identitySessionId: string;

  /** Reference to the identity document */
  identityId: ObjectId;

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
 * Identity session creation input
 */
export interface CreateIdentitySessionInput {
  identitySessionId: string;
  identityId: ObjectId;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Identity session data for Redis cache
 */
export interface CachedIdentitySessionData {
  /** Identity ID as hex string */
  identityId: string;
  /** Session expiration timestamp (ms) */
  expiresAt: number;
  /** Last activity timestamp (ms) */
  lastActivityAt: number;
}

/**
 * Public identity session representation (safe to send to client)
 */
export interface PublicIdentitySession {
  /** Session ID (for revocation) */
  id: string;
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
 */
function maskIpAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 or other format - just show first part
  return ip.split(':').slice(0, 2).join(':') + ':*';
}

/**
 * Convert an IdentitySessionDocument to PublicIdentitySession (safe for client)
 */
export function toPublicIdentitySession(
  doc: IdentitySessionDocument,
  currentSessionId?: string
): PublicIdentitySession {
  return {
    id: doc.identitySessionId,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
    userAgent: doc.userAgent,
    ipAddress: maskIpAddress(doc.ipAddress),
    isCurrent: currentSessionId ? doc.identitySessionId === currentSessionId : undefined,
  };
}

/**
 * Convert an IdentitySessionDocument to CachedIdentitySessionData (for Redis)
 */
export function toCachedIdentitySession(
  doc: IdentitySessionDocument
): CachedIdentitySessionData {
  return {
    identityId: doc.identityId.toHexString(),
    expiresAt: doc.expiresAt.getTime(),
    lastActivityAt: doc.lastActivityAt.getTime(),
  };
}
