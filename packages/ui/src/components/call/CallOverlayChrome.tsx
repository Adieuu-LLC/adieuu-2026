import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../icons/Icon';
import { Tooltip } from '../Tooltip';

export interface CallOverlayChromeProps {
  isExpanded: boolean;
  onToggleFullscreen: () => void;
  children?: ReactNode;
}

export function CallOverlayChrome({
  isExpanded,
  onToggleFullscreen,
  children,
}: CallOverlayChromeProps) {
  const { t } = useTranslation();
  const tooltip = isExpanded ? t('call.exitFullscreen') : t('call.expandFullscreen');
  const ariaLabel = isExpanded ? t('call.exitFullscreenLabel') : t('call.expandFullscreenLabel');

  return (
    <div className="call-overlay-chrome">
      <div className="call-overlay-chrome__main">
        {children}
      </div>
      <Tooltip content={tooltip} position="bottom">
        <button
          type="button"
          className="call-overlay-chrome__expand"
          onClick={() => void onToggleFullscreen()}
          aria-label={ariaLabel}
          aria-pressed={isExpanded}
        >
          <Icon name={isExpanded ? 'compress' : 'expand'} size="sm" />
        </button>
      </Tooltip>
    </div>
  );
}
