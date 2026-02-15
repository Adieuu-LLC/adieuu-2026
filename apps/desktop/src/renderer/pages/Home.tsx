import { Link } from 'react-router-dom';
import { Button, Logo, Card, usePlatform } from '@chadder/ui';
import { useAuth } from '../hooks/useAuth';

export function Home() {
  const platform = usePlatform();
  const { logout } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <Logo size="sm" />
        <nav className="nav">
          <Link to="/" className="nav-link active">
            Home
          </Link>
          <Link to="/about" className="nav-link">
            About
          </Link>
          <span className="platform-badge">
            {platform === 'desktop' ? 'Desktop' : platform}
          </span>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            Sign out
          </Button>
        </nav>
      </header>

      <main className="dashboard-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">Welcome to Chadder</h1>
            <p className="page-subtitle">
              Your secure messaging platform. Running on {platform}.
            </p>
          </div>

          <div className="grid grid-2">
            <Card variant="elevated" className="slide-up">
              <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                End-to-End Encryption
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                All messages are encrypted with strong cryptography. Only you and
                your recipients can read them.
              </p>
            </Card>

            <Card variant="elevated" className="slide-up stagger-1">
              <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                Native Desktop App
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                Experience Chadder as a native desktop application with system
                notifications and offline support.
              </p>
            </Card>

            <Card variant="elevated" className="slide-up stagger-2">
              <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                No Password Required
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                Passwordless authentication keeps your account secure without the
                hassle of remembering passwords.
              </p>
            </Card>

            <Card variant="elevated" className="slide-up stagger-3">
              <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                Privacy First
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                We collect only what's necessary. Your data is yours.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
