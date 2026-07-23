/**
 * Shared handle onto the currently-active LiveKit room.
 *
 * The always-mounted sidebar call controls live OUTSIDE any `LiveKitRoom`
 * provider, so they cannot use LiveKit React hooks. This module bridges the
 * gap: `RoomHandleRegistrar` (rendered inside the room) registers the `Room`
 * instance and pushes local media state here, while external consumers read a
 * plain snapshot and invoke toggles.
 *
 * IMPORTANT: this module must stay free of any runtime import from
 * `livekit-client` / `@livekit/components-react` (types only), so that eager
 * consumers such as the sidebar do not pull the heavy LiveKit bundle. It only
 * ever calls methods on the `Room` instance handed to it.
 */

import type { Room, RemoteParticipant } from 'livekit-client';
import { getAvOutputVolume } from '../hooks/avPreferenceStorage';

export interface CallControlsSnapshot {
  hasRoom: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  deafened: boolean;
}

let room: Room | null = null;
let micEnabled = false;
let cameraEnabled = false;
let screenShareEnabled = false;
let deafened = false;
let priorMicEnabled = false;

let snapshot: CallControlsSnapshot = {
  hasRoom: false,
  micEnabled: false,
  cameraEnabled: false,
  screenShareEnabled: false,
  deafened: false,
};

const listeners = new Set<() => void>();

function commit(): void {
  snapshot = {
    hasRoom: room !== null,
    micEnabled,
    cameraEnabled,
    screenShareEnabled,
    deafened,
  };
  for (const l of listeners) {
    l();
  }
}

export function subscribeCallControls(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getCallControlsSnapshot(): CallControlsSnapshot {
  return snapshot;
}

export function getActiveRoom(): Room | null {
  return room;
}

/** Called by `RoomHandleRegistrar` once the LiveKit room is available. */
export function registerRoom(r: Room): void {
  room = r;
  deafened = false;
  priorMicEnabled = false;
  commit();
}

/** Called by `RoomHandleRegistrar` on teardown. No-op if a newer room registered. */
export function unregisterRoom(r: Room): void {
  if (room !== r) return;
  room = null;
  micEnabled = false;
  cameraEnabled = false;
  screenShareEnabled = false;
  deafened = false;
  priorMicEnabled = false;
  commit();
}

/** Pushed from the registrar whenever local publications change. */
export function updateLocalMediaState(state: {
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
}): void {
  if (
    state.micEnabled === micEnabled &&
    state.cameraEnabled === cameraEnabled &&
    state.screenShareEnabled === screenShareEnabled
  ) {
    return;
  }
  micEnabled = state.micEnabled;
  cameraEnabled = state.cameraEnabled;
  screenShareEnabled = state.screenShareEnabled;
  commit();
}

export async function toggleMic(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
  } catch {
    /* ignore */
  }
}

export async function toggleCamera(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
  } catch {
    /* ignore */
  }
}

export async function toggleScreenShare(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setScreenShareEnabled(
      !room.localParticipant.isScreenShareEnabled,
    );
  } catch {
    /* ignore */
  }
}

export function isDeafened(): boolean {
  return deafened;
}

/** Apply the current deafen / output-volume state to a single remote participant. */
export function applyRemoteAudio(participant: RemoteParticipant): void {
  const gain = deafened ? 0 : getAvOutputVolume();
  try {
    participant.setVolume(gain);
  } catch {
    /* ignore */
  }
}

export function applyOutputToAllRemotes(): void {
  if (!room) return;
  room.remoteParticipants.forEach((p) => applyRemoteAudio(p));
}

/**
 * Toggle deafen. When deafening we also mute the mic (Discord-style) and
 * restore the prior mic state when undeafening.
 */
export async function toggleDeafen(): Promise<void> {
  if (!room) return;
  const next = !deafened;

  if (next) {
    priorMicEnabled = room.localParticipant.isMicrophoneEnabled;
    deafened = true;
    applyOutputToAllRemotes();
    commit();
    if (priorMicEnabled) {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        /* ignore */
      }
    }
  } else {
    deafened = false;
    applyOutputToAllRemotes();
    commit();
    if (priorMicEnabled) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Test-only reset of module state. */
export function __resetLivekitRoomHandleForTests(): void {
  room = null;
  micEnabled = false;
  cameraEnabled = false;
  screenShareEnabled = false;
  deafened = false;
  priorMicEnabled = false;
  listeners.clear();
  snapshot = {
    hasRoom: false,
    micEnabled: false,
    cameraEnabled: false,
    screenShareEnabled: false,
    deafened: false,
  };
}
