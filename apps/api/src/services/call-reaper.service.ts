import { ObjectId } from 'mongodb';
import { config } from '../config';
import { getCallRepository } from '../repositories/call.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { publishConversationEvent } from './conversation/redis-events';
import { deleteRoom as livekitDeleteRoom } from './livekit-room.service';
import elog from '../utils/adieuuLogger';

export async function reapStaleCalls(): Promise<void> {
  const callRepo = getCallRepository();
  const conversationRepo = getConversationRepository();
  const now = Date.now();

  const activeCalls = await callRepo.findAllActive();

  for (const call of activeCalls) {
    const allLeft =
      call.participants.length === 0 ||
      call.participants.every((p) => p.leftAt != null);

    const updatedAgo = (now - call.updatedAt.getTime()) / 1000;
    const createdAgo = (now - call.createdAt.getTime()) / 1000;

    const emptyTimeout = allLeft && updatedAgo > config.callReaper.emptyTimeoutSec;
    const hardCeiling = createdAgo > config.callReaper.maxCallDurationSec;

    if (!emptyTimeout && !hardCeiling) continue;

    const reason = hardCeiling ? 'max_duration_exceeded' : 'empty_timeout';

    const updated = await callRepo.updateStatus(call._id, 'ended', { endedAt: new Date() });
    if (!updated || updated.status !== 'ended') continue;

    // Delete the LiveKit room to free server resources for reaped calls
    void livekitDeleteRoom(call.jitsiRoomName);

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
