/**
 * MessageComposer Component
 *
 * A text input component for composing and sending encrypted DM messages.
 * Supports:
 * - Multi-line input with auto-resize
 * - Send on Enter (Shift+Enter for new line)
 * - Character limit
 * - Loading/disabled states
 * - TTL (time-to-live) selector for ephemeral messages
 */

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Popover } from './Popover';
import { EmojiPicker } from './EmojiPicker';
import { SmileIcon } from './Icons';
import { Tooltip } from './Tooltip';

const MAX_MESSAGE_LENGTH = 4000;
const MIN_ROWS = 1;
const MAX_ROWS = 6;

/**
 * TTL options in seconds. null means no expiry (default).
 */
export type TtlOption = number | null;

export const TTL_OPTIONS: { value: TtlOption; labelKey: string }[] = [
  { value: null, labelKey: 'messages.ttl.never' },
  { value: 30, labelKey: 'messages.ttl.30s' },
  { value: 60, labelKey: 'messages.ttl.60s' },
  { value: 180, labelKey: 'messages.ttl.3m' },
  { value: 300, labelKey: 'messages.ttl.5m' },
  { value: 600, labelKey: 'messages.ttl.10m' },
  { value: 1800, labelKey: 'messages.ttl.30m' },
  { value: 3600, labelKey: 'messages.ttl.1h' },
  { value: 21600, labelKey: 'messages.ttl.6h' },
  { value: 86400, labelKey: 'messages.ttl.1d' },
  { value: 259200, labelKey: 'messages.ttl.3d' },
  { value: 604800, labelKey: 'messages.ttl.1w' },
];

export interface SendMessageData {
  /** Message text */
  text: string;
  /** TTL in seconds (null for no expiry) */
  expiresInSeconds: TtlOption;
  /** Whether forward secrecy wrapping is enabled for this message */
  forwardSecrecy: boolean;
}

export interface MessageComposerProps {
  /** Callback when message is submitted */
  onSend: (data: SendMessageData) => void;
  /** Whether the send operation is in progress */
  isSending?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional class name */
  className?: string;
  /** Whether to show TTL selector (default: true) */
  showTtlSelector?: boolean;
  /** Whether to show forward secrecy toggle (default: true) */
  showForwardSecrecyToggle?: boolean;
  /** Default forward secrecy state when no stored preference exists */
  forwardSecrecyDefault?: boolean;
  /** Optional localStorage key used to persist forward secrecy preference */
  forwardSecrecyStorageKey?: string;
}

function loadForwardSecrecyPreference(
  storageKey: string | undefined,
  fallback: boolean
): boolean {
  if (!storageKey || typeof localStorage === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

function saveForwardSecrecyPreference(
  storageKey: string | undefined,
  value: boolean
): void {
  if (!storageKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore storage failures (private browsing, quota, etc.).
  }
}

export function MessageComposer({
  onSend,
  isSending = false,
  disabled = false,
  placeholder,
  className = '',
  showTtlSelector = true,
  showForwardSecrecyToggle = true,
  forwardSecrecyDefault = true,
  forwardSecrecyStorageKey,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [selectedTtl, setSelectedTtl] = useState<TtlOption>(null);
  const [forwardSecrecy, setForwardSecrecy] = useState<boolean>(() =>
    loadForwardSecrecyPreference(forwardSecrecyStorageKey, forwardSecrecyDefault)
  );
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
    onSend({
      text: trimmedText,
      expiresInSeconds: selectedTtl,
      forwardSecrecy,
    });
    setText('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [canSend, text, selectedTtl, forwardSecrecy, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleTtlSelect = useCallback((ttl: TtlOption) => {
    setSelectedTtl(ttl);
  }, []);

  const handleForwardSecrecyToggle = useCallback(() => {
    setForwardSecrecy((prev) => {
      const next = !prev;
      saveForwardSecrecyPreference(forwardSecrecyStorageKey, next);
      return next;
    });
  }, [forwardSecrecyStorageKey]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        const newText = text + emoji;
        if (newText.length <= MAX_MESSAGE_LENGTH) {
          setText(newText);
        }
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      if (newText.length <= MAX_MESSAGE_LENGTH) {
        setText(newText);
        requestAnimationFrame(() => {
          const cursorPos = start + emoji.length;
          textarea.selectionStart = cursorPos;
          textarea.selectionEnd = cursorPos;
          textarea.focus();
          adjustHeight();
        });
      }
    },
    [text, adjustHeight]
  );

  const selectedTtlOption = TTL_OPTIONS.find((opt) => opt.value === selectedTtl) ?? TTL_OPTIONS[0];

  const remainingChars = MAX_MESSAGE_LENGTH - text.length;
  const showCharCount = remainingChars < 500;

  return (
    <div className={`message-composer ${className}`}>
      {(showTtlSelector || showForwardSecrecyToggle) && (
        <div className="message-composer-toolbar">
          {showTtlSelector && (
            <Popover
              trigger={
                <button
                  type="button"
                  className={`message-composer-ttl-btn ${selectedTtl !== null ? 'message-composer-ttl-btn--active' : ''}`}
                  aria-label={t('messages.ttl.select')}
                  disabled={isDisabled}
                >
                  <span className="message-composer-ttl-icon">&#128337;</span>
                  <span className="message-composer-ttl-label">
                    {t(selectedTtlOption?.labelKey ?? 'messages.ttl.never')}
                  </span>
                </button>
              }
              positioning={{ placement: 'top-start' }}
            >
              <div className="message-composer-ttl-menu">
                <div className="message-composer-ttl-menu-header">
                  {t('messages.ttl.header')}
                </div>
                {TTL_OPTIONS.map((option) => (
                  <button
                    key={option.value ?? 'never'}
                    type="button"
                    className={`message-composer-ttl-option ${selectedTtl === option.value ? 'message-composer-ttl-option--selected' : ''}`}
                    onClick={() => handleTtlSelect(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </Popover>
          )}
          <Popover
            trigger={
              <button
                type="button"
                className="message-composer-emoji-btn"
                aria-label={t('messages.emoji.select')}
                disabled={isDisabled}
              >
                <Tooltip content={t('messages.emoji.select')} position="top">
                  <SmileIcon className="message-composer-emoji-icon" />
                </Tooltip>
              </button>
            }
            positioning={{ placement: 'top-start' }}
            className="emoji-picker-popover"
          >
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
          </Popover>
          {showForwardSecrecyToggle && (
            <button
              type="button"
              className={`message-composer-fs-btn ${forwardSecrecy ? 'message-composer-fs-btn--active' : ''}`}
              onClick={handleForwardSecrecyToggle}
              aria-label={t('messages.fs.toggle')}
              title={forwardSecrecy ? t('messages.fs.enabledHint') : t('messages.fs.disabledHint')}
              disabled={isDisabled}
            >
              <span className="message-composer-fs-label">
                {forwardSecrecy ? t('messages.fs.enabled') : t('messages.fs.disabled')}
              </span>
            </button>
          )}
        </div>
      )}
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
