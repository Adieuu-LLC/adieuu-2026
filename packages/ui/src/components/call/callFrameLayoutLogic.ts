import type { Participant } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import {
  type CallFrame,
  type CallLayoutMode,
  isScreenShareEnabled,
  makeFrameId,
} from './callFrameTypes';

export const MAX_SIDEBAR_FRAMES = 3;

export function buildCallFrames(
  participants: Participant[],
  cameraTrackMap: Map<string, TrackReferenceOrPlaceholder>,
  screenTrackMap: Map<string, TrackReferenceOrPlaceholder>,
): CallFrame[] {
  const frames: CallFrame[] = [];

  for (const participant of participants) {
    frames.push({
      id: makeFrameId(participant.identity, 'camera'),
      participantIdentity: participant.identity,
      source: 'camera',
      participant,
      trackRef: cameraTrackMap.get(participant.identity),
    });

    if (isScreenShareEnabled(participant) || screenTrackMap.has(participant.identity)) {
      frames.push({
        id: makeFrameId(participant.identity, 'screenshare'),
        participantIdentity: participant.identity,
        source: 'screenshare',
        participant,
        trackRef: screenTrackMap.get(participant.identity),
      });
    }
  }

  return frames;
}

export function getActiveScreenShareFrames(frames: CallFrame[]): CallFrame[] {
  return frames.filter(
    (frame) => frame.source === 'screenshare' && isScreenShareEnabled(frame.participant),
  );
}

/** When nothing is pinned, pick the screenshare frame that should take center stage. */
export function selectAutoPinScreenShareFrameId(
  frames: CallFrame[],
  pinnedFrameId: string | null,
  declinedAutoPin: boolean,
  previouslyKnownScreenIds: Set<string>,
): string | null {
  if (pinnedFrameId !== null || declinedAutoPin) return pinnedFrameId;

  const activeScreenShares = getActiveScreenShareFrames(frames);
  if (activeScreenShares.length === 0) return null;

  const newlyAppeared = activeScreenShares.find(
    (frame) => !previouslyKnownScreenIds.has(frame.id),
  );
  return (newlyAppeared ?? activeScreenShares[0])!.id;
}

export function compareFramesBySpeakingPriority(a: CallFrame, b: CallFrame): number {
  const aSpeaking = a.participant.isSpeaking ? 1 : 0;
  const bSpeaking = b.participant.isSpeaking ? 1 : 0;
  if (aSpeaking !== bSpeaking) return bSpeaking - aSpeaking;

  const aTime = a.participant.lastSpokeAt?.getTime() ?? 0;
  const bTime = b.participant.lastSpokeAt?.getTime() ?? 0;
  if (aTime !== bTime) return bTime - aTime;

  if (a.source !== b.source) {
    if (a.source === 'screenshare') return -1;
    if (b.source === 'screenshare') return 1;
  }

  return a.participantIdentity.localeCompare(b.participantIdentity);
}

export function selectDefaultHeroFrameId(
  frames: CallFrame[],
  localIdentity: string,
  isDm: boolean,
): string | null {
  if (frames.length === 0) return null;

  const activeScreen = frames.find(
    (frame) => frame.source === 'screenshare' && isScreenShareEnabled(frame.participant),
  );
  if (activeScreen) return activeScreen.id;

  if (isDm) {
    const remoteCamera = frames.find(
      (frame) => frame.source === 'camera' && frame.participantIdentity !== localIdentity,
    );
    if (remoteCamera) return remoteCamera.id;

    const remoteAny = frames.find((frame) => frame.participantIdentity !== localIdentity);
    if (remoteAny) return remoteAny.id;
  }

  const speaking = [...frames].sort(compareFramesBySpeakingPriority);
  const topSpeaker = speaking.find((frame) => frame.participant.isSpeaking);
  if (topSpeaker) return topSpeaker.id;

  const byRecency = [...frames].sort(compareFramesBySpeakingPriority);
  const recentSpeaker = byRecency.find((frame) => frame.participant.lastSpokeAt);
  if (recentSpeaker) return recentSpeaker.id;

  const remote = frames.find((frame) => frame.participantIdentity !== localIdentity);
  if (remote) return remote.id;

  return frames[0]?.id ?? null;
}

export function resolveLayoutMode(
  pinnedFrameId: string | null,
  isDm: boolean,
  participantCount: number,
  isMobile: boolean,
  hasActiveScreenShare: boolean,
): CallLayoutMode {
  if (pinnedFrameId) return 'pinned';
  if (isDm && participantCount === 2 && !hasActiveScreenShare) return 'dm-split';
  if (isMobile && participantCount > 1) return 'mobile-stage';
  return 'grid';
}

export function getPrimaryCameraFrame(
  frames: CallFrame[],
  participantIdentity: string,
): CallFrame | undefined {
  return frames.find(
    (frame) => frame.participantIdentity === participantIdentity && frame.source === 'camera',
  );
}

export interface PinnedLayoutSlice {
  hero: CallFrame;
  sidebar: CallFrame[];
  overflow: CallFrame[];
}

export function computePinnedLayout(
  frames: CallFrame[],
  pinnedFrameId: string,
  sidebarPromotionId: string | null,
  soloOnly = false,
): PinnedLayoutSlice | null {
  const hero = frames.find((frame) => frame.id === pinnedFrameId);
  if (!hero) return null;

  const nonPinned = frames.filter((frame) => frame.id !== pinnedFrameId);
  const sorted = [...nonPinned].sort(compareFramesBySpeakingPriority);

  if (soloOnly) {
    return { hero, sidebar: [], overflow: sorted };
  }

  let sidebar: CallFrame[];
  if (sidebarPromotionId && sorted.some((frame) => frame.id === sidebarPromotionId)) {
    const promoted = sorted.find((frame) => frame.id === sidebarPromotionId)!;
    const rest = sorted.filter((frame) => frame.id !== sidebarPromotionId);
    sidebar = [promoted, ...rest].slice(0, MAX_SIDEBAR_FRAMES);
  } else {
    sidebar = sorted.slice(0, MAX_SIDEBAR_FRAMES);
  }

  const sidebarIds = new Set(sidebar.map((frame) => frame.id));
  const overflow = sorted.filter((frame) => !sidebarIds.has(frame.id));

  return { hero, sidebar, overflow };
}

export function getDmSplitFrames(
  frames: CallFrame[],
  localIdentity: string,
): CallFrame[] {
  const identities = [...new Set(frames.map((frame) => frame.participantIdentity))];
  const remoteIdentity = identities.find((id) => id !== localIdentity);
  const orderedIdentities = remoteIdentity
    ? [remoteIdentity, localIdentity]
    : identities;

  return orderedIdentities
    .map((identity) => getPrimaryCameraFrame(frames, identity))
    .filter((frame): frame is CallFrame => frame !== undefined);
}

export function getGridClass(participantCount: number): string {
  if (participantCount <= 1) {
    return 'call-conference__grid call-conference__grid--single';
  }
  if (participantCount <= 4) {
    return 'call-conference__grid call-conference__grid--small';
  }
  return 'call-conference__grid call-conference__grid--large';
}

export function sanitizeFrameId(
  frameId: string | null,
  frames: CallFrame[],
  fallback: string | null,
): string | null {
  if (frameId && frames.some((frame) => frame.id === frameId)) {
    return frameId;
  }
  return fallback;
}
