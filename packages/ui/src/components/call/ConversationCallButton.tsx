import { useTranslation } from 'react-i18next';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';

export interface ConversationCallButtonProps {
  disabled: boolean;
  disabledReason?: string;
  inCallForThisConversation: boolean;
  onStartCall: () => void;
  onFocusOverlay?: () => void;
}

export function ConversationCallButton({
  disabled,
  disabledReason,
  inCallForThisConversation,
  onStartCall,
  onFocusOverlay,
}: ConversationCallButtonProps) {
  const { t } = useTranslation();

  const handleClick = () => {
    if (inCallForThisConversation) {
      if (onFocusOverlay) onFocusOverlay();
      return;
    }
    onStartCall();
  };

  const label = inCallForThisConversation
    ? t('call.active')
    : t('call.startCall');

  const buttonContent = (
    <div className={`call-toolbar-btn call-toolbar-btn--single${inCallForThisConversation ? ' call-toolbar-btn--in-call' : ''}`}>
      <button
        type="button"
        className="call-toolbar-btn__primary"
        onClick={handleClick}
        disabled={disabled && !inCallForThisConversation}
        aria-label={label}
        title={label}
      >
        <Icon name="phone" size="sm" />
      </button>
    </div>
  );

  if (disabled && !inCallForThisConversation && disabledReason) {
    return (
      <Tooltip content={disabledReason} position="bottom">
        {buttonContent}
      </Tooltip>
    );
  }

  return buttonContent;
}
