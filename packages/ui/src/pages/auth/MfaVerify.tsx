import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthLayout } from '../../components/AuthLayout';
import { OtpInput } from '../../components/OtpInput';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { LegalAgreementNotice } from '../../components/LegalAgreementNotice';
import { AccountRestrictionPanel } from '../../components/AccountRestrictionPanel';
import { useAuth, type MfaChallenge } from '../../hooks/useAuth';
import type { AccountRestrictionInfo } from '../../services/authRestrictionFlow';

interface LocationState {
  mfaChallenge?: MfaChallenge;
  identifier?: string;
}

type MfaMethod = 'totp' | 'webauthn';

export function MfaVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeMfaTotp, completeMfaWebAuthn, status } = useAuth();

  const state = location.state as LocationState | null;
  const mfaChallenge = state?.mfaChallenge;

  const [method, setMethod] = useState<MfaMethod | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restriction, setRestriction] = useState<AccountRestrictionInfo | null>(null);

  // Redirect if no MFA challenge
  useEffect(() => {
    if (!mfaChallenge) {
      navigate('/auth/login', { replace: true });
      return;
    }

    // Auto-select method based on available options
    if (mfaChallenge.mfaOptions.webauthn && mfaChallenge.webauthnChallenge) {
      setMethod('webauthn');
    } else if (mfaChallenge.mfaOptions.totp) {
      setMethod('totp');
    }
  }, [mfaChallenge, navigate]);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated' || status === 'identity_mode') {
      navigate('/', { replace: true });
    }
  }, [status, navigate]);

  // Auto-trigger WebAuthn when selected
  useEffect(() => {
    if (method === 'webauthn' && mfaChallenge?.webauthnChallenge && !isLoading) {
      handleWebAuthn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const handleWebAuthn = async () => {
    if (!mfaChallenge?.webauthnChallenge) {
      setError('WebAuthn is not available');
      return;
    }

    // Debug: log what we're sending to WebAuthn
    console.log('[MFA Debug] WebAuthn challenge:', {
      rpId: mfaChallenge.webauthnChallenge.rpId,
      challenge: mfaChallenge.webauthnChallenge.challenge?.substring(0, 20),
      allowCredentialsCount: mfaChallenge.webauthnChallenge.allowCredentials?.length,
      allowCredentials: mfaChallenge.webauthnChallenge.allowCredentials,
    });

    setError(null);
    setIsLoading(true);

    const result = await completeMfaWebAuthn(mfaChallenge.mfaToken, mfaChallenge.webauthnChallenge);

    setIsLoading(false);

    if (!result.success) {
      if (result.restriction) {
        setRestriction(result.restriction);
        return;
      }
      setError(result.error ?? 'WebAuthn verification failed');
      return;
    }

    navigate('/', { replace: true });
  };

  const handleTotpSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6 || !mfaChallenge || isLoading) return; // Prevent multiple submissions

    setError(null);
    setIsLoading(true);

    const result = await completeMfaTotp(mfaChallenge.mfaToken, code);

    setIsLoading(false);

    if (!result.success) {
      if (result.restriction) {
        setRestriction(result.restriction);
        return;
      }
      setError(result.error ?? 'Invalid code');
      setCode('');
      return;
    }

    navigate('/', { replace: true });
  };

  const handleTotpComplete = (value: string) => {
    setCode(value);
    // Auto-submit when code is complete (skip if already loading)
    if (value.length === 6 && mfaChallenge && !isLoading) {
      setIsLoading(true);
      setTimeout(() => {
        completeMfaTotp(mfaChallenge.mfaToken, value).then((result) => {
          setIsLoading(false);
          if (!result.success) {
            if (result.restriction) {
              setRestriction(result.restriction);
              return;
            }
            setError(result.error ?? 'Invalid code');
            setCode('');
          } else {
            navigate('/', { replace: true });
          }
        });
      }, 100);
    }
  };

  if (!mfaChallenge) {
    return null;
  }

  if (restriction) {
    return (
      <AuthLayout>
        <AccountRestrictionPanel info={restriction} />
      </AuthLayout>
    );
  }

  const availableMethods: { key: MfaMethod; label: string; available: boolean }[] = [
    { key: 'webauthn', label: 'Passkey / Security Key', available: mfaChallenge.mfaOptions.webauthn && !!mfaChallenge.webauthnChallenge },
    { key: 'totp', label: 'Authenticator App', available: mfaChallenge.mfaOptions.totp },
  ];

  const showMethodSelector = availableMethods.filter(m => m.available).length > 1;

  return (
    <AuthLayout
      title="Two-factor authentication"
      subtitle="Verify your identity to continue"
    >
      <Card variant="elevated" className="slide-up stagger-2">
        {error && (
          <Alert variant="error" className="fade-in" style={{ marginBottom: 'var(--spacing-md)' }}>
            {error}
          </Alert>
        )}

        {/* Method Selector */}
        {showMethodSelector && (
          <div className="mfa-method-selector" style={{ marginBottom: 'var(--spacing-lg)' }}>
            {availableMethods.filter(m => m.available).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant={method === key ? 'primary' : 'ghost'}
                onClick={() => {
                  setMethod(key);
                  setError(null);
                  setCode('');
                }}
                disabled={isLoading}
                style={{ marginRight: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        {/* WebAuthn Method */}
        {method === 'webauthn' && (
          <div className="mfa-webauthn">
            <p style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
              {isLoading ? 'Waiting for your security key...' : 'Use your passkey or security key to verify'}
            </p>
            <Button
              type="button"
              variant="primary"
              className="btn-full"
              onClick={handleWebAuthn}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" />
                  Verifying...
                </>
              ) : (
                'Use Passkey'
              )}
            </Button>
          </div>
        )}

        {/* TOTP Method */}
        {method === 'totp' && (
          <form className="auth-form" onSubmit={handleTotpSubmit}>
            <p style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
              Enter the 6-digit code from your authenticator app
            </p>
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <OtpInput
                length={6}
                value={code}
                onChange={setCode}
                onComplete={handleTotpComplete}
                disabled={isLoading}
                error={!!error}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="btn-full"
              disabled={code.length !== 6 || isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </form>
        )}
      </Card>

      <footer className="auth-footer slide-up stagger-3">
        <LegalAgreementNotice variant="auth" />
        <p style={{ marginTop: 'var(--spacing-sm)' }}>
          <Link to="/auth/login" className="auth-link">
            Cancel and start over
          </Link>
        </p>
      </footer>
    </AuthLayout>
  );
}
