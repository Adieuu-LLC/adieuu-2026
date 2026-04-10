/**
 * Modal shown when an achievement is unlocked.
 *
 * Displays the achievement icon, name, description, and a global holder
 * count fetched on open. Controlled via open/onOpenChange props.
 */

import { useState, useEffect, useMemo } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
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
}

export function AchievementUnlockedModal({
  open,
  onOpenChange,
  achievementId,
  definition,
}: AchievementUnlockedModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [holderCount, setHolderCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setHolderCount(null);
      return;
    }

    let cancelled = false;
    api.achievements.getStats(achievementId).then((res) => {
      if (!cancelled && res.success && res.data) {
        setHolderCount(res.data.holderCount);
      }
    });
    return () => { cancelled = true; };
  }, [open, achievementId, api]);

  const iconName = definition.icon as AppIconName;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content achievement-modal">
            <div className="achievement-modal-icon">
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
