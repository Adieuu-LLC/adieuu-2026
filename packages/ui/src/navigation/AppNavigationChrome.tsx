import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../config';
import { Icon } from '../icons/Icon';
import { useHistoryNavigation } from './useHistoryNavigation';

function isDesktopWinLinuxTitleBar(): boolean {
  if (typeof window === 'undefined') return false;
  const electron = (window as { electron?: { platform?: string } }).electron;
  return electron?.platform !== undefined && electron.platform !== 'darwin';
}

/**
 * Back/forward controls for the desktop custom title bar (Win/Linux).
 */
export function AppNavigationChrome() {
  const { platform } = useAppConfig();
  const { t } = useTranslation();
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigation();

  if (platform !== 'desktop' || !isDesktopWinLinuxTitleBar()) {
    return null;
  }

  return (
    <div className="window-title-bar-nav">
      {canGoBack ? (
        <button
          type="button"
          className="window-nav-btn"
          onClick={goBack}
          aria-label={t('nav.goBack', 'Go back')}
        >
          <Icon name="arrowLeft" size="sm" />
        </button>
      ) : null}
      {canGoForward ? (
        <button
          type="button"
          className="window-nav-btn"
          onClick={goForward}
          aria-label={t('nav.goForward', 'Go forward')}
        >
          <Icon name="arrowRight" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
