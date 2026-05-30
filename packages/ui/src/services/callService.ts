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

import type { HttpClient, ApiResponse, PublicConversation } from '@adieuu/shared';

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
  media: CallMediaOptions
): Promise<ApiResponse<{ call: PublicCall; livekitToken?: string; livekitUrl?: string }>> {
  return client.post(`/api/conversations/${enc(conversationId)}/calls`, { media });
}

export async function joinCall(
  client: HttpClient,
  conversationId: string,
  callId: string,
  media: CallMediaOptions
): Promise<ApiResponse<{ call: PublicCall; livekitToken?: string; livekitUrl?: string }>> {
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

export async function getActiveCall(
  client: HttpClient,
  conversationId: string
): Promise<ApiResponse<{ call: PublicCall | null }>> {
  return client.get(`/api/conversations/${enc(conversationId)}/calls/active`);
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
