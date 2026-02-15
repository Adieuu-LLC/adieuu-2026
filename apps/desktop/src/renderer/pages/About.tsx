import { Link } from 'react-router-dom';
import { Button, Logo, Card, usePlatform } from '@chadder/ui';
import { useAuth } from '../hooks/useAuth';

export function About() {
  const platform = usePlatform();
  const { logout } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <Logo size="sm" />
        <nav className="nav">
          <Link to="/" className="nav-link">
            Home
          </Link>
          <Link to="/about" className="nav-link active">
            About
          </Link>
          <span className="platform-badge">
            {platform === 'desktop' ? 'Desktop' : platform}
          </span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </nav>
      </header>

      <main className="dashboard-content">
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

            <h2 style={{ color: 'var(--color-text-primary)' }}>Desktop App</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              The Chadder desktop app is built with Electron, providing a native
              experience on Windows, macOS, and Linux. It shares the same secure
              codebase as our web application, ensuring consistent security across
              all platforms.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
