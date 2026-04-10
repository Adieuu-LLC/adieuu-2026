/**
 * Modal shown when an achievement is unlocked.
 *
 * Features:
 * - Large circular icon badge with MagicRings radiating outward
 * - BorderGlow animated intro sweep on the card
 * - Scale-up → rotate → settle badge animation
 * - Optional achievement sound on open
 * - Holder count fetched on open (displays "other" holders, excluding self)
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PublicAchievementDefinition } from '@adieuu/shared';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import type { AppIconName } from '../icons/appIcons';
import { useAppConfig } from '../config';
import { MagicRings } from './MagicRings';
import { BorderGlow } from './BorderGlow';
import { ShinyText } from './ShinyText';

export interface AchievementUnlockedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievementId: string;
  definition: PublicAchievementDefinition;
  soundEnabled?: boolean;
}

const ACHIEVEMENT_SOUND_PATH = '/sounds/achievement.mp3';

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0 ${Math.round(l * 100)}`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
}

function useThemeColors() {
  const [colors, setColors] = useState({ primary: '#22d3ee', secondary: '#38bdf8', bg: '#1a1a2e' });

  useEffect(() => {
    const primary = getCssVar('--color-accent-primary') || '#22d3ee';
    const secondary = getCssVar('--color-accent-secondary') || '#38bdf8';
    const bg = getCssVar('--color-bg-elevated') || '#1a1a2e';
    setColors({ primary, secondary, bg });
  }, []);

  return colors;
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
  const theme = useThemeColors();

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

    const settleTimer = setTimeout(() => {
      setAnimating(false);
    }, 1400);

    let cancelled = false;
    api.achievements.getStats(achievementId).then((res) => {
      if (!cancelled && res.success && res.data) {
        const others = Math.max(0, res.data.holderCount - 1);
        setHolderCount(others);
      }
    });

    return () => {
      cancelled = true;
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
  const glowHsl = hexToHsl(theme.primary);

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <BorderGlow
            className="achievement-glow-wrapper"
            animated={animating}
            colors={[theme.primary, theme.secondary, theme.primary]}
            glowColor={glowHsl}
            backgroundColor={theme.bg}
            borderRadius={12}
            glowRadius={30}
            glowIntensity={0.8}
            fillOpacity={0.35}
          >
            <Dialog.Content className="confirm-dialog-content achievement-modal">
              <div className="achievement-modal-rings">
                {open && (
                  <MagicRings
                    color={theme.primary}
                    colorTwo={theme.secondary}
                    baseRadius={0.115}
                    ringCount={3}
                    radiusStep={0.06}
                    scaleRate={0.05}
                    lineThickness={2}
                    attenuation={10}
                    speed={0.6}
                    opacity={0.85}
                    noiseAmount={0.00}
                    ringGap={1.4}
                  />
                )}
              </div>

              <div
                className={`achievement-modal-badge${animating ? ' achievement-modal-badge--animating' : ''}`}
              >
                <Icon name={iconName} size="2x" />
              </div>

            <Dialog.Title className="achievement-modal-title">
              <ShinyText
                text={t('achievements.unlocked')}
                color={theme.primary}
                shineColor="#ffffff"
                speed={2.5}
              />
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

                {holderCount !== null && holderCount > 0 && (
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
          </BorderGlow>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
