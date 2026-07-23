/**
 * CallRoom
 *
 * The LiveKit-dependent subtree, split into its own lazily-loaded chunk so that
 * `@livekit/components-react`, `livekit-client`, and the LiveKit CSS are only
 * downloaded when a call is actually active. AppCallOverlay stays eager (and
 * thus the audio connection / overlay shell persists across navigation), but the
 * heavy LiveKit bundle is deferred until first use.
 */

import { useEffect, useMemo, useRef } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import { ExternalE2EEKeyProvider } from 'livekit-client';
import '@livekit/components-styles';
import type { StreamQualityCaps } from '@adieuu/shared';
import { CallConferenceView } from './CallConferenceView';
import { RoomHandleRegistrar } from './RoomHandleRegistrar';
import {
  getAvMicDeviceId,
  getAvCameraDeviceId,
  getAvSpeakerDeviceId,
} from '../../hooks/avPreferenceStorage';

export interface CallRoomProps {
  serverUrl: string;
  token: string;
  callE2EEKey: Uint8Array | null;
  e2eeSupported: boolean;
  streamQualityCaps: StreamQualityCaps | null;
  isDm: boolean;
  isExpanded: boolean;
  onToggleFullscreen: () => void;
  onTroubleshoot: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export function CallRoom({
  serverUrl,
  token,
  callE2EEKey,
  e2eeSupported,
  streamQualityCaps,
  isDm,
  isExpanded,
  onToggleFullscreen,
  onTroubleshoot,
  onConnected,
  onDisconnected,
}: CallRoomProps) {
  // ---- E2EE key provider (stable instance across the session) ----

  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null);

  const e2eeWorker = useMemo(() => {
    if (!e2eeSupported) return undefined;
    try {
      return new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
    } catch {
      console.warn('[CallRoom] Failed to create E2EE worker — E2EE will be disabled.');
      return undefined;
    }
  }, [e2eeSupported]);

  useEffect(() => {
    return () => {
      e2eeWorker?.terminate();
    };
  }, [e2eeWorker]);

  if (!keyProviderRef.current && e2eeSupported) {
    keyProviderRef.current = new ExternalE2EEKeyProvider();
  }

  useEffect(() => {
    const keyProvider = keyProviderRef.current;
    if (!keyProvider || !callE2EEKey) return;
    void keyProvider.setKey(
      callE2EEKey.buffer.slice(
        callE2EEKey.byteOffset,
        callE2EEKey.byteOffset + callE2EEKey.byteLength,
      ) as ArrayBuffer,
    );
  }, [callE2EEKey]);

  const roomOptions = useMemo(() => {
    const opts: Record<string, unknown> = {};

    // Preferred capture / output devices from Audio & Video settings. Read once
    // at connect time; live changes are handled via `room.switchActiveDevice`.
    const micDeviceId = getAvMicDeviceId();
    const cameraDeviceId = getAvCameraDeviceId();
    const speakerDeviceId = getAvSpeakerDeviceId();

    const audioCaptureDefaults: Record<string, unknown> = {};
    if (micDeviceId) audioCaptureDefaults.deviceId = micDeviceId;
    if (Object.keys(audioCaptureDefaults).length > 0) {
      opts.audioCaptureDefaults = audioCaptureDefaults;
    }

    const videoCaptureDefaults: Record<string, unknown> = {};
    if (cameraDeviceId) videoCaptureDefaults.deviceId = cameraDeviceId;
    if (streamQualityCaps) {
      videoCaptureDefaults.resolution = {
        width: streamQualityCaps.camera.width,
        height: streamQualityCaps.camera.height,
        frameRate: 30,
      };
      opts.publishDefaults = {
        videoSimulcastLayers: [],
        screenShareSimulcastLayers: [],
      };
      opts.screenShareCaptureDefaults = {
        resolution: {
          width: streamQualityCaps.screenshare.width,
          height: streamQualityCaps.screenshare.height,
          frameRate: 15,
        },
      };
    }
    if (Object.keys(videoCaptureDefaults).length > 0) {
      opts.videoCaptureDefaults = videoCaptureDefaults;
    }

    if (speakerDeviceId) {
      opts.audioOutput = { deviceId: speakerDeviceId };
    }

    if (callE2EEKey && keyProviderRef.current && e2eeWorker) {
      opts.e2ee = {
        keyProvider: keyProviderRef.current,
        worker: e2eeWorker,
      };
    }

    return Object.keys(opts).length > 0 ? opts : undefined;
  }, [streamQualityCaps, callE2EEKey, e2eeWorker]);

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      options={roomOptions}
    >
      <RoomHandleRegistrar />
      <CallConferenceView
        e2eeActive={!!callE2EEKey}
        isDm={isDm}
        isExpanded={isExpanded}
        onToggleFullscreen={onToggleFullscreen}
        onTroubleshoot={onTroubleshoot}
      />
    </LiveKitRoom>
  );
}

export default CallRoom;
