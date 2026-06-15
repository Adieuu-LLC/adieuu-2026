import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '../../components/AuthLayout';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig } from '../../config';
import { captureReferralCodeFromSearch } from '../../services/referralRedemption';

type DeliveryType = 'email' | 'sms';

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { requestOtp } = useAuth();
  const { externalLinkBase, platform } = useAppConfig();

  useEffect(() => {
    captureReferralCodeFromSearch(searchParams.toString());
  }, [searchParams]);

  const [identifier, setIdentifier] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // Prevent multiple submissions
    setError(null);
    setIsLoading(true);

    const result = await requestOtp(identifier, deliveryType);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Something went wrong');
      return;
    }

    // Navigate to verify page with identifier
    navigate('/auth/verify', {
      state: { identifier, deliveryType },
    });
  };

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isValidPhone = /^[+\d][\d\s\-().]{7,}$/.test(identifier);
  const isValid = deliveryType === 'email' ? isValidEmail : isValidPhone;

  // For desktop/mobile, links open externally; for web, they're relative
  const termsUrl = `${externalLinkBase}/terms`;
  const privacyUrl = `${externalLinkBase}/privacy`;
  const linkProps = platform !== 'web'
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in or create a new account below!"
    >
      <Card variant="elevated" className="slide-up stagger-2">
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="error" className="fade-in">
              {error}
            </Alert>
          )}

          {/* Delivery Type Toggle */}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <Button
              type="button"
              variant={deliveryType === 'email' ? 'primary' : 'secondary'}
              onClick={() => {
                setDeliveryType('email');
                setIdentifier('');
              }}
              disabled={isLoading}
              style={{ flex: 1 }}
            >
              Email
            </Button>
            <Button
              type="button"
              variant={deliveryType === 'sms' ? 'primary' : 'secondary'}
              onClick={() => {
                setDeliveryType('sms');
                setIdentifier('');
              }}
              disabled={isLoading}
              style={{ flex: 1 }}
            >
              Phone
            </Button>
          </div>

          {/* Identifier Input */}
          <Input
            type={deliveryType === 'email' ? 'email' : 'tel'}
            label={deliveryType === 'email' ? 'Email address' : 'Phone number'}
            placeholder={
              deliveryType === 'email'
                ? 'you@example.com'
                : '+1 (555) 123-4567'
            }
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete={deliveryType === 'email' ? 'email' : 'tel'}
            autoFocus
            disabled={isLoading}
          />

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            className="btn-full"
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <>
                <Spinner size="sm" />
                Sending code...
              </>
            ) : (
              'Send verification code'
            )}
          </Button>
        </form>
      </Card>

      <footer className="auth-footer slide-up stagger-3">
        <p>
          By continuing, you agree to Adieuu's{' '}
          <a href={termsUrl} className="auth-link" {...linkProps}>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href={privacyUrl} className="auth-link" {...linkProps}>
            Privacy Policy
          </a>
        </p>
        <p style={{ marginTop: 'var(--spacing-sm)' }}>
          <Link to="/" className="auth-link">
            {t('nav.backToHome')}
          </Link>
        </p>
      </footer>
    </AuthLayout>
  );
}
