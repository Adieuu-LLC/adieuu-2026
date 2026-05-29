/**
 * Jitsi Authentication Service
 *
 * Mints short-lived HS256 JWTs that authenticate participants with the
 * self-hosted Jitsi Meet deployment. Each token is room-scoped and
 * identity-scoped, preventing unauthorized room access.
 *
 * The token schema follows Jitsi's JWT spec:
 * https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/tokens.md
 *
 * @module services/jitsi-auth
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

// ---------------------------------------------------------------------------
// JWT helpers (compact HS256, identical to account-token.service.ts)
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

const JWT_HEADER = base64UrlEncode(
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
);

// ---------------------------------------------------------------------------
// Jitsi JWT payload (per Jitsi spec)
// ---------------------------------------------------------------------------

export interface JitsiJwtPayload {
  /** Audience (always 'jitsi') */
  aud: 'jitsi';
  /** Issuer (matches JITSI_JWT_ISSUER / Prosody jwt_issuer) */
  iss: string;
  /** Subject (Jitsi domain / vhost) */
  sub: string;
  /** Jitsi room name to restrict access to */
  room: string;
  /** Participant context (displayed in Jitsi UI) */
  context: {
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  };
  /** Issued-at (epoch seconds) */
  iat: number;
  /** Expiration (epoch seconds) */
  exp: number;
}

export interface MintJitsiTokenInput {
  /** Opaque Jitsi room name (from CallDocument.jitsiRoomName) */
  roomName: string;
  /** Participant's identity ID */
  identityId: string;
  /** Display name for the participant (ident handle) */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string;
}

/**
 * Mints a short-lived JWT for authenticating with Jitsi.
 *
 * @returns Compact HS256 JWT string
 * @throws Error if Jitsi is not configured
 */
export function mintJitsiToken(input: MintJitsiTokenInput): string {
  if (!config.jitsi.enabled) {
    throw new Error('Jitsi integration is not enabled');
  }

  const now = Math.floor(Date.now() / 1000);

  const jitsiDomain = config.jitsi.xmppDomain;

  const payload: JitsiJwtPayload = {
    aud: 'jitsi',
    iss: config.jitsi.jwtIssuer,
    sub: jitsiDomain,
    room: input.roomName,
    context: {
      user: {
        id: input.identityId,
        name: input.displayName,
        ...(input.avatarUrl ? { avatar: input.avatarUrl } : {}),
      },
    },
    iat: now,
    exp: now + config.jitsi.jwtExpirationSec,
  };

  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload)),
  );

  const signingInput = `${JWT_HEADER}.${encodedPayload}`;
  const signature = base64UrlEncode(
    hmacSha256(signingInput, config.jitsi.jwtSecret),
  );

  return `${signingInput}.${signature}`;
}

/**
 * Generates a cryptographically random Jitsi room name.
 *
 * Uses 24 random bytes (192 bits) encoded as lowercase hex. Hex is used
 * instead of base64url because XMPP MUC room names are case-insensitive
 * and Jitsi rejects names containing uppercase characters.
 *
 * @returns 48-character hex room name
 */
export function generateJitsiRoomName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString('hex');
}
