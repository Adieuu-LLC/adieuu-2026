import { Card } from '@chadder/ui';

export function About() {
  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">About Chadder</h1>
          <p className="page-subtitle">
            Secure, private messaging for everyone.
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
            Our Mission
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            Chadder was built with privacy at its core. We believe that private
            communication is a fundamental right, not a luxury. Our platform
            uses end-to-end encryption to ensure that your messages remain
            private between you and your intended recipients.
          </p>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            Unlike other messaging platforms, we don't sell your data, track
            your conversations, or serve you targeted ads. Your privacy is not
            our business model.
          </p>

          <h2 style={{ color: 'var(--color-text-primary)' }}>Security</h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            All messages are encrypted using industry-standard cryptographic
            algorithms. Our passwordless authentication system eliminates the
            risk of password breaches while providing a seamless user experience.
          </p>
        </Card>
      </div>
    </div>
  );
}
