/**
 * Call control bar for managing audio, video, screenshare, and call lifecycle.
 * Each media button includes a device-selection popover (chevron).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover as ArkPopover, Portal } from '@ark-ui/react';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';
import { enumerateMediaDevices, type MediaDeviceInfo } from '../../hooks/useCallMedia';

export interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreensharing: boolean;
  audioAllowed: boolean;
  videoAllowed: boolean;
  screenshareAllowed: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenshare: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  onSwitchAudioInput?: (deviceId: string) => void;
  onSwitchAudioOutput?: (deviceId: string) => void;
  onSwitchVideoInput?: (deviceId: string) => void;
}

function DevicePopover({
  open,
  onOpenChange,
  ariaLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <ArkPopover.Root
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      positioning={{ placement: 'top', gutter: 8 }}
    >
      <ArkPopover.Trigger asChild>
        <button
          type="button"
          className="call-control-device-trigger"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          <Icon name="chevronUp" size="xs" />
        </button>
      </ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner>
          <ArkPopover.Content className="call-device-popover">
            {children}
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}

export function CallControls({
  isAudioEnabled,
  isVideoEnabled,
  isScreensharing,
  audioAllowed,
  videoAllowed,
  screenshareAllowed,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenshare,
  onLeave,
  onEnd,
  onSwitchAudioInput,
  onSwitchAudioOutput,
  onSwitchVideoInput,
}: CallControlsProps) {
  const { t } = useTranslation();

  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await enumerateMediaDevices();
      setDevices(list);
    } catch {
      // Best-effort
    }
  }, []);

  useEffect(() => {
    if (audioPopoverOpen || videoPopoverOpen) {
      void refreshDevices();
    }
  }, [audioPopoverOpen, videoPopoverOpen, refreshDevices]);

  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');

  const audioLabel = isAudioEnabled
    ? t('call.muteAudio', 'Mute')
    : t('call.unmuteAudio', 'Unmute');
  const videoLabel = isVideoEnabled
    ? t('call.disableVideo', 'Turn off camera')
    : t('call.enableVideo', 'Turn on camera');
  const screenshareLabel = isScreensharing
    ? t('call.stopScreenshare', 'Stop sharing')
    : t('call.startScreenshareControl', 'Share screen');
  const leaveLabel = t('call.leave', 'Leave call');

  return (
    <div className="call-controls">
      {audioAllowed && (
        <div className="call-control-group">
          <Button
            variant="ghost"
            size="sm"
            className={`call-control-btn ${isAudioEnabled ? '' : 'call-control-btn--muted'}`}
            onClick={onToggleAudio}
            title={audioLabel}
            aria-label={audioLabel}
            aria-pressed={isAudioEnabled}
          >
            <Icon name={isAudioEnabled ? 'microphone' : 'microphoneSlash'} />
          </Button>
          {(onSwitchAudioInput || onSwitchAudioOutput) && (
            <DevicePopover
              open={audioPopoverOpen}
              onOpenChange={setAudioPopoverOpen}
              ariaLabel={t('call.audioDevices', 'Audio devices')}
            >
              {onSwitchAudioInput && audioInputs.length > 0 && (
                <div className="call-device-popover__section">
                  <span className="call-device-popover__heading">
                    {t('call.selectMicrophone', 'Microphone')}
                  </span>
                  {audioInputs.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      className="call-device-popover__item"
                      onClick={() => {
                        onSwitchAudioInput(d.deviceId);
                        setAudioPopoverOpen(false);
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
              {onSwitchAudioOutput && audioOutputs.length > 0 && (
                <div className="call-device-popover__section">
                  <span className="call-device-popover__heading">
                    {t('call.selectSpeaker', 'Speaker')}
                  </span>
                  {audioOutputs.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      className="call-device-popover__item"
                      onClick={() => {
                        onSwitchAudioOutput(d.deviceId);
                        setAudioPopoverOpen(false);
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </DevicePopover>
          )}
        </div>
      )}

      {videoAllowed && (
        <div className="call-control-group">
          <Button
            variant="ghost"
            size="sm"
            className={`call-control-btn ${isVideoEnabled ? '' : 'call-control-btn--muted'}`}
            onClick={onToggleVideo}
            title={videoLabel}
            aria-label={videoLabel}
            aria-pressed={isVideoEnabled}
          >
            <Icon name={isVideoEnabled ? 'video' : 'videoSlash'} />
          </Button>
          {onSwitchVideoInput && (
            <DevicePopover
              open={videoPopoverOpen}
              onOpenChange={setVideoPopoverOpen}
              ariaLabel={t('call.videoDevices', 'Video devices')}
            >
              {videoInputs.length > 0 && (
                <div className="call-device-popover__section">
                  <span className="call-device-popover__heading">
                    {t('call.selectCamera', 'Camera')}
                  </span>
                  {videoInputs.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      className="call-device-popover__item"
                      onClick={() => {
                        onSwitchVideoInput(d.deviceId);
                        setVideoPopoverOpen(false);
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </DevicePopover>
          )}
        </div>
      )}

      {screenshareAllowed && (
        <Button
          variant="ghost"
          size="sm"
          className={`call-control-btn ${isScreensharing ? 'call-control-btn--active' : ''}`}
          onClick={onToggleScreenshare}
          title={screenshareLabel}
          aria-label={screenshareLabel}
          aria-pressed={isScreensharing}
        >
          <Icon name="screenShare" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="call-control-btn call-control-btn--leave"
        onClick={onLeave}
        title={leaveLabel}
        aria-label={leaveLabel}
      >
        <Icon name="phoneHangup" />
      </Button>

      {onEnd && (
        <Button
          variant="ghost"
          size="sm"
          className="call-control-btn call-control-btn--end"
          onClick={onEnd}
          title={t('call.end', 'End call for everyone')}
          aria-label={t('call.end', 'End call for everyone')}
        >
          <Icon name="phoneHangup" />
          <span className="call-control-label">{t('call.endForAll', 'End')}</span>
        </Button>
      )}
    </div>
  );
}
