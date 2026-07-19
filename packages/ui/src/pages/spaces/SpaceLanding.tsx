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
import { useSpaceCipher } from './useSpaceCipher';
import {
  resolveSpaceDisplayDescription,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';

export function SpaceLanding() {
  const { t } = useTranslation();
  const { activeSpace } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);

  if (!activeSpace) return null;

  const spaceName = resolveSpaceDisplayName(activeSpace, spaceCipher, {
    encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
  });
  const description = resolveSpaceDisplayDescription(activeSpace, spaceCipher);

  return (
    <div className="space-landing">
      <div className="page-header">
        <h1 className="page-title">{spaceName}</h1>
        {activeSpace.visibility === 'hidden' ? (
          <p className="page-subtitle">{t('spaces.visibility.hidden')}</p>
        ) : (
          <p className="page-subtitle">/s/{activeSpace.slug}</p>
        )}
      </div>
      <Card variant="elevated" className="space-view-placeholder">
        {description && (
          <p className="spaces-card-description">{description}</p>
        )}
        <span className="spaces-card-members">
          {t('spaces.memberCount', { count: activeSpace.memberCount })}
        </span>
        <p className="spaces-state-body">{t('spaces.view.comingSoon')}</p>
      </Card>
    </div>
  );
}
