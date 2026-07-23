/**
 * Registers the active LiveKit room with `livekitRoomHandle` so the sidebar
 * call controls (mounted outside any `LiveKitRoom`) can drive it, and applies
 * the user's saved Audio & Video device / output-volume preferences on connect.
 *
 * Rendered inside `LiveKitRoom` (both the conversation overlay and the Space
 * voice hidden host), so importing LiveKit here is fine — it is already part of
 * the lazily-loaded call bundle.
 */

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import type { RemoteParticipant } from 'livekit-client';
import {
  registerRoom,
  unregisterRoom,
  updateLocalMediaState,
  applyRemoteAudio,
  applyOutputToAllRemotes,
} from '../../services/livekitRoomHandle';
import {
  getAvMicDeviceId,
  getAvCameraDeviceId,
  getAvSpeakerDeviceId,
  subscribeAvPreferences,
} from '../../hooks/avPreferenceStorage';

export function RoomHandleRegistrar() {
  const room = useRoomContext();

  useEffect(() => {
    registerRoom(room);

    const syncLocalState = () => {
      const lp = room.localParticipant;
      updateLocalMediaState({
        micEnabled: lp.isMicrophoneEnabled,
        cameraEnabled: lp.isCameraEnabled,
        screenShareEnabled: lp.isScreenShareEnabled,
      });
    };

    const onParticipantConnected = (participant: RemoteParticipant) => {
      applyRemoteAudio(participant);
    };

    const applyPreferences = async () => {
      try {
        const mic = getAvMicDeviceId();
        if (mic) await room.switchActiveDevice('audioinput', mic);
        const camera = getAvCameraDeviceId();
        if (camera) await room.switchActiveDevice('videoinput', camera);
        const speaker = getAvSpeakerDeviceId();
        if (speaker) await room.switchActiveDevice('audiooutput', speaker);
      } catch {
        /* ignore device-switch failures */
      }
      applyOutputToAllRemotes();
    };

    const onConnected = () => {
      syncLocalState();
      void applyPreferences();
    };

    syncLocalState();

    room.on(RoomEvent.LocalTrackPublished, syncLocalState);
    room.on(RoomEvent.LocalTrackUnpublished, syncLocalState);
    room.on(RoomEvent.TrackMuted, syncLocalState);
    room.on(RoomEvent.TrackUnmuted, syncLocalState);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.Connected, onConnected);

    if (room.state === 'connected') {
      void applyPreferences();
    }

    // Re-apply saved device / output-volume preferences when they change mid-call.
    const unsubscribePrefs = subscribeAvPreferences(() => {
      if (room.state === 'connected') {
        void applyPreferences();
      }
    });

    return () => {
      unsubscribePrefs();
      room.off(RoomEvent.LocalTrackPublished, syncLocalState);
      room.off(RoomEvent.LocalTrackUnpublished, syncLocalState);
      room.off(RoomEvent.TrackMuted, syncLocalState);
      room.off(RoomEvent.TrackUnmuted, syncLocalState);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.Connected, onConnected);
      unregisterRoom(room);
    };
  }, [room]);

  return null;
}
