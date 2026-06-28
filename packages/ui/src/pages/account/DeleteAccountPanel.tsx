import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { OtpInput } from '../../components/OtpInput';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../../config';

type DeletionStep = 'idle' | 'confirm' | 'otp' | 'final';

const RESEND_COOLDOWN_SECONDS = 60;

export function DeleteAccountPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [step, setStep] = useState<DeletionStep>('idle');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleDeleteClick = () => {
    setStep('confirm');
    setError(null);
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.accountData.requestDeletion();
      if (response.success) {
        setError(null);
        setStep('otp');
        startResendCooldown();
      } else {
        setError(t('account.security.deleteAccount.error'));
      }
    } catch {
      setError(t('account.security.deleteAccount.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      const response = await api.accountData.requestDeletion();
      if (response.success) {
        startResendCooldown();
        setOtpValue('');
        setOtpError(false);
      }
    } catch {
      // Silent failure on resend
    }
  };

  const resetFlow = useCallback(() => {
    setStep('idle');
    setOtpValue('');
    setOtpError(false);
    setError(null);
    setLoading(false);
    setResendCooldown(0);
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, []);

  const handleOtpComplete = (code: string) => {
    setOtpValue(code);
    setOtpError(false);
    setStep('final');
  };

  const handleFinalConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.accountData.confirmDeletion(otpValue);
      if (response.success) {
        navigate('/', { replace: true });
      } else {
        setOtpError(true);
        setStep('otp');
        setOtpValue('');
        setError(t('account.security.deleteAccount.codeError'));
      }
    } catch {
      setOtpError(true);
      setStep('otp');
      setOtpValue('');
      setError(t('account.security.deleteAccount.codeError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="delete-account-panel">
      <div className="delete-account-header">
        <h3>{t('account.security.deleteAccount.title')}</h3>
        <p>{t('account.security.deleteAccount.description')}</p>
      </div>

      <div className="delete-account-warnings">
        <div className="delete-account-warning-card">
          <p>{t('account.security.deleteAccount.warning')}</p>
          <p className="delete-account-warning-emphasis">
            {t('account.security.deleteAccount.warningRemoveContent')}
          </p>
        </div>
      </div>

      {error && step !== 'confirm' && (
        <div className="delete-account-error">
          <p>{error}</p>
        </div>
      )}

      {(step === 'idle' || step === 'final') && (
        <Button
          variant="primary"
          className="btn-danger"
          onClick={handleDeleteClick}
        >
          {t('account.security.deleteAccount.deleteButton')}
        </Button>
      )}

      {step === 'otp' && (
        <div className="delete-account-otp">
          <h4>{t('account.security.deleteAccount.otpTitle')}</h4>
          <p>{t('account.security.deleteAccount.otpDescription')}</p>
          <OtpInput
            value={otpValue}
            onChange={setOtpValue}
            onComplete={handleOtpComplete}
            error={otpError}
            autoFocus
          />
          <div className="delete-account-otp-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResend}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0
                ? t('account.security.deleteAccount.otpResendCooldown', { seconds: resendCooldown })
                : t('account.security.deleteAccount.otpResend')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={resetFlow}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: First confirmation dialog */}
      <ConfirmDialog
        open={step === 'confirm'}
        onOpenChange={(open) => { if (!open && !loading) resetFlow(); }}
        title={t('account.security.deleteAccount.confirmTitle')}
        description={t('account.security.deleteAccount.confirmDescription')}
        confirmLabel={t('account.security.deleteAccount.confirmButton')}
        variant="danger"
        loading={loading}
        onConfirm={handleConfirm}
        closeOnInteractOutside={false}
      >
        <p className="confirm-dialog-extra">
          {t('account.security.deleteAccount.confirmSendCode')}
        </p>
        {error && (
          <p className="delete-account-dialog-error">{error}</p>
        )}
      </ConfirmDialog>

      {/* Step 4: Final confirmation dialog */}
      <ConfirmDialog
        open={step === 'final'}
        onOpenChange={(open) => { if (!open && !loading) resetFlow(); }}
        title={t('account.security.deleteAccount.finalTitle')}
        description={t('account.security.deleteAccount.finalDescription')}
        confirmLabel={loading
          ? t('account.security.deleteAccount.deleting')
          : t('account.security.deleteAccount.finalButton')}
        variant="danger"
        loading={loading}
        onConfirm={handleFinalConfirm}
      />
    </div>
  );
}
