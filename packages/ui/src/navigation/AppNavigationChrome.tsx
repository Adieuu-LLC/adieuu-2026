import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../config';
import { Icon } from '../icons/Icon';
import { useHistoryNavigation } from './useHistoryNavigation';
import { useRouteChrome } from './useRouteChrome';

function isDesktopWinLinuxTitleBar(): boolean {
  if (typeof window === 'undefined') return false;
  const electron = (window as { electron?: { platform?: string } }).electron;
  return electron?.platform !== undefined && electron.platform !== 'darwin';
}

/**
 * Back/forward controls and route title for the desktop custom title bar (Win/Linux).
 */
export function AppNavigationChrome() {
  const { platform } = useAppConfig();
  const { t } = useTranslation();
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigation();
  const { icon, title } = useRouteChrome();

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
      <div className="window-nav-title" title={title}>
        {icon && (
          <span className="window-nav-title-icon" aria-hidden="true">
            <Icon name={icon} size="sm" />
          </span>
        )}
        <span className="window-nav-title-text">{title}</span>
      </div>
    </div>
  );
}
