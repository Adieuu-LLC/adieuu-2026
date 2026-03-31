import { useTranslation } from 'react-i18next';
import { Spinner } from './Spinner';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import { LogoSvg } from './LogoSvg';
import { useUpdateContext } from '../hooks/useUpdateContext';

/**
 * Full-screen blocking overlay shown during the install/restart phase.
 * Rendered before the IPC call so the user sees feedback while the main
 * process blocks on the synchronous package-manager install.
 *
 * Dismissable: the user can minimize it back to the banner.
 */
export function UpdateOverlay() {
  const { t } = useTranslation();
  const { installing, newVersion, dismiss } = useUpdateContext();

  if (!installing) return null;

  const title = newVersion
    ? t('identity.e2e.updateBanner.installingVersion', { version: newVersion })
    : t('identity.e2e.updateBanner.installing');

  return (
    <div className="update-overlay">
      <div className="update-overlay-card">
        <LogoSvg variant="icon" width={48} height={48} />
        <span className="update-overlay-title">{title}</span>
        <div className="update-overlay-progress">
          <ProgressBar percent={100} />
        </div>
        <Spinner size="sm" />
        <p className="update-overlay-message">
          {t('identity.e2e.updateBanner.pleaseWait')}
        </p>
        <div className="update-overlay-actions">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t('identity.e2e.updateBanner.minimize')}
          </Button>
        </div>
      </div>
    </div>
  );
}
