/**
 * Sticky CTA for non-members browsing a Space (layout-level, all routes).
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';

export interface SpaceJoinBannerProps {
  onRequestJoin: () => void;
}

export function SpaceJoinBanner({ onRequestJoin }: SpaceJoinBannerProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="space-join-banner" role="region" aria-label={t('spaces.channel.joinCta')}>
      <p className="space-join-banner-text">{t('spaces.channel.joinToPost')}</p>
      <Button type="button" variant="primary" size="sm" onClick={onRequestJoin}>
        {t('spaces.channel.joinCta')}
      </Button>
    </div>
  );
}
