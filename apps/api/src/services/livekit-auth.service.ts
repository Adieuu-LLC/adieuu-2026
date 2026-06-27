/**
 * LiveKit Authentication Service
 *
 * Mints short-lived JWTs that authenticate participants with the
 * self-hosted LiveKit SFU deployment. Each token is room-scoped and
 * identity-scoped, preventing unauthorized room access.
 *
 * @module services/livekit-auth
 */

import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config';
import type { StreamQualityCaps } from '@adieuu/shared';

export interface MintLiveKitTokenInput {
  /** Room name (from CallDocument.roomName) */
  roomName: string;
  /** Participant's identity ID (used as LiveKit identity) */
  identityId: string;
  /** Display name for the participant */
  displayName: string;
  /** Streaming resolution caps to encode in participant metadata for server-side enforcement. */
  streamQualityCaps?: StreamQualityCaps;
}

/**
 * Mints a short-lived JWT for authenticating with LiveKit.
 *
 * The token grants room join permission and publish/subscribe rights.
 * LiveKit auto-creates the room on first join, so no pre-creation is needed.
 *
 * Stream quality caps are encoded in participant metadata so the webhook
 * handler can enforce publish limits server-side.
 *
 * @returns LiveKit JWT string
 * @throws Error if LiveKit is not configured
 */
export async function mintLiveKitToken(input: MintLiveKitTokenInput): Promise<string> {
  if (!config.livekit.enabled) {
    throw new Error('LiveKit integration is not enabled');
  }

  const metadata = input.streamQualityCaps
    ? JSON.stringify({ streamQualityCaps: input.streamQualityCaps })
    : undefined;

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: input.identityId,
    name: input.displayName,
    ttl: config.livekit.tokenTtlSec,
    metadata,
  });

  at.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return await at.toJwt();
}

/**
 * Generates a cryptographically random room name.
 *
 * Uses 24 random bytes (192 bits) encoded as lowercase hex.
 * LiveKit room names are arbitrary strings, but hex avoids
 * any potential encoding issues.
 *
 * @returns 48-character hex room name
 */
export function generateRoomName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString('hex');
}
