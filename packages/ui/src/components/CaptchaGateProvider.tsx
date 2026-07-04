/**
 * Captcha gate provider for per-action captcha challenges.
 *
 * Exposes `requestCaptcha()` via context, which shows a dismissable captcha
 * dialog and resolves with the FriendlyCaptcha response token. Hooks and
 * components that need to attach a captcha response to an API call can use
 * this without managing their own dialog state.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { registerCaptchaHandler, clearCaptchaHandler } from '@adieuu/shared';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useAppConfig } from '../config';
import { FriendlyCaptcha } from './FriendlyCaptcha';
import { Button } from './Button';

interface CaptchaGateContextValue {
  requestCaptcha: () => Promise<string | null>;
}

const CaptchaGateContext = createContext<CaptchaGateContextValue | null>(null);

export function CaptchaGateProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { friendlyCaptchaSitekey } = useAppConfig();
  const [open, setOpen] = useState(false);
  const [captchaResponse, setCaptchaResponse] = useState<string | null>(null);

  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const effectiveSitekey = friendlyCaptchaSitekey || session?.captchaSitekey;

  const requestCaptcha = useCallback((): Promise<string | null> => {
    if (!effectiveSitekey) {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      if (resolveRef.current) {
        resolveRef.current(null);
      }
      resolveRef.current = resolve;
      setCaptchaResponse(null);
      setOpen(true);
    });
  }, [effectiveSitekey]);

  useEffect(() => {
    registerCaptchaHandler(requestCaptcha);
    return () => clearCaptchaHandler();
  }, [requestCaptcha]);

  const handleComplete = useCallback((response: string) => {
    setCaptchaResponse(response);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!captchaResponse) return;
    setOpen(false);
    resolveRef.current?.(captchaResponse);
    resolveRef.current = null;
  }, [captchaResponse]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, []);

  return (
    <CaptchaGateContext.Provider value={{ requestCaptcha }}>
      {children}
      {effectiveSitekey && (
        <Dialog.Root
          open={open}
          onOpenChange={(e) => { if (!e.open) handleCancel(); }}
          lazyMount
          unmountOnExit
        >
          <Portal>
            <Dialog.Backdrop className="confirm-dialog-backdrop" />
            <Dialog.Positioner className="confirm-dialog-positioner">
              <Dialog.Content className="captcha-gate-dialog-content">
                <Dialog.Title className="captcha-gate-dialog-title">
                  {t('captcha.gateTitle')}
                </Dialog.Title>
                <Dialog.Description className="captcha-gate-dialog-description">
                  {t('captcha.gateDescription')}
                </Dialog.Description>

                <div className="captcha-interstitial-widget">
                  <FriendlyCaptcha
                    sitekey={effectiveSitekey}
                    onComplete={handleComplete}
                  />
                </div>

                <div className="captcha-gate-dialog-actions">
                  <Button variant="ghost" onClick={handleCancel}>
                    {t('captcha.gateCancel')}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!captchaResponse}
                    onClick={handleSubmit}
                  >
                    {t('captcha.gateSubmit')}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      )}
    </CaptchaGateContext.Provider>
  );
}

export function useCaptchaGate(): CaptchaGateContextValue {
  const ctx = useContext(CaptchaGateContext);
  if (!ctx) {
    return { requestCaptcha: () => Promise.resolve(null) };
  }
  return ctx;
}
