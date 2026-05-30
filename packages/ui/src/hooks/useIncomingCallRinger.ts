/**
 * Incoming call ringtone hook.
 *
 * Plays the user's configured call ringtone sound on a loop while there are
 * incoming calls AND the user is not already in a call. Each repetition waits
 * for the track to finish, then pauses briefly before replaying.
 * Stops when the user accepts/declines/call ends.
 */

import { useEffect, useRef } from 'react';
import { useCallSession } from './useCallSession';
import { useGlobalCallEvents } from './useGlobalCallEvents';
import {
  getCallRingtoneSoundId,
  getCallRingtoneSoundCustomPath,
  getCallRingtoneSoundVolume,
} from './notificationSoundPreferenceStorage';
import {
  getBuiltinNotificationSoundSrc,
  isBuiltinNotificationSoundId,
} from '../constants/builtinNotificationSounds';
import { ensureAudioContextRunning } from '../utils/notificationSound';

const RING_GAP_MS = 200;

export function useIncomingCallRinger(): void {
  const { incomingCalls } = useGlobalCallEvents();
  const { activeSession, phase } = useCallSession();

  const shouldRing = incomingCalls.length > 0 && activeSession === null && phase === 'idle';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!shouldRing) {
      cancelledRef.current = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      return;
    }

    cancelledRef.current = false;

    const soundId = getCallRingtoneSoundId();
    if (soundId === 'none') return;

    let src: string | null = null;
    if (soundId === 'custom') {
      const customPath = getCallRingtoneSoundCustomPath();
      if (!customPath) return;
      src = customPath;
    } else if (isBuiltinNotificationSoundId(soundId)) {
      src = getBuiltinNotificationSoundSrc(soundId);
    }
    if (!src) return;

    const volume = getCallRingtoneSoundVolume();

    void ensureAudioContextRunning();

    const playRing = () => {
      if (cancelledRef.current) return;

      const audio = new Audio(src!);
      audio.volume = Math.min(1, volume);
      audioRef.current = audio;

      audio.addEventListener('ended', () => {
        if (cancelledRef.current) return;
        timeoutRef.current = setTimeout(playRing, RING_GAP_MS);
      });

      void audio.play().catch(() => {});
    };

    playRing();

    return () => {
      cancelledRef.current = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, [shouldRing]);
}
