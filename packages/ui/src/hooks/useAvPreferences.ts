/**
 * React hook exposing Audio & Video device / volume preferences.
 * Backed by `avPreferenceStorage` (localStorage) via `useSyncExternalStore`.
 */

import { useSyncExternalStore } from 'react';
import {
  getAvMicDeviceId,
  getAvCameraDeviceId,
  getAvSpeakerDeviceId,
  getAvInputVolume,
  getAvOutputVolume,
  getAvJoinMicOff,
  getAvJoinCameraOff,
  getAvShowDeviceSetup,
  subscribeAvPreferences,
  type AvPreferenceSnapshot,
} from './avPreferenceStorage';

let cached: AvPreferenceSnapshot = {
  micDeviceId: null,
  cameraDeviceId: null,
  speakerDeviceId: null,
  inputVolume: 1,
  outputVolume: 1,
  joinMicOff: false,
  joinCameraOff: true,
  showDeviceSetup: false,
};

function getSnapshot(): AvPreferenceSnapshot {
  const next: AvPreferenceSnapshot = {
    micDeviceId: getAvMicDeviceId(),
    cameraDeviceId: getAvCameraDeviceId(),
    speakerDeviceId: getAvSpeakerDeviceId(),
    inputVolume: getAvInputVolume(),
    outputVolume: getAvOutputVolume(),
    joinMicOff: getAvJoinMicOff(),
    joinCameraOff: getAvJoinCameraOff(),
    showDeviceSetup: getAvShowDeviceSetup(),
  };
  if (
    next.micDeviceId === cached.micDeviceId &&
    next.cameraDeviceId === cached.cameraDeviceId &&
    next.speakerDeviceId === cached.speakerDeviceId &&
    next.inputVolume === cached.inputVolume &&
    next.outputVolume === cached.outputVolume &&
    next.joinMicOff === cached.joinMicOff &&
    next.joinCameraOff === cached.joinCameraOff &&
    next.showDeviceSetup === cached.showDeviceSetup
  ) {
    return cached;
  }
  cached = next;
  return cached;
}

export function useAvPreferences(): AvPreferenceSnapshot {
  return useSyncExternalStore(subscribeAvPreferences, getSnapshot, getSnapshot);
}
