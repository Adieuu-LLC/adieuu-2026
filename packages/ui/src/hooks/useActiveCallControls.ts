/**
 * React hook for the always-mounted sidebar call controls.
 *
 * Reads the active LiveKit room state via `livekitRoomHandle` (which stays
 * free of the heavy LiveKit bundle) and exposes toggles for mic / camera /
 * screen share / deafen.
 */

import { useSyncExternalStore } from 'react';
import {
  subscribeCallControls,
  getCallControlsSnapshot,
  toggleMic,
  toggleCamera,
  toggleScreenShare,
  toggleDeafen,
  type CallControlsSnapshot,
} from '../services/livekitRoomHandle';

export interface ActiveCallControls extends CallControlsSnapshot {
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
}

export function useActiveCallControls(): ActiveCallControls {
  const snapshot = useSyncExternalStore(
    subscribeCallControls,
    getCallControlsSnapshot,
    getCallControlsSnapshot,
  );

  return {
    ...snapshot,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleDeafen,
  };
}
