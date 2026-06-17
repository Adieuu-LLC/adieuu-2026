import { useTranslation } from 'react-i18next';
import {
  DisconnectButton,
  MediaDeviceMenu,
  TrackToggle,
  useTrackToggle,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Icon } from '../../icons/Icon';
import { Tooltip } from '../Tooltip';

export interface CallConferenceControlBarProps {
  isMobile?: boolean;
  isExpanded?: boolean;
  onToggleFullscreen?: () => void;
}

function MicControlGroup() {
  const { t } = useTranslation();
  const { enabled } = useTrackToggle({ source: Track.Source.Microphone });
  const tooltip = enabled ? t('call.tooltipMicOn') : t('call.tooltipMicOff');

  return (
    <Tooltip content={tooltip} position="top">
      <div className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone} showIcon />
        <MediaDeviceMenu kind="audioinput" />
      </div>
    </Tooltip>
  );
}

function CameraControlGroup() {
  const { t } = useTranslation();
  const { enabled } = useTrackToggle({ source: Track.Source.Camera });
  const tooltip = enabled ? t('call.tooltipCameraOn') : t('call.tooltipCameraOff');

  return (
    <Tooltip content={tooltip} position="top">
      <div className="lk-button-group">
        <TrackToggle source={Track.Source.Camera} showIcon />
        <MediaDeviceMenu kind="videoinput" />
      </div>
    </Tooltip>
  );
}

function ScreenShareControl() {
  const { t } = useTranslation();
  const { enabled } = useTrackToggle({ source: Track.Source.ScreenShare });
  const tooltip = enabled ? t('call.tooltipScreenOn') : t('call.tooltipScreenOff');

  return (
    <Tooltip content={tooltip} position="top">
      <TrackToggle source={Track.Source.ScreenShare} showIcon captureOptions={{ audio: true }} />
    </Tooltip>
  );
}

function FullscreenControl({
  isExpanded,
  onToggleFullscreen,
}: {
  isExpanded: boolean;
  onToggleFullscreen: () => void;
}) {
  const { t } = useTranslation();
  const tooltip = isExpanded ? t('call.exitFullscreen') : t('call.expandFullscreen');
  const ariaLabel = isExpanded ? t('call.exitFullscreenLabel') : t('call.expandFullscreenLabel');

  return (
    <Tooltip content={tooltip} position="top">
      <button
        type="button"
        className="lk-button call-conference__controls-fullscreen"
        onClick={() => void onToggleFullscreen()}
        aria-label={ariaLabel}
        aria-pressed={isExpanded}
      >
        <Icon name={isExpanded ? 'compress' : 'expand'} size="sm" />
      </button>
    </Tooltip>
  );
}

function LeaveControl() {
  const { t } = useTranslation();

  return (
    <Tooltip content={t('call.tooltipLeave')} position="top">
      <DisconnectButton>{t('call.leave')}</DisconnectButton>
    </Tooltip>
  );
}

export function CallConferenceControlBar({
  isMobile = false,
  isExpanded = false,
  onToggleFullscreen,
}: CallConferenceControlBarProps) {
  const controlClass = [
    'lk-control-bar',
    'call-conference__controls-bar',
    isMobile ? 'call-conference__controls-bar--minimal' : 'call-conference__controls-bar--verbose',
  ].join(' ');

  return (
    <div className={controlClass}>
      <MicControlGroup />
      <CameraControlGroup />
      <ScreenShareControl />
      {onToggleFullscreen && (
        <FullscreenControl
          isExpanded={isExpanded}
          onToggleFullscreen={onToggleFullscreen}
        />
      )}
      <LeaveControl />
    </div>
  );
}
