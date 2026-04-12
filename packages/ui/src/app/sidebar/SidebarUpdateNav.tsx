import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useUpdateContext } from '../../hooks/useUpdateContext';
import { usePlatform } from '../../hooks/usePlatform';
import {
  resolveSidebarUpdateNav,
  type SidebarUpdateNavLabel,
} from './sidebarUpdateNavState';

const LABEL_I18N: Record<SidebarUpdateNavLabel, string> = {
  available: 'sidebar.update.available',
  downloading: 'sidebar.update.downloading',
  install: 'sidebar.update.install',
  restartWeb: 'sidebar.update.restartWeb',
  error: 'sidebar.update.error',
};

/**
 * Compact sidebar entry for app updates: navigates to Check for Updates.
 * Shown above the identity / alias block when an update needs attention.
 */
export function SidebarUpdateNav() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const { status, downloadProgress, installing } = useUpdateContext();

  const resolved = resolveSidebarUpdateNav(
    status,
    platform,
    installing,
    downloadProgress,
  );

  if (!resolved.visible) return null;

  const primaryLabel = t(LABEL_I18N[resolved.label]);
  const showProgress = resolved.label === 'downloading';
  const percent = resolved.progressPercent ?? 0;

  const handleClick = () => {
    closeMobile();
    navigate('/about/updates');
  };

  return (
    <div className="sidebar-update-nav-row">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="sidebar-update-nav-btn"
        onClick={handleClick}
        aria-label={primaryLabel}
      >
        <Icon name="download" />
        <span className="sidebar-update-nav-label">{primaryLabel}</span>
      </Button>
      {showProgress && (
        <div className="sidebar-update-nav-progress">
          <ProgressBar percent={percent} />
        </div>
      )}
    </div>
  );
}
