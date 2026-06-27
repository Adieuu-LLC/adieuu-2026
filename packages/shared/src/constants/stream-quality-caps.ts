import type { SubscriptionTierId } from '../subscriptions';

/**
 * Per-tier streaming resolution caps for live video calls.
 *
 * Caps limit both publish (what you send) and subscribe (what you receive).
 * Entitlements `stream-2k` / `stream-4k` override tier-based caps for upsell.
 *
 * Enforcement:
 *  - Publish: client capture constraints + server webhook mute on violation
 *  - Receive: client requests appropriate simulcast layer from the SFU
 */

export interface StreamResolutionCap {
  width: number;
  height: number;
}

export interface StreamQualityCaps {
  camera: StreamResolutionCap;
  screenshare: StreamResolutionCap;
}

export const STREAM_QUALITY_CAPS: Record<SubscriptionTierId, StreamQualityCaps> = {
  access: {
    camera: { width: 960, height: 540 },
    screenshare: { width: 1280, height: 720 },
  },
  insider: {
    camera: { width: 1280, height: 720 },
    screenshare: { width: 1920, height: 1080 },
  },
};

export const STREAM_ENTITLEMENT_CAPS: Record<string, StreamQualityCaps> = {
  'stream-2k': {
    camera: { width: 2560, height: 1440 },
    screenshare: { width: 2560, height: 1440 },
  },
  'stream-4k': {
    camera: { width: 3840, height: 2160 },
    screenshare: { width: 3840, height: 2160 },
  },
};

/**
 * Known streaming entitlements that override tier-based caps.
 * Listed in priority order (highest override first).
 */
export const STREAM_ENTITLEMENT_IDS = ['stream-4k', 'stream-2k'] as const;
export type StreamEntitlementId = (typeof STREAM_ENTITLEMENT_IDS)[number];

/**
 * Resolve the effective streaming quality caps for a user.
 *
 * Priority: stream-4k entitlement > stream-2k entitlement > insider tier > access tier.
 */
export function resolveStreamQualityCaps(
  subscriptions: readonly SubscriptionTierId[],
  entitlements: readonly string[],
): StreamQualityCaps {
  for (const eid of STREAM_ENTITLEMENT_IDS) {
    if (entitlements.includes(eid)) return STREAM_ENTITLEMENT_CAPS[eid]!;
  }
  if (subscriptions.includes('insider')) return STREAM_QUALITY_CAPS.insider;
  if (subscriptions.includes('access')) return STREAM_QUALITY_CAPS.access;
  return STREAM_QUALITY_CAPS.access;
}
