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
import { useAppConfig } from '../config';
import { AchievementUnlockedModal } from './AchievementUnlockedModal';
import {
  onAchievementUnlocked,
  emitAchievementUnlocked,
  resetAchievementEmitHistory,
  type AchievementUnlockEvent,
} from '../services/achievementEvents';
import { loadAchievementPreferences } from '../hooks/useAchievementPreferences';

const CLOSE_ANIMATION_MS = 300;

export function AchievementListener() {
  const { identity } = useIdentity();
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { onStateChange } = useChatSocket();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [queue, setQueue] = useState<AchievementUnlockEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Reset dedup state when identity changes.
  useEffect(() => {
    resetAchievementEmitHistory();
    setQueue([]);
    setModalOpen(false);
  }, [identity?.id]);

  // ------ event bus subscription ------

  const handleUnlocked = useCallback(
    (event: AchievementUnlockEvent) => {
      const prefs = identity?.id
        ? loadAchievementPreferences(identity.id)
        : { popupEnabled: true, soundEnabled: true };

      if (prefs.popupEnabled) {
        setSoundEnabled(prefs.soundEnabled);
        setQueue((prev) => {
          if (prev.some((e) => e.achievementId === event.achievementId)) return prev;
          return [...prev, event];
        });
      } else {
        toast.info(t('achievements.unlocked'), t(event.definition.name));
      }
    },
    [identity?.id, toast, t],
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

  // ------ auto-open next item when queue has entries and modal is closed ------

  useEffect(() => {
    if (!modalOpen && queue.length > 0) {
      setModalOpen(true);
    }
  }, [modalOpen, queue.length]);

  // ------ dismiss handler: close modal, then dequeue after animation ------

  const handleDismiss = useCallback((open: boolean) => {
    if (open) return;
    setModalOpen(false);
    setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, CLOSE_ANIMATION_MS);
  }, []);

  const current = queue[0] ?? null;
  if (!current) return null;

  return (
    <AchievementUnlockedModal
      open={modalOpen}
      onOpenChange={handleDismiss}
      achievementId={current.achievementId}
      definition={current.definition as PublicAchievementDefinition}
      soundEnabled={soundEnabled}
    />
  );
}
