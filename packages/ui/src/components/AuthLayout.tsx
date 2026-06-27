import { useEffect, type ReactNode } from 'react';
import { Logo } from './Logo';
import { SiteFooter } from './SiteFooter';
import { AppNavigationChrome } from '../navigation';

export interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  useEffect(() => {
    document.body.classList.remove('has-app-sidebar', 'sidebar-is-collapsed');
  }, []);

  return (
    <div className="auth-layout">
      <AppNavigationChrome />
      <div className="auth-container fade-in">
        <header className="auth-header slide-up">
          <Logo size="md" />
          {title && <h1 className="auth-title">{title}</h1>}
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </header>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
