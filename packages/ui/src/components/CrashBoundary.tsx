/**
 * Root-level React error boundary.
 *
 * Wraps the **entire** provider tree so it catches errors from any provider
 * or child component. When a crash is caught, it renders a self-contained
 * fallback UI that:
 *
 * - Does not depend on any context provider, theme CSS variables, or the
 *   app's toast system (all of which may have crashed).
 * - Shows the error message and an expandable stack trace.
 * - Offers a "Reload" button and an optional error-report submission form.
 * - Uses raw `fetch()` to submit reports (not the app's ApiClient).
 *
 * The existing `RouteErrorBoundary` remains in place for its specialised
 * chunk-load recovery role inside the route tree.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { crashReporter } from '../services/crashReporter';

interface CrashBoundaryProps {
  children: ReactNode;
  /** Base URL for the crash report API (e.g. '' for same-origin). */
  reportEndpoint: string;
}

interface CrashBoundaryState {
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
  userDescription: string;
  submitStatus: 'idle' | 'sending' | 'sent' | 'failed';
}

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = {
    error: null,
    componentStack: null,
    showDetails: false,
    userDescription: '',
    submitStatus: 'idle',
  };

  static getDerivedStateFromError(error: Error): Partial<CrashBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? null;
    this.setState({ componentStack });
    crashReporter.capture(error.message, error.stack, componentStack ?? undefined);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleToggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  private handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    this.setState({ userDescription: e.target.value });
  };

  private handleSubmit = async (): Promise<void> => {
    const { error, componentStack, userDescription } = this.state;
    if (!error) return;

    this.setState({ submitStatus: 'sending' });

    const ok = await crashReporter.submitReport(
      error.message,
      error.stack,
      componentStack ?? undefined,
      userDescription || undefined,
    );

    this.setState({ submitStatus: ok ? 'sent' : 'failed' });
  };

  render(): ReactNode {
    const { error, componentStack, showDetails, userDescription, submitStatus } = this.state;

    if (!error) return this.props.children;

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconRow}>
            <svg
              viewBox="0 0 24 24"
              width="40"
              height="40"
              fill="none"
              stroke="#f87171"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.subtitle}>
            The app encountered an unexpected error and cannot continue.
          </p>

          <div style={styles.errorBox}>
            <code style={styles.errorMessage}>{error.message}</code>
          </div>

          <button type="button" onClick={this.handleToggleDetails} style={styles.detailsToggle}>
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>

          {showDetails && (
            <pre style={styles.stackTrace}>
              {error.stack}
              {componentStack && `\n\nComponent stack:${componentStack}`}
            </pre>
          )}

          <div style={styles.actions}>
            <button type="button" onClick={this.handleReload} style={styles.reloadButton}>
              Reload App
            </button>
          </div>

          <div style={styles.reportSection}>
            <p style={styles.reportLabel}>
              Help us fix this by submitting an error report. No account data is
              included unless you type it below.
            </p>
            <textarea
              value={userDescription}
              onChange={this.handleDescriptionChange}
              placeholder="What were you doing when this happened? (optional)"
              rows={3}
              style={styles.textarea}
              disabled={submitStatus === 'sending' || submitStatus === 'sent'}
            />
            <button
              type="button"
              onClick={this.handleSubmit}
              disabled={submitStatus === 'sending' || submitStatus === 'sent'}
              style={{
                ...styles.submitButton,
                ...(submitStatus === 'sent' ? styles.submitButtonSent : {}),
              }}
            >
              {submitStatus === 'idle' && 'Send Error Report'}
              {submitStatus === 'sending' && 'Sending\u2026'}
              {submitStatus === 'sent' && 'Report Sent — Thank You'}
              {submitStatus === 'failed' && 'Failed — Try Again'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Inline styles — intentionally hardcoded so the crash screen renders even
// when the app's CSS or theme providers are broken.
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background: '#111114',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: '#e4e4e7',
  },
  card: {
    maxWidth: '32rem',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    textAlign: 'center',
  },
  iconRow: {
    marginBottom: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: '1.375rem',
    fontWeight: 600,
    color: '#fafafa',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.9375rem',
    color: '#a1a1aa',
    lineHeight: 1.5,
  },
  errorBox: {
    width: '100%',
    padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem',
    background: 'rgba(248, 113, 113, 0.08)',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    overflowX: 'auto',
  },
  errorMessage: {
    fontSize: '0.8125rem',
    color: '#fca5a5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  detailsToggle: {
    background: 'none',
    border: 'none',
    color: '#71717a',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '0.25rem 0',
  },
  stackTrace: {
    width: '100%',
    maxHeight: '12rem',
    overflow: 'auto',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    background: '#18181b',
    border: '1px solid #27272a',
    fontSize: '0.6875rem',
    lineHeight: 1.5,
    color: '#a1a1aa',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: '0.625rem',
    marginTop: '0.5rem',
  },
  reloadButton: {
    padding: '0.5rem 1.5rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: '#6d28d9',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  reportSection: {
    width: '100%',
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  reportLabel: {
    margin: 0,
    fontSize: '0.8125rem',
    color: '#71717a',
    lineHeight: 1.5,
  },
  textarea: {
    width: '100%',
    padding: '0.5rem 0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid #27272a',
    background: '#18181b',
    color: '#e4e4e7',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  submitButton: {
    padding: '0.4375rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid #27272a',
    background: '#27272a',
    color: '#e4e4e7',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  submitButtonSent: {
    background: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.3)',
    color: '#4ade80',
    cursor: 'default',
  },
};
