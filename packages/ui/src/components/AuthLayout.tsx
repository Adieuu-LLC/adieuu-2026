import type { ReactNode } from 'react';
import { Logo } from './Logo';

export interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-container fade-in">
        <header className="auth-header slide-up">
          <Logo size="md" />
          {title && <h1 className="auth-title">{title}</h1>}
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}
