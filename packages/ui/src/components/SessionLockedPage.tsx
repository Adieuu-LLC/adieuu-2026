import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';

export interface SessionLockedPageProps {
  /** i18n key for the page heading (e.g. `identity.profile.title`) */
  titleI18nKey: string;
  titleI18nOptions?: Record<string, unknown>;
}

/**
 * Shown when the identity HTTP session is valid but the client crypto session is locked.
 */
export function SessionLockedPage({ titleI18nKey, titleI18nOptions }: SessionLockedPageProps) {
  const { t } = useTranslation();
  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t(titleI18nKey, titleI18nOptions)}</h1>
        </div>
        <Alert variant="warning">{t('ciphers.sessionLocked')}</Alert>
      </div>
    </div>
  );
}
