/**
 * Listens for achievement_unlocked events from the WebSocket and shows
 * either a full modal (with optional sound) or a basic toast depending
 * on the user's preferences.
 *
 * Maintains a queue so multiple achievements (e.g. retroactive grants on
 * login) display one after the other rather than overwriting each other.
 *
 * On WebSocket connect, fetches unread achievement notifications from the
 * REST API to catch any that were published before the WS subscription was
 * active.  Deduplication is handled by the event bus.
 *
 * Mount this once inside the app shell (below ToastProvider and identity context).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PublicAchievementDefinition } from '@adieuu/shared';
import { useIdentity } from '../hooks/useIdentity';
import { useToast } from './Toast';
import { useChatSocket } from '../hooks/useChatSocket';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID } from '../constants/builtinNotificationSounds';
import type { NotificationSoundId } from '../constants/notificationSoundPreferenceShared';
import { AchievementUnlockedModal } from './AchievementUnlockedModal';
import {
  onAchievementUnlocked,
  emitAchievementUnlocked,
  resetAchievementEmitHistory,
  type AchievementUnlockEvent,
} from '../services/achievementEvents';
import {
  DEFAULT_ACHIEVEMENT_SOUND_VOLUME,
  loadAchievementPreferences,
} from '../hooks/useAchievementPreferences';

const CLOSE_ANIMATION_MS = 300;

type QueuedAchievementUnlock = AchievementUnlockEvent & {
  playback: {
    soundEnabled: boolean;
    achievementSoundId: NotificationSoundId;
    achievementSoundCustomPath: string | null;
    achievementSoundVolume: number;
  };
};

const FALLBACK_ACHIEVEMENT_PREFS = {
  popupEnabled: true,
  soundEnabled: true,
  achievementSoundId: DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID as NotificationSoundId,
  achievementSoundCustomPath: null as string | null,
  achievementSoundVolume: DEFAULT_ACHIEVEMENT_SOUND_VOLUME,
};

export function AchievementListener() {
  const { identity } = useIdentity();
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { audio } = usePlatformCapabilities();
  const { onStateChange } = useChatSocket();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [queue, setQueue] = useState<QueuedAchievementUnlock[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Reset dedup state when identity changes.
  useEffect(() => {
    resetAchievementEmitHistory();
    setQueue([]);
    setModalOpen(false);
  }, [identity?.id]);

  // ------ event bus subscription ------

  const handleUnlocked = useCallback(
    (event: AchievementUnlockEvent) => {
      if (event.notificationId) {
        api.notifications.markAsRead([event.notificationId]).catch(() => {});
      }

      const prefs = identity?.id
        ? loadAchievementPreferences(identity.id)
        : FALLBACK_ACHIEVEMENT_PREFS;

      if (prefs.popupEnabled) {
        const playback = {
          soundEnabled: prefs.soundEnabled,
          achievementSoundId: prefs.achievementSoundId,
          achievementSoundCustomPath: prefs.achievementSoundCustomPath,
          achievementSoundVolume: prefs.achievementSoundVolume,
        };
        setQueue((prev) => {
          if (prev.some((e) => e.achievementId === event.achievementId)) return prev;
          return [...prev, { ...event, playback }];
        });
      } else {
        toast.info(t('achievements.unlocked'), t(event.definition.name));
      }
    },
    [identity?.id, toast, t, api],
  );

  useEffect(() => {
    return onAchievementUnlocked(handleUnlocked);
  }, [handleUnlocked]);

  // ------ fetch unread achievement notifications on WS connect ------

  useEffect(() => {
    return onStateChange((state) => {
      if (state !== 'connected') return;

      api.notifications
        .getNotifications({
          types: ['achievement_unlocked'],
          unreadOnly: true,
        })
        .then((res) => {
          if (!res.success || !res.data) return;

          const ids: string[] = [];
          for (const notif of res.data.notifications) {
            const achData = notif.data as {
              achievementId?: string;
              definition?: AchievementUnlockEvent['definition'];
            };
            if (achData.achievementId && achData.definition) {
              emitAchievementUnlocked({
                achievementId: achData.achievementId,
                definition: achData.definition,
                notificationId: notif.id,
              });
              ids.push(notif.id);
            }
          }

          if (ids.length > 0) {
            api.notifications.markAsRead(ids).catch(() => {});
          }
        })
        .catch(() => {});
    });
  }, [onStateChange, api]);

  // ------ auto-open next item after close animation finishes ------

  useEffect(() => {
    if (!modalOpen && queue.length > 0) {
      const timer = setTimeout(() => setModalOpen(true), CLOSE_ANIMATION_MS);
      return () => clearTimeout(timer);
    }
  }, [modalOpen, queue.length]);

  // ------ dismiss handler: close modal and dequeue immediately ------

  const handleDismiss = useCallback((open: boolean) => {
    if (open) return;
    setModalOpen(false);
    setQueue((prev) => prev.slice(1));
  }, []);

  const current = queue[0] ?? null;
  if (!current) return null;

  return (
    <AchievementUnlockedModal
      open={modalOpen}
      onOpenChange={handleDismiss}
      achievementId={current.achievementId}
      definition={current.definition as PublicAchievementDefinition}
      soundEnabled={current.playback.soundEnabled}
      achievementSoundId={current.playback.achievementSoundId}
      achievementSoundCustomPath={current.playback.achievementSoundCustomPath}
      achievementSoundVolume={current.playback.achievementSoundVolume}
      loadCustomSound={audio?.loadSoundFromPath}
    />
  );
}
