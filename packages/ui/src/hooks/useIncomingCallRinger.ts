/**
 * Incoming call ringtone hook.
 *
 * Plays the user's configured TTL (disappearing message) notification sound
 * on a loop with a 1-second gap while there are incoming calls AND the user
 * is not already in a call. Stops when the user accepts/declines/call ends.
 */

import { useEffect, useRef } from 'react';
import { useCallSession } from './useCallSession';
import { useGlobalCallEvents } from './useGlobalCallEvents';
import {
  getTtlNotificationSoundId,
  getTtlNotificationSoundCustomPath,
  getTtlNotificationSoundVolume,
} from './notificationSoundPreferenceStorage';
import {
  getBuiltinNotificationSoundSrc,
  isBuiltinNotificationSoundId,
} from '../constants/builtinNotificationSounds';
import { ensureAudioContextRunning } from '../utils/notificationSound';

const RING_GAP_MS = 1000;

export function useIncomingCallRinger(): void {
  const { incomingCalls } = useGlobalCallEvents();
  const { activeSession, phase } = useCallSession();

  const shouldRing = incomingCalls.length > 0 && activeSession === null && phase === 'idle';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!shouldRing) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      return;
    }

    const soundId = getTtlNotificationSoundId();
    if (soundId === 'none') return;

    let src: string | null = null;
    if (soundId === 'custom') {
      const customPath = getTtlNotificationSoundCustomPath();
      if (!customPath) return;
      src = customPath;
    } else if (isBuiltinNotificationSoundId(soundId)) {
      src = getBuiltinNotificationSoundSrc(soundId);
    }
    if (!src) return;

    const volume = getTtlNotificationSoundVolume();

    void ensureAudioContextRunning();

    const playRing = () => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play().catch(() => {});
        return;
      }
      const audio = new Audio(src!);
      audio.volume = Math.min(1, volume);
      audioRef.current = audio;
      void audio.play().catch(() => {});
    };

    playRing();
    intervalRef.current = setInterval(playRing, RING_GAP_MS + 500);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, [shouldRing]);
}
