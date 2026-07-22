/**
 * Space voice-channel session orchestration.
 *
 * Presence is Discord-like and always available. A LiveKit room is created
 * lazily when at least two members are present, torn down after 60s empty.
 *
 * @module services/space/voice-session
 */

import { ObjectId } from 'mongodb';
import {
  SPACE_VOICE_EMPTY_GRACE_SEC,
  resolveStreamQualityCaps,
  type PublicSpaceVoiceSession,
  type SpaceVoiceMediaState,
  type SubscriptionTierId,
} from '@adieuu/shared';
import { config } from '../../config';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceVoiceSessionRepository } from '../../repositories/space-voice-session.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { isValidObjectId } from '../../utils';
import {
  activeVoiceParticipants,
  toPublicSpaceVoiceSession,
  type SpaceVoiceSessionDocument,
} from '../../models/space-voice-session';
import { mintLiveKitToken, generateRoomName } from '../livekit-auth.service';
import { deleteRoom as livekitDeleteRoom } from '../livekit-room.service';
import { publishSpaceEvent, publishSpaceEventToIdentity } from './redis-events';
import {
  resolveMemberPermissions,
  memberHasPermission,
} from './permissions';
import { canViewSpaceChannel, findEveryoneRole } from './channel-access';
import type { SpaceErrorCode } from './types';
import elog from '../../utils/adieuuLogger';

export interface SpaceVoiceBillingAccess {
  subscriptions: readonly SubscriptionTierId[];
  entitlements: readonly string[];
  isLifetime?: boolean;
}

export interface SpaceVoiceSessionResult {
  success: boolean;
  session?: PublicSpaceVoiceSession | null;
  sessions?: PublicSpaceVoiceSession[];
  livekitToken?: string;
  livekitUrl?: string;
  error?: string;
  errorCode?: SpaceErrorCode;
}

const DEFAULT_MEDIA: SpaceVoiceMediaState = {
  audio: true,
  video: false,
  screenshare: false,
};

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

function clampMedia(
  requested: Partial<SpaceVoiceMediaState> | undefined,
  perms: { speak: boolean; video: boolean; stream: boolean },
): SpaceVoiceMediaState {
  return {
    audio: perms.speak ? (requested?.audio ?? DEFAULT_MEDIA.audio) : false,
    video: perms.video ? (requested?.video ?? DEFAULT_MEDIA.video) : false,
    screenshare: perms.stream
      ? (requested?.screenshare ?? DEFAULT_MEDIA.screenshare)
      : false,
  };
}

async function mintTokenForIdentity(
  roomName: string,
  identityId: string,
  access: SpaceVoiceBillingAccess,
): Promise<string | undefined> {
  if (!config.livekit.enabled) return undefined;

  const identity = await getIdentityRepository().findById(new ObjectId(identityId));
  const displayName = identity?.displayName || identity?.username || 'Unknown';
  const streamQualityCaps = resolveStreamQualityCaps(
    access.subscriptions,
    access.entitlements,
  );
  const isFreeTier = !access.subscriptions.some((t) => t === 'access' || t === 'insider');

  try {
    return await mintLiveKitToken({
      roomName,
      identityId,
      displayName,
      streamQualityCaps,
      audioOnly: isFreeTier,
    });
  } catch (err) {
    elog.warn('Failed to mint LiveKit token for voice channel', { identityId, err });
    return undefined;
  }
}

async function notifyCallStarted(
  session: SpaceVoiceSessionDocument,
  defaultAccess: SpaceVoiceBillingAccess,
  excludeIdentityId?: string,
): Promise<void> {
  if (!session.roomName || !config.livekit.enabled) return;

  const publicSession = toPublicSpaceVoiceSession(session);
  const active = activeVoiceParticipants(session);

  await Promise.all(
    active.map(async (p) => {
      const idHex = p.identityId.toHexString();
      if (excludeIdentityId && idHex === excludeIdentityId) return;
      const token = await mintTokenForIdentity(session.roomName!, idHex, defaultAccess);
      if (!token) return;
      await publishSpaceEventToIdentity(idHex, {
        type: 'voice_channel_call_started',
        data: {
          spaceId: session.spaceId.toHexString(),
          channelId: session.channelId.toHexString(),
          session: publicSession,
          livekitToken: token,
          livekitUrl: config.livekit.url,
        },
      });
    }),
  );
}

async function broadcastPresence(session: SpaceVoiceSessionDocument): Promise<void> {
  await publishSpaceEvent(session.spaceId.toHexString(), {
    type: 'voice_channel_presence_updated',
    data: {
      spaceId: session.spaceId.toHexString(),
      channelId: session.channelId.toHexString(),
      session: toPublicSpaceVoiceSession(session),
    },
  });
}

/**
 * Join voice presence in a voice channel. Creates a LiveKit room when the
 * second (or later) member arrives and none exists yet.
 */
export async function joinVoiceChannel(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
  access: SpaceVoiceBillingAccess,
  requestedMedia?: Partial<SpaceVoiceMediaState>,
): Promise<SpaceVoiceSessionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !channelId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel || channel.type !== 'voice') {
    return {
      success: false,
      error: 'Voice channel not found.',
      errorCode: channel ? 'NOT_VOICE_CHANNEL' : 'CHANNEL_NOT_FOUND',
    };
  }

  const perms = await resolveMemberPermissions(spaceId, identityId);
  if (!perms.isMember) {
    return {
      success: false,
      error: 'You are not a member of this Space.',
      errorCode: 'NOT_MEMBER',
    };
  }
  if (!memberHasPermission(perms, 'connect')) {
    return {
      success: false,
      error: 'You do not have permission to connect to voice channels.',
      errorCode: 'FORBIDDEN',
    };
  }
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (!canViewSpaceChannel(channel, perms, everyone?._id ?? null)) {
    return {
      success: false,
      error: 'You cannot view this channel.',
      errorCode: 'FORBIDDEN',
    };
  }

  const mediaState = clampMedia(requestedMedia, {
    speak: memberHasPermission(perms, 'speak'),
    video: memberHasPermission(perms, 'video'),
    stream: memberHasPermission(perms, 'stream'),
  });

  const repo = getSpaceVoiceSessionRepository();
  let session = await repo.findActiveForChannel(channelId);

  if (!session) {
    try {
      session = await repo.createSession({
        spaceId,
        channelId,
        status: 'waiting',
        participants: [
          {
            identityId,
            joinedAt: new Date(),
            mediaState,
          },
        ],
      });
    } catch (err: unknown) {
      // Race: another joiner created the session first.
      session = await repo.findActiveForChannel(channelId);
      if (!session) throw err;
    }
  }

  const alreadyPresent = activeVoiceParticipants(session).some((p) =>
    p.identityId.equals(identityId),
  );

  if (!alreadyPresent) {
    const updated =
      (await repo.addParticipant(session._id, {
        identityId,
        joinedAt: new Date(),
        mediaState,
      })) ?? (await repo.findActiveForChannel(channelId));
    if (!updated) {
      return {
        success: false,
        error: 'Failed to join voice channel.',
        errorCode: 'VOICE_SESSION_NOT_FOUND',
      };
    }
    session = updated;
  } else if (session.emptyAt) {
    session = (await repo.clearEmpty(session._id)) ?? session;
  }

  const activeCount = activeVoiceParticipants(session).length;
  let livekitToken: string | undefined;
  let livekitUrl: string | undefined;

  if (session.roomName) {
    // Room already exists (active call or grace window with rejoin).
    if (config.livekit.enabled) {
      livekitToken = await mintTokenForIdentity(
        session.roomName,
        identityId.toHexString(),
        access,
      );
      if (!livekitToken) {
        return {
          success: false,
          error: 'Call service is temporarily unavailable.',
          errorCode: 'LIVEKIT_UNAVAILABLE',
        };
      }
      livekitUrl = config.livekit.url;
    }
  } else if (activeCount >= 2) {
    if (!config.livekit.enabled) {
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      };
    }

    const roomName = generateRoomName();
    const activated = await repo.activateWithRoom(session._id, roomName);
    if (!activated?.roomName) {
      // Another joiner won the race — reload and mint against existing room.
      session = (await repo.findActiveForChannel(channelId)) ?? session;
      if (!session.roomName) {
        return {
          success: false,
          error: 'Failed to start voice call.',
          errorCode: 'LIVEKIT_UNAVAILABLE',
        };
      }
    } else {
      session = activated;
    }

    livekitToken = await mintTokenForIdentity(
      session.roomName!,
      identityId.toHexString(),
      access,
    );
    if (!livekitToken) {
      return {
        success: false,
        error: 'Call service is temporarily unavailable.',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      };
    }
    livekitUrl = config.livekit.url;

    await notifyCallStarted(session, access, identityId.toHexString());
  }

  await broadcastPresence(session);

  return {
    success: true,
    session: toPublicSpaceVoiceSession(session),
    livekitToken,
    livekitUrl,
  };
}

/**
 * Leave voice presence. Starts the 60s empty grace when the last member leaves
 * an active room; ends waiting sessions immediately when empty.
 */
export async function leaveVoiceChannel(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceVoiceSessionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !channelId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const repo = getSpaceVoiceSessionRepository();
  const session = await repo.findActiveForChannel(channelId);
  if (!session || !session.spaceId.equals(spaceId)) {
    return { success: true, session: null };
  }

  const updated = await repo.updateParticipantLeft(session._id, identityId);
  if (!updated) {
    return { success: true, session: toPublicSpaceVoiceSession(session) };
  }

  const remaining = activeVoiceParticipants(updated);
  if (remaining.length === 0) {
    if (updated.roomName) {
      const marked = (await repo.markEmpty(updated._id, new Date())) ?? updated;
      await broadcastPresence(marked);
      return { success: true, session: toPublicSpaceVoiceSession(marked) };
    }
    const ended = (await repo.endWaitingSession(updated._id)) ?? updated;
    await publishSpaceEvent(spaceId.toHexString(), {
      type: 'voice_channel_presence_updated',
      data: {
        spaceId: spaceId.toHexString(),
        channelId: channelId.toHexString(),
        session: toPublicSpaceVoiceSession(ended),
      },
    });
    return { success: true, session: null };
  }

  await broadcastPresence(updated);
  return { success: true, session: toPublicSpaceVoiceSession(updated) };
}

export async function updateVoiceMediaState(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
  requestedMedia: Partial<SpaceVoiceMediaState>,
): Promise<SpaceVoiceSessionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !channelId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const perms = await resolveMemberPermissions(spaceId, identityId);
  if (!perms.isMember) {
    return {
      success: false,
      error: 'You are not a member of this Space.',
      errorCode: 'NOT_MEMBER',
    };
  }

  const mediaState = clampMedia(requestedMedia, {
    speak: memberHasPermission(perms, 'speak'),
    video: memberHasPermission(perms, 'video'),
    stream: memberHasPermission(perms, 'stream'),
  });

  const repo = getSpaceVoiceSessionRepository();
  const session = await repo.findActiveForChannel(channelId);
  if (!session || !session.spaceId.equals(spaceId)) {
    return {
      success: false,
      error: 'Voice session not found.',
      errorCode: 'VOICE_SESSION_NOT_FOUND',
    };
  }

  const updated = await repo.updateParticipantMediaState(
    session._id,
    identityId,
    mediaState,
  );
  if (!updated) {
    return {
      success: false,
      error: 'You are not in this voice channel.',
      errorCode: 'FORBIDDEN',
    };
  }

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'voice_channel_media_state_changed',
    data: {
      spaceId: spaceId.toHexString(),
      channelId: channelId.toHexString(),
      identityId: identityId.toHexString(),
      mediaState,
    },
  });

  return { success: true, session: toPublicSpaceVoiceSession(updated) };
}

export async function getVoiceSession(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceVoiceSessionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !channelId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const perms = await resolveMemberPermissions(spaceId, identityId);
  if (!perms.isMember) {
    return {
      success: false,
      error: 'You are not a member of this Space.',
      errorCode: 'NOT_MEMBER',
    };
  }

  const session = await getSpaceVoiceSessionRepository().findActiveForChannel(channelId);
  if (!session || !session.spaceId.equals(spaceId)) {
    return { success: true, session: null };
  }
  return { success: true, session: toPublicSpaceVoiceSession(session) };
}

export async function listSpaceVoicePresence(
  spaceIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceVoiceSessionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const perms = await resolveMemberPermissions(spaceId, identityId);
  if (!perms.isMember) {
    return {
      success: false,
      error: 'You are not a member of this Space.',
      errorCode: 'NOT_MEMBER',
    };
  }

  const sessions = await getSpaceVoiceSessionRepository().findActiveForSpace(spaceId);
  return {
    success: true,
    sessions: sessions
      .filter((s) => activeVoiceParticipants(s).length > 0 || !!s.roomName)
      .map(toPublicSpaceVoiceSession),
  };
}

/**
 * Tear down LiveKit rooms for voice sessions that have been empty longer
 * than {@link SPACE_VOICE_EMPTY_GRACE_SEC}.
 */
export async function reapEmptyVoiceSessions(): Promise<void> {
  const repo = getSpaceVoiceSessionRepository();
  const sessions = await repo.findAllNonEnded();
  const now = Date.now();
  const graceMs = SPACE_VOICE_EMPTY_GRACE_SEC * 1000;

  for (const session of sessions) {
    if (!session.emptyAt || !session.roomName) continue;
    if (now - session.emptyAt.getTime() < graceMs) continue;

    const active = activeVoiceParticipants(session);
    if (active.length > 0) {
      await repo.clearEmpty(session._id);
      continue;
    }

    const roomName = session.roomName;
    const ended = await repo.clearRoomAndEnd(session._id);
    if (!ended) continue;

    void livekitDeleteRoom(roomName);

    await publishSpaceEvent(session.spaceId.toHexString(), {
      type: 'voice_channel_call_ended',
      data: {
        spaceId: session.spaceId.toHexString(),
        channelId: session.channelId.toHexString(),
        sessionId: session._id.toHexString(),
        reason: 'empty_grace',
      },
    });
    await publishSpaceEvent(session.spaceId.toHexString(), {
      type: 'voice_channel_presence_updated',
      data: {
        spaceId: session.spaceId.toHexString(),
        channelId: session.channelId.toHexString(),
        session: toPublicSpaceVoiceSession(ended),
      },
    });

    elog.info('Voice session room torn down after empty grace', {
      sessionId: session._id.toHexString(),
      channelId: session.channelId.toHexString(),
      roomName,
    });
  }
}
