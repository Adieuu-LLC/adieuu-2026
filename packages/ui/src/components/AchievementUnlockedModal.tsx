/**
 * Modal shown when an achievement is unlocked.
 *
 * Features:
 * - Large circular icon badge overlapping the top of the dialog
 * - Scale-up → rotate → confetti burst → settle animation sequence
 * - Optional achievement sound on open
 * - Holder count fetched on open
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import confetti from 'canvas-confetti';
import { createApiClient, type PublicAchievementDefinition } from '@adieuu/shared';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import type { AppIconName } from '../icons/appIcons';
import { useAppConfig } from '../config';

export interface AchievementUnlockedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievementId: string;
  definition: PublicAchievementDefinition;
  soundEnabled?: boolean;
}

const ACHIEVEMENT_SOUND_PATH = '/sounds/achievement.mp3';

function fireConfetti() {
  const count = 180;
  const defaults: confetti.Options = { origin: { y: 0.3 }, zIndex: 9999 };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
}

export function AchievementUnlockedModal({
  open,
  onOpenChange,
  achievementId,
  definition,
  soundEnabled = true,
}: AchievementUnlockedModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedRef = useRef(false);

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(ACHIEVEMENT_SOUND_PATH);
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {
      // Audio playback not available
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!open) {
      setHolderCount(null);
      setAnimating(false);
      hasPlayedRef.current = false;
      return;
    }

    if (hasPlayedRef.current) return;
    hasPlayedRef.current = true;

    playSound();
    setAnimating(true);

    const confettiTimer = setTimeout(() => {
      fireConfetti();
    }, 600);

    const settleTimer = setTimeout(() => {
      setAnimating(false);
    }, 1400);

    let cancelled = false;
    api.achievements.getStats(achievementId).then((res) => {
      if (!cancelled && res.success && res.data) {
        setHolderCount(res.data.holderCount);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(confettiTimer);
      clearTimeout(settleTimer);
    };
  }, [open, achievementId, api, playSound]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const iconName = definition.icon as AppIconName;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content achievement-modal">
            <div
              className={`achievement-modal-badge${animating ? ' achievement-modal-badge--animating' : ''}`}
            >
              <Icon name={iconName} size="2x" />
            </div>

            <Dialog.Title className="achievement-modal-title">
              {t('achievements.unlocked')}
            </Dialog.Title>

            <div className="achievement-modal-body">
              <h3 className="achievement-modal-name">
                {t(definition.name)}
              </h3>
              <Dialog.Description className="achievement-modal-description">
                {t(definition.description)}
              </Dialog.Description>

              {definition.how && (
                <p className="achievement-modal-how">
                  {t(definition.how)}
                </p>
              )}

              <span className="achievement-modal-category">
                {t(`achievements.category.${definition.category}`)}
              </span>

              {holderCount !== null && (
                <p className="achievement-modal-stats">
                  {t('achievements.holderCount', { count: holderCount })}
                </p>
              )}
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="primary"
                onClick={() => onOpenChange(false)}
              >
                {t('achievements.dismiss')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
