/**
 * LiveKit Webhook Controller
 *
 * Receives LiveKit server-side webhook events (e.g. `track_published`) and
 * enforces streaming quality caps by muting tracks that exceed the
 * participant's allowed resolution.
 *
 * Verification uses the same API key/secret as token minting (shared HMAC).
 *
 * @module routes/webhooks/livekit.controller
 */

import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../../config';
import type { StreamQualityCaps } from '@adieuu/shared';
import elog from '../../utils/adieuuLogger';

let _receiver: WebhookReceiver | null = null;
let _roomClient: RoomServiceClient | null = null;

function getReceiver(): WebhookReceiver | null {
  if (!config.livekit.enabled || !config.livekit.apiKey || !config.livekit.apiSecret) {
    return null;
  }
  if (!_receiver) {
    _receiver = new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret);
  }
  return _receiver;
}

function getRoomClient(): RoomServiceClient | null {
  if (!config.livekit.enabled || !config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    return null;
  }
  if (!_roomClient) {
    const httpUrl = config.livekit.url
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');
    _roomClient = new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret);
  }
  return _roomClient;
}

interface ParticipantMetadata {
  streamQualityCaps?: StreamQualityCaps;
}

function parseParticipantMetadata(raw: string | undefined): ParticipantMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParticipantMetadata;
  } catch {
    return null;
  }
}

export function exceedsCap(
  trackWidth: number,
  trackHeight: number,
  cap: { width: number; height: number },
): boolean {
  const trackMax = Math.max(trackWidth, trackHeight);
  const trackMin = Math.min(trackWidth, trackHeight);
  const capMax = Math.max(cap.width, cap.height);
  const capMin = Math.min(cap.width, cap.height);
  return trackMax > capMax || trackMin > capMin;
}

/**
 * Handles a verified LiveKit webhook event.
 * Currently enforces publish-side quality caps on `track_published`.
 */
async function handleLiveKitEvent(event: WebhookEvent): Promise<void> {
  if (event.event !== 'track_published') return;

  const { room, participant, track } = event;
  if (!room?.name || !participant?.identity || !track) return;

  const metadata = parseParticipantMetadata(participant.metadata);
  if (!metadata?.streamQualityCaps) return;

  const caps = metadata.streamQualityCaps;
  const isScreenShare = track.source === 2; // TrackSource.SCREEN_SHARE = 2
  const cap = isScreenShare ? caps.screenshare : caps.camera;

  const trackWidth = track.width ?? 0;
  const trackHeight = track.height ?? 0;

  if (!exceedsCap(trackWidth, trackHeight, cap)) return;

  elog.warn('LiveKit track exceeds quality cap, muting', {
    room: room.name,
    identity: participant.identity,
    trackSid: track.sid,
    trackWidth,
    trackHeight,
    capWidth: cap.width,
    capHeight: cap.height,
    isScreenShare,
  });

  const client = getRoomClient();
  if (!client || !track.sid) return;

  try {
    await client.mutePublishedTrack(room.name, participant.identity, track.sid, true);
  } catch (err) {
    elog.warn('Failed to mute non-compliant track', {
      room: room.name,
      identity: participant.identity,
      trackSid: track.sid,
      err,
    });
  }
}

export interface LiveKitWebhookResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/**
 * Processes a raw LiveKit webhook request.
 * Verifies the HMAC signature and dispatches the event.
 */
export async function handleLiveKitWebhook(input: {
  rawBody: string | undefined;
  authHeader: string | null;
}): Promise<LiveKitWebhookResult> {
  if (!config.livekit.enabled) {
    return { ok: false, error: 'LiveKit is not enabled', status: 503 };
  }

  const receiver = getReceiver();
  if (!receiver) {
    return { ok: false, error: 'LiveKit webhook receiver not configured', status: 503 };
  }

  if (!input.rawBody) {
    return { ok: false, error: 'Missing body', status: 400 };
  }

  if (!input.authHeader) {
    return { ok: false, error: 'Missing authorization header', status: 401 };
  }

  let event: WebhookEvent;
  try {
    event = await receiver.receive(input.rawBody, input.authHeader);
  } catch (err) {
    elog.warn('LiveKit webhook signature verification failed', { err });
    return { ok: false, error: 'Invalid signature', status: 401 };
  }

  try {
    await handleLiveKitEvent(event);
  } catch (err) {
    elog.error('LiveKit webhook processing error', {
      event: event.event,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok: true };
}
