/**
 * Call Service
 *
 * Orchestrates the lifecycle of live audio/video/screenshare calls within
 * conversations. Works with the CallRepository (MongoDB), LiveKit auth
 * (JWT minting), and the Redis pub/sub system (real-time events).
 *
 * Constraints:
 * - Only one non-ended call per conversation (DB unique partial index)
 * - Media types must respect conversation admin toggles
 * - Only conversation participants may initiate or join calls
 *
 * @module services/call
 */

import { ObjectId } from 'mongodb';
import { config } from '../config';
import { getCallRepository } from '../repositories/call.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getMessageRepository } from '../repositories/message.repository';
import { mintLiveKitToken, generateRoomName } from './livekit-auth.service';
import { removeParticipant as livekitRemoveParticipant, deleteRoom as livekitDeleteRoom } from './livekit-room.service';
import { publishToParticipants, publishConversationEvent } from './conversation/redis-events';
import { createNotification } from './notification.service';
import { checkRateLimit, getCallInitiateConfig } from './rate-limit.service';
import { resolveStreamQualityCaps } from '@adieuu/shared';
import type { StreamQualityCaps, SubscriptionTierId } from '@adieuu/shared';
import type { CallDocument, CallMediaOptions, PublicCall, SerializedWrappedCallKey } from '../models/call';
import { toPublicCall } from '../models/call';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CallResult {
  success: boolean;
  call?: PublicCall;
  livekitToken?: string;
  /** LiveKit server WebSocket URL the client should connect to. */
  livekitUrl?: string;
  /** Per-user streaming resolution caps (camera + screenshare). */
  streamQualityCaps?: StreamQualityCaps;
  error?: string;
  errorCode?: string;
  /** Seconds until rate limit resets (when errorCode is RATE_LIMITED) */
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Initiate
// ---------------------------------------------------------------------------

/**
 * Initiate a new call in a conversation.
 *
 * Validates participation, admin call-type toggles, and the one-call-per-
 * conversation constraint. Generates a room name and mints a LiveKit JWT
 * for the initiator.
 */
export async function initiateCall(
  conversationId: string,
  initiatorIdentityId: string,
  requestedMedia: CallMediaOptions,
  access: { subscriptions: readonly SubscriptionTierId[]; entitlements: readonly string[] },
  wrappedE2EEKeys?: SerializedWrappedCallKey[],
): Promise<CallResult> {
  const rlConfig = await getCallInitiateConfig(initiatorIdentityId);
  const rl = await checkRateLimit('calls:initiate:identity', initiatorIdentityId, rlConfig);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000));
    return {
      success: false,
      error: 'Too many call attempts. Please try again later.',
      errorCode: 'RATE_LIMITED',
      retryAfter,
    };
  }

  const conversationRepo = getConversationRepository();
  const callRepo = getCallRepository();
  const identityRepo = getIdentityRepository();

  const convObjId = new ObjectId(conversationId);
  const initiatorObjId = new ObjectId(initiatorIdentityId);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(initiatorObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  // Enforce admin call-type toggles
  const allowedMedia = enforceCallSettings(requestedMedia, conversation);
  if (!allowedMedia.audio && !allowedMedia.video && !allowedMedia.screenshare) {
    return { success: false, error: 'All requested media types are disabled for this conversation', errorCode: 'MEDIA_DISABLED' };
  }

  const identity = await identityRepo.findById(initiatorObjId);
  const displayName = identity?.displayName || identity?.username || 'Unknown';

  const roomName = generateRoomName();

  let livekitToken: string | undefined;
  const streamQualityCaps = resolveStreamQualityCaps(access.subscriptions, access.entitlements);

  if (config.livekit.enabled) {
    try {
      livekitToken = await mintLiveKitToken({
        roomName,
        identityId: initiatorIdentityId,
        displayName,
        streamQualityCaps,
      });
    } catch (err) {
      elog.warn('Failed to mint LiveKit token on initiate', { conversationId, err });
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      };
    }
  }

  let call: CallDocument;
  try {
    call = await callRepo.createCall({
      conversationId: convObjId,
      initiatorIdentityId: initiatorObjId,
      allowedMedia,
      roomName,
      wrappedE2EEKeys,
    });
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      const existingCall = await callRepo.findActiveForConversation(convObjId);
      if (!existingCall) {
        return { success: false, error: 'A call is already active for this conversation', errorCode: 'CALL_ALREADY_ACTIVE' };
      }

      return joinCall(
        conversationId,
        existingCall._id.toHexString(),
        initiatorIdentityId,
        requestedMedia,
        access,
      );
    }
    throw err;
  }

  const updatedCall = await callRepo.addParticipant(call._id, {
    identityId: initiatorObjId,
    joinedAt: new Date(),
    mediaState: allowedMedia,
  });

  const publicCall = toPublicCall(updatedCall ?? call);

  await publishToParticipants(conversation.participants, initiatorObjId, {
    type: 'call_initiated',
    data: { call: publicCall },
  });

  void emitCallSystemMessage(
    convObjId,
    conversation.participants,
    'call_started',
    initiatorObjId,
    displayName,
  );

  const otherParticipants = conversation.participants.filter(
    (p) => !p.equals(initiatorObjId)
  );
  const notificationResults = await Promise.allSettled(
    otherParticipants.map((p) =>
      createNotification(p, 'call_incoming', {
        callId: call._id.toHexString(),
        conversationId,
        initiatorIdentityId,
        allowedMedia,
      })
    )
  );
  notificationResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      elog.warn('Failed to create call_incoming notification', {
        callId: call._id,
        participantId: otherParticipants[index],
        err: result.reason,
      });
    }
  });

  return {
    success: true,
    call: publicCall,
    livekitToken,
    livekitUrl: config.livekit.enabled ? config.livekit.url : undefined,
    streamQualityCaps,
  };
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

/**
 * Join an existing call. Mints a LiveKit JWT for the joining participant.
 */
export async function joinCall(
  conversationId: string,
  callId: string,
  identityId: string,
  mediaState: CallMediaOptions,
  access: { subscriptions: readonly SubscriptionTierId[]; entitlements: readonly string[] },
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const callObjId = new ObjectId(callId);
  const identityObjId = new ObjectId(identityId);

  const call = await callRepo.findById(callObjId);
  if (!call || call.status === 'ended') {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  if (call.conversationId.toHexString() !== conversationId) {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  const conversation = await conversationRepo.findById(call.conversationId);
  if (!conversation || !conversation.participants.some((p) => p.equals(identityObjId))) {
    return { success: false, error: 'Not a participant of this conversation', errorCode: 'NOT_PARTICIPANT' };
  }

  // Prevent duplicate active joins
  const alreadyActive = call.participants.some(
    (p) => p.identityId.equals(identityObjId) && !p.leftAt
  );
  if (alreadyActive) {
    return { success: false, error: 'Already in this call', errorCode: 'ALREADY_IN_CALL' };
  }

  const enforcedMedia = enforceCallSettings(mediaState, conversation);

  const identity = await identityRepo.findById(identityObjId);
  const displayName = identity?.displayName || identity?.username || 'Unknown';

  let livekitToken: string | undefined;
  const streamQualityCaps = resolveStreamQualityCaps(access.subscriptions, access.entitlements);

  if (config.livekit.enabled) {
    try {
      livekitToken = await mintLiveKitToken({
        roomName: call.roomName,
        identityId,
        displayName,
        streamQualityCaps,
      });
    } catch (err) {
      elog.warn('Failed to mint LiveKit token on join', { callId, err });
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      };
    }
  }

  const updated = await callRepo.addParticipant(callObjId, {
    identityId: identityObjId,
    joinedAt: new Date(),
    mediaState: enforcedMedia,
  });

  if (!updated) {
    return { success: false, error: 'Failed to join call', errorCode: 'JOIN_FAILED' };
  }

  const publicCall = toPublicCall(updated);

  await publishToParticipants(conversation.participants, identityObjId, {
    type: 'call_participant_joined',
    data: { callId, identityId, mediaState: enforcedMedia },
  });

  void emitCallSystemMessage(
    call.conversationId,
    conversation.participants,
    'call_joined',
    identityObjId,
    displayName,
  );

  return {
    success: true,
    call: publicCall,
    livekitToken,
    livekitUrl: config.livekit.enabled ? config.livekit.url : undefined,
    streamQualityCaps,
  };
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

/**
 * Leave an active call. If the last participant leaves, the call ends.
 */
export async function leaveCall(
  conversationId: string,
  callId: string,
  identityId: string
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const callObjId = new ObjectId(callId);
  const identityObjId = new ObjectId(identityId);

  const call = await callRepo.findById(callObjId);
  if (!call || call.status === 'ended') {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  if (call.conversationId.toHexString() !== conversationId) {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  const updated = await callRepo.updateParticipantLeft(callObjId, identityObjId);
  if (!updated) {
    return { success: false, error: 'Call not found or not in call', errorCode: 'CALL_NOT_FOUND' };
  }

  // Force-disconnect the participant from the LiveKit room immediately
  void livekitRemoveParticipant(call.roomName, identityId);

  const conversation = await conversationRepo.findById(updated.conversationId);

  const leaverIdentity = await identityRepo.findById(identityObjId);
  const leaverDisplayName = leaverIdentity?.displayName || leaverIdentity?.username || 'Unknown';

  const activeParticipants = updated.participants.filter((p) => !p.leftAt);
  const isLastParticipant = activeParticipants.length === 0;

  if (conversation) {
    await emitCallSystemMessage(
      updated.conversationId,
      conversation.participants,
      isLastParticipant ? 'call_left_ended' : 'call_left',
      identityObjId,
      leaverDisplayName,
    );
  }

  if (isLastParticipant) {
    const ended = await callRepo.updateStatus(callObjId, 'ended', { endedAt: new Date() });
    if (!ended) {
      return { success: false, error: 'Failed to end call', errorCode: 'END_FAILED' };
    }
    // Delete the LiveKit room to free server resources
    void livekitDeleteRoom(call.roomName);
    if (conversation) {
      await notifyCallEnded(conversation.participants, callId, identityId);
    }
    return { success: true, call: toPublicCall(ended) };
  }

  if (conversation) {
    await publishToParticipants(conversation.participants, identityObjId, {
      type: 'call_participant_left',
      data: { callId, identityId },
    });
  }

  return { success: true, call: toPublicCall(updated) };
}

// ---------------------------------------------------------------------------
// End
// ---------------------------------------------------------------------------

/**
 * Forcefully end a call. Only active call participants may end via the API.
 */
export async function endCall(
  conversationId: string,
  callId: string,
  identityId: string
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const callObjId = new ObjectId(callId);
  const identityObjId = new ObjectId(identityId);

  const call = await callRepo.findById(callObjId);
  if (!call || call.status === 'ended') {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  if (call.conversationId.toHexString() !== conversationId) {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  const conversation = await conversationRepo.findById(call.conversationId);
  if (!conversation || !conversation.participants.some((p) => p.equals(identityObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const isActiveInCall = call.participants.some(
    (p) => p.identityId.equals(identityObjId) && !p.leftAt
  );
  if (!isActiveInCall) {
    return { success: false, error: 'Not in this call', errorCode: 'NOT_IN_CALL' };
  }

  const ended = await callRepo.updateStatus(callObjId, 'ended', { endedAt: new Date() });
  if (!ended) {
    return { success: false, error: 'Failed to end call', errorCode: 'END_FAILED' };
  }

  // Delete the LiveKit room — force-disconnects all participants and frees resources
  void livekitDeleteRoom(call.roomName);

  const enderIdentity = await identityRepo.findById(identityObjId);
  const enderDisplayName = enderIdentity?.displayName || enderIdentity?.username || 'Unknown';

  void emitCallSystemMessage(
    call.conversationId,
    conversation.participants,
    'call_ended',
    identityObjId,
    enderDisplayName,
  );

  await notifyCallEnded(conversation.participants, callId, identityId);

  return { success: true, call: toPublicCall(ended) };
}

// ---------------------------------------------------------------------------
// Force End (any conversation member)
// ---------------------------------------------------------------------------

/**
 * Force-end a stuck call. Unlike `endCall`, this does NOT require the
 * requester to be an active call participant -- only a conversation member.
 * Use for ghost-call recovery when no real participants remain.
 */
export async function forceEndCall(
  conversationId: string,
  callId: string,
  identityId: string
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const callObjId = new ObjectId(callId);
  const identityObjId = new ObjectId(identityId);

  const call = await callRepo.findById(callObjId);
  if (!call || call.status === 'ended') {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  if (call.conversationId.toHexString() !== conversationId) {
    return { success: false, error: 'Call not found or already ended', errorCode: 'CALL_NOT_FOUND' };
  }

  const conversation = await conversationRepo.findById(call.conversationId);
  if (!conversation || !conversation.participants.some((p) => p.equals(identityObjId))) {
    return { success: false, error: 'Not a participant of this conversation', errorCode: 'NOT_PARTICIPANT' };
  }

  const ended = await callRepo.updateStatus(callObjId, 'ended', { endedAt: new Date() });
  if (!ended) {
    return { success: false, error: 'Failed to end call', errorCode: 'END_FAILED' };
  }

  void livekitDeleteRoom(call.roomName);

  const enderIdentity = await identityRepo.findById(identityObjId);
  const enderDisplayName = enderIdentity?.displayName || enderIdentity?.username || 'Unknown';

  void emitCallSystemMessage(
    call.conversationId,
    conversation.participants,
    'call_ended',
    identityObjId,
    enderDisplayName,
  );

  await notifyCallEnded(conversation.participants, callId, identityId);

  return { success: true, call: toPublicCall(ended) };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Get the current active call (if any) for a conversation.
 */
export async function getActiveCall(
  conversationId: string,
  identityId: string
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();

  const convObjId = new ObjectId(conversationId);
  const identityObjId = new ObjectId(identityId);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || !conversation.participants.some((p) => p.equals(identityObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const call = await callRepo.findActiveForConversation(convObjId);
  if (!call) {
    return { success: true }; // No active call (not an error)
  }

  return { success: true, call: toPublicCall(call) };
}

// ---------------------------------------------------------------------------
// Media state update
// ---------------------------------------------------------------------------

/**
 * Update a participant's media state (mute/unmute, enable/disable video, etc.).
 */
export async function updateMediaState(
  conversationId: string,
  callId: string,
  identityId: string,
  mediaState: CallMediaOptions
): Promise<CallResult> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();

  const callObjId = new ObjectId(callId);
  const identityObjId = new ObjectId(identityId);

  const call = await callRepo.findById(callObjId);
  if (!call || call.status === 'ended') {
    return { success: false, error: 'Call not found or ended', errorCode: 'CALL_NOT_FOUND' };
  }

  if (call.conversationId.toHexString() !== conversationId) {
    return { success: false, error: 'Call not found or ended', errorCode: 'CALL_NOT_FOUND' };
  }

  const conversation = await conversationRepo.findById(call.conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const enforcedMedia = enforceCallSettings(mediaState, conversation);

  const updated = await callRepo.updateParticipantMediaState(callObjId, identityObjId, enforcedMedia);
  if (!updated) {
    return { success: false, error: 'Not in this call', errorCode: 'NOT_IN_CALL' };
  }

  await publishToParticipants(conversation.participants, identityObjId, {
    type: 'call_media_state_changed',
    data: { callId, identityId, mediaState: enforcedMedia },
  });

  return { success: true, call: toPublicCall(updated) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function notifyCallEnded(
  participants: ObjectId[],
  callId: string,
  endedBy: string
): Promise<void> {
  for (const p of participants) {
    await publishConversationEvent(p.toHexString(), {
      type: 'call_ended',
      data: { callId, endedBy },
    });
  }
}

/**
 * Clamp requested media against conversation-level admin toggles.
 */
function enforceCallSettings(
  requested: CallMediaOptions,
  conversation: { audioCallsDisabled?: boolean; videoCallsDisabled?: boolean; screenshareDisabled?: boolean }
): CallMediaOptions {
  return {
    audio: requested.audio && !conversation.audioCallsDisabled,
    video: requested.video && !conversation.videoCallsDisabled,
    screenshare: requested.screenshare && !conversation.screenshareDisabled,
  };
}

function isDuplicateKeyError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code: number }).code === 11000;
  }
  return false;
}

/**
 * Insert a system message for a call lifecycle event and broadcast it to
 * all conversation participants so it appears in chat history.
 */
async function emitCallSystemMessage(
  conversationId: ObjectId,
  participants: ObjectId[],
  eventType: 'call_started' | 'call_joined' | 'call_left' | 'call_left_ended' | 'call_ended',
  identityId: ObjectId,
  displayName: string,
): Promise<void> {
  const messageRepo = getMessageRepository();
  const conversationRepo = getConversationRepository();

  try {
    const systemMsg = await messageRepo.createMessage({
      conversationId,
      fromIdentityId: identityId,
      messageType: 'system',
      systemEvent: {
        type: eventType,
        identityId: identityId.toHexString(),
        displayName,
      },
      ciphertext: '',
      nonce: '',
      wrappedKeys: [],
      signature: '',
      cryptoProfile: 'default',
      clientMessageId: `sys-${eventType}-${Date.now()}-${identityId.toHexString().slice(-6)}`,
    });

    await conversationRepo.updateLastMessage(conversationId, systemMsg._id, systemMsg.createdAt);
    await conversationRepo.incrementMessageCount(conversationId);

    for (const memberId of participants) {
      await publishConversationEvent(memberId.toHexString(), {
        type: 'conversation_message',
        data: {
          conversationId: conversationId.toHexString(),
          messageId: systemMsg._id.toHexString(),
          fromIdentityId: identityId.toHexString(),
          createdAt: systemMsg.createdAt.toISOString(),
        },
      });
    }
  } catch (err) {
    elog.warn('Failed to emit call system message', { conversationId, eventType, err });
  }
}
