/**
 * Modal shown when a subscription is upgraded (sponsorship, promo, admin gift).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type { PublicPendingAccountEvent, SubscriptionTierId } from '@adieuu/shared';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import { MagicRings } from './MagicRings';
import { BorderGlow } from './BorderGlow';
import { ShinyText } from './ShinyText';

export interface SubscriptionUpgradedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: PublicPendingAccountEvent;
}

const DISMISS_KEYS = [
  'account.subscription.upgradeNotification.dismiss',
  'account.subscription.upgradeNotification.dismiss1',
  'account.subscription.upgradeNotification.dismiss2',
  'account.subscription.upgradeNotification.dismiss3',
] as const;

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

function tierNameKey(tier: SubscriptionTierId): string {
  return `account.subscription.tiers.${tier}.name`;
}

export function SubscriptionUpgradedModal({
  open,
  onOpenChange,
  event,
}: SubscriptionUpgradedModalProps) {
  const { t } = useTranslation();
  const theme = useThemeColors();
  const [animating, setAnimating] = useState(false);

  const { data } = event;
  const tierLabel = t(tierNameKey(data.tier));

  const headline = useMemo(() => {
    const { source, sponsorFirstName, sponsorLastInitial } = data;
    if (source === 'sponsorship') {
      if (sponsorFirstName && sponsorLastInitial) {
        return t('account.subscription.upgradeNotification.sponsorshipWithSponsor', {
          firstName: sponsorFirstName,
          lastInitial: `${sponsorLastInitial}.`,
        });
      }
      return t('account.subscription.upgradeNotification.sponsorship');
    }
    if (source === 'promo_code') {
      return t('account.subscription.upgradeNotification.promoCode');
    }
    if (source === 'admin_gift') {
      return t('account.subscription.upgradeNotification.adminGift');
    }
    return t('account.subscription.upgradeNotification.purchase', { tier: tierLabel });
  }, [data, t, tierLabel]);

  useEffect(() => {
    if (!open) {
      setAnimating(false);
      return;
    }

    setAnimating(true);
    const settleTimer = setTimeout(() => setAnimating(false), 1400);
    return () => clearTimeout(settleTimer);
  }, [open, event.id]);

  const glowHsl = hexToHsl(theme.primary);

  const dismissKey = useMemo(
    () => DISMISS_KEYS[Math.floor(Math.random() * DISMISS_KEYS.length)] ?? DISMISS_KEYS[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick a fresh phrase each time the modal opens
    [open],
  );

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
                    baseRadius={0.100}
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
                <Icon name="star" size="2x" />
              </div>

              <Dialog.Title className="achievement-modal-title">
                <ShinyText
                  text={t('account.subscription.upgradeNotification.title')}
                  color={theme.primary}
                  shineColor="#ffffff"
                  speed={2.5}
                />
              </Dialog.Title>

              <div className="achievement-modal-body">
                <h3 className="achievement-modal-name">{headline}</h3>
                <Dialog.Description className="achievement-modal-description">
                  {t('account.subscription.upgradeNotification.tierLabel', { tier: tierLabel })}
                  {data.isLifetime
                    ? ` · ${t('account.subscription.upgradeNotification.lifetime')}`
                    : ''}
                </Dialog.Description>
              </div>

              <div className="confirm-dialog-footer">
                <Button variant="primary" onClick={() => onOpenChange(false)}>
                  {t(dismissKey)}
                </Button>
              </div>
            </Dialog.Content>
          </BorderGlow>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
