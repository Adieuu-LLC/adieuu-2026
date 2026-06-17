/**
 * Call API Service
 *
 * Functions for managing call lifecycle (initiate, join, leave, end),
 * querying active calls, and updating media/call settings.
 *
 * Uses the shared HttpClient directly since the shared package does not
 * yet expose a typed CallsApi module.
 *
 * @module services/callService
 */

import type { HttpClient, ApiResponse, PublicConversation, StreamQualityCaps, SerializedWrappedCallKey } from '@adieuu/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallMediaOptions {
  audio: boolean;
  video: boolean;
  screenshare: boolean;
}

export interface PublicCallParticipant {
  identityId: string;
  joinedAt: string;
  leftAt?: string;
  mediaState: CallMediaOptions;
}

export interface PublicCall {
  id: string;
  conversationId: string;
  initiatorIdentityId: string;
  status: 'ringing' | 'active' | 'ended';
  allowedMedia: CallMediaOptions;
  participants: PublicCallParticipant[];
  roomName: string;
  e2eeKeyId?: string;
  wrappedE2EEKeys?: SerializedWrappedCallKey[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallSettingsPayload {
  audioCallsDisabled?: boolean;
  videoCallsDisabled?: boolean;
  screenshareDisabled?: boolean;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

function enc(id: string): string {
  return encodeURIComponent(id);
}

export async function initiateCall(
  client: HttpClient,
  conversationId: string,
  media: CallMediaOptions,
  wrappedE2EEKeys?: SerializedWrappedCallKey[]
): Promise<ApiResponse<{ call: PublicCall; livekitToken?: string; livekitUrl?: string; streamQualityCaps?: StreamQualityCaps }>> {
  const body: Record<string, unknown> = { media };
  if (wrappedE2EEKeys && wrappedE2EEKeys.length > 0) {
    body.wrappedE2EEKeys = wrappedE2EEKeys;
  }
  return client.post(`/api/conversations/${enc(conversationId)}/calls`, body);
}

export async function joinCall(
  client: HttpClient,
  conversationId: string,
  callId: string,
  media: CallMediaOptions
): Promise<ApiResponse<{ call: PublicCall; livekitToken?: string; livekitUrl?: string; streamQualityCaps?: StreamQualityCaps }>> {
  return client.post(
    `/api/conversations/${enc(conversationId)}/calls/${enc(callId)}/join`,
    { media }
  );
}

export async function leaveCall(
  client: HttpClient,
  conversationId: string,
  callId: string
): Promise<ApiResponse<{ call: PublicCall }>> {
  return client.post(
    `/api/conversations/${enc(conversationId)}/calls/${enc(callId)}/leave`
  );
}

export async function endCall(
  client: HttpClient,
  conversationId: string,
  callId: string
): Promise<ApiResponse<{ call: PublicCall }>> {
  return client.post(
    `/api/conversations/${enc(conversationId)}/calls/${enc(callId)}/end`
  );
}

export async function forceEndCall(
  client: HttpClient,
  conversationId: string,
  callId: string
): Promise<ApiResponse<{ call: PublicCall }>> {
  return client.post(
    `/api/conversations/${enc(conversationId)}/calls/${enc(callId)}/force-end`
  );
}

export async function getActiveCall(
  client: HttpClient,
  conversationId: string
): Promise<ApiResponse<{ call: PublicCall | null }>> {
  return client.get(`/api/conversations/${enc(conversationId)}/calls/active`);
}

/** Fetch active call IDs for many conversations (e.g. sidebar sync after reconnect). */
export async function fetchActiveCallIdsByConversation(
  client: HttpClient,
  conversationIds: string[],
): Promise<Map<string, string>> {
  const results = await Promise.all(
    conversationIds.map(async (conversationId) => {
      try {
        const resp = await getActiveCall(client, conversationId);
        const call = resp.success ? resp.data?.call : null;
        if (call && call.status !== 'ended') {
          return [conversationId, call.id] as const;
        }
      } catch {
        // Best-effort per conversation.
      }
      return null;
    }),
  );

  return new Map(
    results.filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

export async function updateMediaState(
  client: HttpClient,
  conversationId: string,
  callId: string,
  media: CallMediaOptions
): Promise<ApiResponse<{ call: PublicCall }>> {
  return client.patch(
    `/api/conversations/${enc(conversationId)}/calls/${enc(callId)}/media`,
    { media }
  );
}

export async function updateCallSettings(
  client: HttpClient,
  conversationId: string,
  settings: CallSettingsPayload
): Promise<ApiResponse<{ conversation: PublicConversation }>> {
  return client.patch(
    `/api/conversations/${enc(conversationId)}/call-settings`,
    settings
  );
}
