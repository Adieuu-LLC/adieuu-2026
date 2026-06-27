/**
 * Full-screen overlay displayed during an active call.
 * Contains the participant grid and call controls.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CallControls, type CallControlsProps } from './CallControls';
import { CallParticipantGrid, type CallParticipantInfo } from './CallParticipantGrid';
import { Spinner } from '../Spinner';

export interface CallOverlayProps {
  status: 'ringing' | 'active' | 'connecting';
  participants: CallParticipantInfo[];
  localIdentityId: string;
  controls: CallControlsProps;
  conversationName?: string;
  onMinimize?: () => void;
}

export function CallOverlay({
  status,
  participants,
  localIdentityId,
  controls,
  conversationName,
  onMinimize,
}: CallOverlayProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    requestAnimationFrame(() => {
      const first = overlayRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !overlayRef.current) return;
      const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('call.overlayLabel', 'Active call')}
    >
      <div className="call-overlay-header">
        <div className="call-overlay-title">
          {conversationName && (
            <span className="call-overlay-conversation-name">{conversationName}</span>
          )}
          <span className="call-overlay-status">
            {status === 'ringing' && t('call.ringing', 'Ringing...')}
            {status === 'connecting' && t('call.connecting', 'Connecting...')}
            {status === 'active' && t('call.active', 'In call')}
          </span>
        </div>
        {onMinimize && (
          <button
            className="call-overlay-minimize"
            type="button"
            onClick={onMinimize}
            title={t('call.minimize', 'Minimize')}
          >
            <span aria-hidden>&#x2012;</span>
          </button>
        )}
      </div>

      <div className="call-overlay-body">
        {status === 'connecting' ? (
          <div className="call-overlay-connecting">
            <Spinner />
            <p>{t('call.connectingMessage', 'Setting up encrypted connection...')}</p>
          </div>
        ) : (
          <CallParticipantGrid
            participants={participants}
            localIdentityId={localIdentityId}
          />
        )}
      </div>

      <div className="call-overlay-footer">
        <CallControls {...controls} />
      </div>
    </div>
  );
}
