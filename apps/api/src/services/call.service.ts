/**
 * Call Service
 *
 * Orchestrates the lifecycle of live audio/video/screenshare calls within
 * conversations. Works with the CallRepository (MongoDB), JitsiAuthService
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
import { mintJitsiToken, generateJitsiRoomName } from './jitsi-auth.service';
import { publishToParticipants, publishConversationEvent } from './conversation/redis-events';
import { createNotification } from './notification.service';
import { checkRateLimit, getCallInitiateConfig } from './rate-limit.service';
import type { CallDocument, CallMediaOptions, PublicCall } from '../models/call';
import { toPublicCall } from '../models/call';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CallResult {
  success: boolean;
  call?: PublicCall;
  jitsiToken?: string;
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
 * conversation constraint. Generates a Jitsi room name and mints a JWT
 * for the initiator.
 */
export async function initiateCall(
  conversationId: string,
  initiatorIdentityId: string,
  requestedMedia: CallMediaOptions
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
  const displayName = identity?.ident ?? 'Unknown';

  const jitsiRoomName = generateJitsiRoomName();

  let jitsiToken: string | undefined;
  if (config.jitsi.enabled) {
    try {
      jitsiToken = mintJitsiToken({
        roomName: jitsiRoomName,
        identityId: initiatorIdentityId,
        displayName,
      });
    } catch (err) {
      elog.warn('Failed to mint Jitsi token on initiate', { conversationId, err });
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'JITSI_UNAVAILABLE',
      };
    }
  }

  let call: CallDocument;
  try {
    call = await callRepo.createCall({
      conversationId: convObjId,
      initiatorIdentityId: initiatorObjId,
      allowedMedia,
      jitsiRoomName,
    });
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      return { success: false, error: 'A call is already active for this conversation', errorCode: 'CALL_ALREADY_ACTIVE' };
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

  return { success: true, call: publicCall, jitsiToken };
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

/**
 * Join an existing call. Mints a Jitsi JWT for the joining participant.
 */
export async function joinCall(
  conversationId: string,
  callId: string,
  identityId: string,
  mediaState: CallMediaOptions
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
  const displayName = identity?.ident ?? 'Unknown';

  let jitsiToken: string | undefined;
  if (config.jitsi.enabled) {
    try {
      jitsiToken = mintJitsiToken({
        roomName: call.jitsiRoomName,
        identityId,
        displayName,
      });
    } catch (err) {
      elog.warn('Failed to mint Jitsi token on join', { callId, err });
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'JITSI_UNAVAILABLE',
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

  return { success: true, call: publicCall, jitsiToken };
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

  const conversation = await conversationRepo.findById(updated.conversationId);

  // Check if all participants have left — end call without requiring active membership
  const activeParticipants = updated.participants.filter((p) => !p.leftAt);
  if (activeParticipants.length === 0) {
    const ended = await callRepo.updateStatus(callObjId, 'ended', { endedAt: new Date() });
    if (!ended) {
      return { success: false, error: 'Failed to end call', errorCode: 'END_FAILED' };
    }
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
