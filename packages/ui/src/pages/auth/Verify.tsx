import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthLayout } from '../../components/AuthLayout';
import { OtpInput } from '../../components/OtpInput';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useAuth } from '../../hooks/useAuth';

interface LocationState {
  identifier?: string;
  deliveryType?: 'email' | 'sms';
}

export function Verify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyOtp, requestOtp, status } = useAuth();

  const state = location.state as LocationState | null;
  const identifier = state?.identifier ?? '';
  const deliveryType = state?.deliveryType ?? 'email';

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Redirect if no identifier
  useEffect(() => {
    if (!identifier) {
      navigate('/auth/login', { replace: true });
    }
  }, [identifier, navigate]);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true });
    }
  }, [status, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return;

    setError(null);
    setIsLoading(true);

    const result = await verifyOtp(identifier, code);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Invalid code');
      setCode('');
      return;
    }

    // Check if MFA is required
    if (result.mfaRequired) {
      navigate('/auth/mfa', {
        replace: true,
        state: {
          mfaChallenge: result.mfaChallenge,
          identifier,
        },
      });
      return;
    }

    // Navigate to home on success
    navigate('/', { replace: true });
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError(null);
    setIsResending(true);

    const result = await requestOtp(identifier, deliveryType);

    setIsResending(false);

    if (!result.success) {
      setError(result.error ?? 'Failed to resend code');
      return;
    }

    setResendCooldown(60); // 60 second cooldown
  };

  const handleComplete = (value: string) => {
    setCode(value);
    // Auto-submit when code is complete
    if (value.length === 6) {
      // Use a small delay to let the UI update
      setTimeout(() => {
        verifyOtp(identifier, value).then((result) => {
          if (!result.success) {
            setError(result.error ?? 'Invalid code');
            setCode('');
          } else if (result.mfaRequired) {
            navigate('/auth/mfa', {
              replace: true,
              state: {
                mfaChallenge: result.mfaChallenge,
                identifier,
              },
            });
          } else {
            navigate('/', { replace: true });
          }
        });
      }, 100);
    }
  };

  const maskedIdentifier =
    deliveryType === 'email'
      ? identifier.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      : identifier.replace(/(\+\d{1,3})(\d*)(\d{4})/, '$1 *** $3');

  if (!identifier) {
    return null;
  }

  return (
    <AuthLayout
      title="Check your inbox"
      subtitle={`We sent a 6-digit code to ${maskedIdentifier}`}
    >
      <Card variant="elevated" className="slide-up stagger-2">
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="error" className="fade-in">
              {error}
            </Alert>
          )}

          {/* OTP Input */}
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <OtpInput
              length={6}
              value={code}
              onChange={setCode}
              onComplete={handleComplete}
              disabled={isLoading}
              error={!!error}
              autoFocus
            />
          </div>

          {/* Submit Button */}
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
              'Verify code'
            )}
          </Button>

          {/* Resend Button */}
          <Button
            type="button"
            variant="ghost"
            className="btn-full"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending}
          >
            {isResending ? (
              <>
                <Spinner size="sm" />
                Sending...
              </>
            ) : resendCooldown > 0 ? (
              `Resend code in ${resendCooldown}s`
            ) : (
              "Didn't receive a code? Resend"
            )}
          </Button>
        </form>
      </Card>

      <footer className="auth-footer slide-up stagger-3">
        <p>
          <Link to="/auth/login" className="auth-link">
            Use a different email or phone
          </Link>
        </p>
      </footer>
    </AuthLayout>
  );
}
