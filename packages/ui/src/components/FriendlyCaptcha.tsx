/**
 * FriendlyCaptcha widget component for free-tier bot prevention.
 *
 * Renders the FriendlyCaptcha puzzle widget using the global endpoint.
 * Only shown to free-tier users. Exposes the captcha response token
 * via a callback when the challenge is completed.
 */

import { useEffect, useRef, useState } from 'react';
import { FriendlyCaptchaSDK, type WidgetHandle } from '@friendlycaptcha/sdk';
import { useTranslation } from '../i18n';

let sharedSdk: FriendlyCaptchaSDK | null = null;

function getSdk(): FriendlyCaptchaSDK {
  if (!sharedSdk) {
    sharedSdk = new FriendlyCaptchaSDK({ startAgent: true, apiEndpoint: 'global' });
  }
  return sharedSdk;
}

export interface FriendlyCaptchaProps {
  sitekey: string;
  onComplete: (response: string) => void;
  onError?: () => void;
  /** Additional class name for the container */
  className?: string;
}

export function FriendlyCaptcha({
  sitekey,
  onComplete,
  onError,
  className,
}: FriendlyCaptchaProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const [ready, setReady] = useState(false);

  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    completedRef.current = false;
    const sdk = getSdk();

    const widget: WidgetHandle = sdk.createWidget({
      element: el,
      sitekey,
      theme: 'dark',
    });

    widget.addEventListener('frc:widget.complete', (event) => {
      completedRef.current = true;
      setReady(true);
      onCompleteRef.current(event.detail.response);
    });

    widget.addEventListener('frc:widget.error', () => {
      if (completedRef.current) return;
      onErrorRef.current?.();
    });

    return () => {
      widget.destroy();
    };
  }, [sitekey]);

  return (
    <div className={`friendly-captcha-container ${className ?? ''}`}>
      <div ref={containerRef} className="frc-captcha" />
      {!ready && (
        <p className="friendly-captcha-note">
          {t('captcha.freeTierNote')}
        </p>
      )}
    </div>
  );
}
