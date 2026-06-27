import { ObjectId } from 'mongodb';
import { config } from '../config';
import { getCallRepository } from '../repositories/call.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { publishConversationEvent } from './conversation/redis-events';
import { deleteRoom as livekitDeleteRoom, listParticipants as livekitListParticipants } from './livekit-room.service';
import elog from '../utils/adieuuLogger';

export async function reapStaleCalls(): Promise<void> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const now = Date.now();

  const activeCalls = await callRepo.findAllActive();

  for (const call of activeCalls) {
    let allLeft =
      call.participants.length === 0 ||
      call.participants.every((p) => p.leftAt != null);

    // Cross-reference with LiveKit: if a participant is marked active in
    // MongoDB but absent from the LiveKit room, they are a ghost.
    if (!allLeft && config.livekit.enabled) {
      try {
        const lkParticipants = await livekitListParticipants(call.roomName);
        const lkIdentities = new Set(lkParticipants.map((p) => p.identity));

        for (const p of call.participants) {
          if (!p.leftAt && !lkIdentities.has(p.identityId.toHexString())) {
            await callRepo.updateParticipantLeft(call._id, p.identityId);
            elog.info('Call reaper marked ghost participant as left', {
              callId: call._id.toHexString(),
              identityId: p.identityId.toHexString(),
              roomName: call.roomName,
            });
          }
        }

        const refreshed = await callRepo.findById(call._id);
        if (refreshed) {
          allLeft =
            refreshed.participants.length === 0 ||
            refreshed.participants.every((p) => p.leftAt != null);
        }
      } catch (err) {
        elog.warn('Call reaper failed to cross-reference LiveKit participants', {
          callId: call._id.toHexString(),
          err,
        });
      }
    }

    const updatedAgo = (now - call.updatedAt.getTime()) / 1000;
    const createdAgo = (now - call.createdAt.getTime()) / 1000;

    const emptyTimeout = allLeft && updatedAgo > config.callReaper.emptyTimeoutSec;
    const hardCeiling = createdAgo > config.callReaper.maxCallDurationSec;

    if (!emptyTimeout && !hardCeiling) continue;

    const reason = hardCeiling ? 'max_duration_exceeded' : 'empty_timeout';

    const updated = await callRepo.updateStatus(call._id, 'ended', { endedAt: new Date() });
    if (!updated || updated.status !== 'ended') continue;

    // Delete the LiveKit room to free server resources for reaped calls
    void livekitDeleteRoom(call.roomName);

    const conversation = await conversationRepo.findById(call.conversationId);
    if (conversation) {
      const event = {
        type: 'call_ended',
        data: {
          conversationId: call.conversationId.toHexString(),
          callId: call._id.toHexString(),
          reason,
        },
      };
      await Promise.all(
        conversation.participants.map((id: ObjectId) =>
          publishConversationEvent(id.toHexString(), event),
        ),
      );
    }

    elog.warn('Call reaper ended stale call', {
      callId: call._id.toHexString(),
      conversationId: call.conversationId.toHexString(),
      reason,
    });
  }
}

let reaperHandle: ReturnType<typeof setInterval> | null = null;

export function startCallReaper(): ReturnType<typeof setInterval> | null {
  if (config.callReaper.intervalSec <= 0) return null;

  reaperHandle = setInterval(() => {
    reapStaleCalls().catch((err) => elog.warn('Call reaper error', { err }));
  }, config.callReaper.intervalSec * 1000);

  elog.info('Call reaper started', { intervalSec: config.callReaper.intervalSec });
  return reaperHandle;
}

export function stopCallReaper(handle: ReturnType<typeof setInterval>): void {
  clearInterval(handle);
}
