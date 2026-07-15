/**
 * Space landing page (index route for `/s/:slug`).
 *
 * Shown when a user first enters a Space. For now this is a placeholder card
 * with the Space's name, description, and member count. A richer community-
 * style landing (banner, feed of recent posts/links) lands later.
 */

import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { Card } from '../../components/Card';

export function SpaceLanding() {
  const { t } = useTranslation();
  const { activeSpace } = useSpaces();

  if (!activeSpace) return null;

  return (
    <div className="space-landing">
      <div className="page-header">
        <h1 className="page-title">{activeSpace.name}</h1>
        <p className="page-subtitle">/s/{activeSpace.slug}</p>
      </div>
      <Card variant="elevated" className="space-view-placeholder">
        {activeSpace.description && (
          <p className="spaces-card-description">{activeSpace.description}</p>
        )}
        <span className="spaces-card-members">
          {t('spaces.memberCount', { count: activeSpace.memberCount })}
        </span>
        <p className="spaces-state-body">{t('spaces.view.comingSoon')}</p>
      </Card>
    </div>
  );
}
