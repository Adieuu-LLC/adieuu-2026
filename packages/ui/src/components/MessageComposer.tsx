/**
 * MessageComposer Component
 *
 * A text input component for composing and sending encrypted DM messages.
 * Supports:
 * - Multi-line input with auto-resize
 * - Send on Enter (Shift+Enter for new line)
 * - Character limit
 * - Loading/disabled states
 */

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

const MAX_MESSAGE_LENGTH = 4000;
const MIN_ROWS = 1;
const MAX_ROWS = 6;

export interface MessageComposerProps {
  /** Callback when message is submitted */
  onSend: (text: string) => void;
  /** Whether the send operation is in progress */
  isSending?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional class name */
  className?: string;
}

export function MessageComposer({
  onSend,
  isSending = false,
  disabled = false,
  placeholder,
  className = '',
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDisabled = disabled || isSending;
  const canSend = text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH && !isDisabled;

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const maxHeight = lineHeight * MAX_ROWS;
    const minHeight = lineHeight * MIN_ROWS;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      if (newText.length <= MAX_MESSAGE_LENGTH) {
        setText(newText);
        requestAnimationFrame(adjustHeight);
      }
    },
    [adjustHeight]
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const trimmedText = text.trim();
    onSend(trimmedText);
    setText('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [canSend, text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const remainingChars = MAX_MESSAGE_LENGTH - text.length;
  const showCharCount = remainingChars < 500;

  return (
    <div className={`message-composer ${className}`}>
      <div className="message-composer-input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('messages.composerPlaceholder')}
          disabled={isDisabled}
          className="message-composer-textarea"
          rows={MIN_ROWS}
          aria-label={t('messages.composerAriaLabel')}
        />
        {showCharCount && (
          <span
            className={`message-composer-char-count ${remainingChars < 100 ? 'message-composer-char-count--warning' : ''}`}
          >
            {remainingChars}
          </span>
        )}
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={handleSend}
        disabled={!canSend || isSending}
        className="message-composer-send-btn"
        aria-label={t('messages.send')}
      >
        {isSending ? '...' : t('messages.send')}
      </Button>
    </div>
  );
}
