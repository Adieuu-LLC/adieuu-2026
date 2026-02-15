import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout, Input, Button, Alert, Card, Spinner } from '@chadder/ui';
import { useAuth } from '../../hooks/useAuth';

type DeliveryType = 'email' | 'sms';

export function Login() {
  const navigate = useNavigate();
  const { requestOtp } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to Chadder"
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
          By continuing, you agree to Chadder's{' '}
          <a href="https://chadder.app/terms" className="auth-link" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="https://chadder.app/privacy" className="auth-link" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
        </p>
      </footer>
    </AuthLayout>
  );
}
