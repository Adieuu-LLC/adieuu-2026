import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import type { AppIconName } from '../../icons/Icon';
import type { CallMediaOptions } from '../../services/callService';

export interface ConversationCallButtonProps {
  audioAllowed: boolean;
  videoAllowed: boolean;
  screenshareAllowed: boolean;
  disabled: boolean;
  disabledReason?: string;
  inCallForThisConversation: boolean;
  onStartCall: (media: CallMediaOptions) => void;
  onFocusOverlay?: () => void;
}

const VOICE_MEDIA: CallMediaOptions = { audio: true, video: false, screenshare: false };
const VIDEO_MEDIA: CallMediaOptions = { audio: true, video: true, screenshare: false };
const SCREENSHARE_MEDIA: CallMediaOptions = { audio: false, video: false, screenshare: true };

export function ConversationCallButton({
  audioAllowed,
  videoAllowed,
  screenshareAllowed,
  disabled,
  disabledReason,
  inCallForThisConversation,
  onStartCall,
  onFocusOverlay,
}: ConversationCallButtonProps) {
  const { t } = useTranslation();

  const allowedTypes = useMemo(() => {
    const types: Array<{ label: string; media: CallMediaOptions; icon: AppIconName }> = [];
    if (audioAllowed) {
      types.push({ label: t('call.startVoiceCall'), media: VOICE_MEDIA, icon: 'phone' });
    }
    if (videoAllowed) {
      types.push({ label: t('call.startVideoCall'), media: VIDEO_MEDIA, icon: 'video' });
    }
    if (screenshareAllowed) {
      types.push({ label: t('call.startScreenshare'), media: SCREENSHARE_MEDIA, icon: 'screenShare' });
    }
    return types;
  }, [audioAllowed, videoAllowed, screenshareAllowed, t]);

  if (allowedTypes.length === 0) return null;

  const primaryAction = allowedTypes[0]!;
  const hasMenu = allowedTypes.length > 1;

  const handlePrimaryClick = () => {
    if (inCallForThisConversation && onFocusOverlay) {
      onFocusOverlay();
      return;
    }
    onStartCall(primaryAction.media);
  };

  const buttonContent = (
    <div className={`call-toolbar-btn${hasMenu ? '' : ' call-toolbar-btn--single'}${inCallForThisConversation ? ' call-toolbar-btn--in-call' : ''}`}>
      <button
        type="button"
        className="call-toolbar-btn__primary"
        onClick={handlePrimaryClick}
        disabled={disabled && !inCallForThisConversation}
        aria-label={
          inCallForThisConversation
            ? t('call.active')
            : primaryAction.label
        }
        title={
          inCallForThisConversation
            ? t('call.active')
            : primaryAction.label
        }
      >
        <Icon name={primaryAction.icon} size="sm" />
      </button>
      {hasMenu && (
        <Menu.Root positioning={{ placement: 'bottom-end', gutter: 4 }}>
          <Menu.Trigger asChild>
            <button
              type="button"
              className="call-toolbar-btn__chevron"
              disabled={disabled}
              aria-label={t('call.callMenuAriaLabel')}
              aria-haspopup="menu"
            >
              <Icon name="chevronDown" size="sm" />
            </button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content className="dm-context-menu call-toolbar-menu">
                {allowedTypes.map((item) => (
                  <Menu.Item
                    key={item.icon}
                    value={item.icon}
                    className="dm-context-menu-item call-toolbar-menu-item"
                    disabled={disabled}
                    onClick={() => onStartCall(item.media)}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </div>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip content={disabledReason} position="bottom">
        {buttonContent}
      </Tooltip>
    );
  }

  return buttonContent;
}
