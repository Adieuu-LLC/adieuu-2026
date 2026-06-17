import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';

export type CallFrameSource = 'camera' | 'screenshare';

export interface CallFrame {
  id: string;
  participantIdentity: string;
  source: CallFrameSource;
  participant: Participant;
  trackRef?: TrackReferenceOrPlaceholder;
}

export type CallLayoutMode = 'pinned' | 'dm-split' | 'mobile-stage' | 'grid';

export function makeFrameId(participantIdentity: string, source: CallFrameSource): string {
  return `${participantIdentity}:${source}`;
}

export function parseFrameId(frameId: string): { participantIdentity: string; source: CallFrameSource } | null {
  const idx = frameId.lastIndexOf(':');
  if (idx <= 0) return null;
  const source = frameId.slice(idx + 1);
  if (source !== 'camera' && source !== 'screenshare') return null;
  return {
    participantIdentity: frameId.slice(0, idx),
    source,
  };
}

export function getParticipantDisplayName(participant: Participant): string {
  return participant.name || participant.identity || 'Unknown';
}

export function isCameraEnabled(participant: Participant): boolean {
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  return camPub !== undefined && !camPub.isMuted && camPub.isSubscribed !== false;
}

export function isScreenShareEnabled(participant: Participant): boolean {
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  if (screenPub === undefined || screenPub.isMuted) return false;
  // Local screen share is published directly; isSubscribed applies to remote tracks only.
  if (screenPub.track !== undefined) return true;
  return screenPub.isSubscribed !== false;
}

export function hasActiveScreenShareFrames(frames: CallFrame[]): boolean {
  return frames.some((frame) => frame.source === 'screenshare');
}

export function isMicEnabled(participant: Participant): boolean {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  return micPub !== undefined && !micPub.isMuted;
}
