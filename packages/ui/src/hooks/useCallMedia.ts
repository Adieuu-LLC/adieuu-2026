/**
 * Call Media Hook
 *
 * Manages local media streams for audio/video calls.
 * Handles getUserMedia for camera/mic and getDisplayMedia for screenshare,
 * tracks mute/unmute state, and provides toggle functions.
 *
 * Streams are cleaned up when the component unmounts or when the hook's
 * consumer explicitly stops all tracks.
 *
 * @module hooks/useCallMedia
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCallMediaReturn {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreensharing: boolean;
  toggleAudio: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenshare: () => Promise<void>;
  startMedia: (options: { audio: boolean; video: boolean }) => Promise<MediaStream | null>;
  stopAllMedia: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function setTracksEnabled(stream: MediaStream | null, kind: 'audio' | 'video', enabled: boolean): void {
  if (!stream) return;
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCallMedia(): UseCallMediaReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreensharing, setIsScreensharing] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // ---- Start media ----

  const startMedia = useCallback(
    async (options: { audio: boolean; video: boolean }): Promise<MediaStream | null> => {
      stopTracks(localStreamRef.current);

      if (!options.audio && !options.video) {
        localStreamRef.current = null;
        setLocalStream(null);
        setIsAudioEnabled(false);
        setIsVideoEnabled(false);
        return null;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: options.audio,
          video: options.video,
        });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsAudioEnabled(options.audio);
        setIsVideoEnabled(options.video);
        return stream;
      } catch (err) {
        console.error('[useCallMedia] getUserMedia failed:', err);
        localStreamRef.current = null;
        setLocalStream(null);
        setIsAudioEnabled(false);
        setIsVideoEnabled(false);
        return null;
      }
    },
    []
  );

  // ---- Toggle audio ----

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const newEnabled = !audioTracks[0]!.enabled;
    setTracksEnabled(stream, 'audio', newEnabled);
    setIsAudioEnabled(newEnabled);
  }, []);

  // ---- Toggle video ----

  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();

    if (videoTracks.length > 0) {
      const newEnabled = !videoTracks[0]!.enabled;
      setTracksEnabled(stream, 'video', newEnabled);
      setIsVideoEnabled(newEnabled);
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          stream.addTrack(videoTrack);
          setIsVideoEnabled(true);
          setLocalStream(new MediaStream(stream.getTracks()));
        }
      } catch (err) {
        console.error('[useCallMedia] Failed to add video track:', err);
      }
    }
  }, []);

  // ---- Toggle screenshare ----

  const toggleScreenshare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreensharing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          screenStreamRef.current = null;
          setScreenStream(null);
          setIsScreensharing(false);
        });
      }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreensharing(true);
    } catch (err) {
      console.error('[useCallMedia] getDisplayMedia failed:', err);
    }
  }, []);

  // ---- Stop all ----

  const stopAllMedia = useCallback(() => {
    stopTracks(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    setIsAudioEnabled(false);
    setIsVideoEnabled(false);

    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreensharing(false);
  }, []);

  // ---- Cleanup on unmount ----

  useEffect(() => {
    return () => {
      stopTracks(localStreamRef.current);
      stopTracks(screenStreamRef.current);
    };
  }, []);

  return {
    localStream,
    screenStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreensharing,
    toggleAudio,
    toggleVideo,
    toggleScreenshare,
    startMedia,
    stopAllMedia,
  };
}
