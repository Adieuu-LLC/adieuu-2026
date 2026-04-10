/**
 * Listens for achievement_unlocked events from the WebSocket and shows
 * either a full modal (with optional sound) or a basic toast depending
 * on the user's preferences.
 *
 * Mount this once inside the app shell (below ToastProvider and identity context).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../hooks/useIdentity';
import { useToast } from './Toast';
import { AchievementUnlockedModal } from './AchievementUnlockedModal';
import {
  onAchievementUnlocked,
  type AchievementUnlockEvent,
} from '../services/achievementEvents';
import { loadAchievementPreferences } from '../hooks/useAchievementPreferences';
import type { PublicAchievementDefinition } from '@adieuu/shared';

export function AchievementListener() {
  const { identity } = useIdentity();
  const { t } = useTranslation();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState<AchievementUnlockEvent | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleUnlocked = useCallback(
    (event: AchievementUnlockEvent) => {
      const prefs = identity?.id
        ? loadAchievementPreferences(identity.id)
        : { popupEnabled: true, soundEnabled: true };

      if (prefs.popupEnabled) {
        setSoundEnabled(prefs.soundEnabled);
        setPending(event);
        setModalOpen(true);
      } else {
        toast.info(
          t('achievements.unlocked'),
          t(event.definition.name)
        );
      }
    },
    [identity?.id, toast, t]
  );

  useEffect(() => {
    return onAchievementUnlocked(handleUnlocked);
  }, [handleUnlocked]);

  if (!pending) return null;

  return (
    <AchievementUnlockedModal
      open={modalOpen}
      onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) setPending(null);
      }}
      achievementId={pending.achievementId}
      definition={pending.definition as PublicAchievementDefinition}
      soundEnabled={soundEnabled}
    />
  );
}
