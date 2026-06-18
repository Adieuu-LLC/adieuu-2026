/**
 * Error boundary for lazily-loaded routes.
 *
 * Its primary job is graceful recovery from chunk-load failures: after a deploy,
 * a client running the previous build may request hashed chunks that no longer
 * exist, which throws when React.lazy tries to import them. Rather than showing a
 * blank screen, we attempt a single automatic reload (guarded so we never loop)
 * and otherwise present a manual retry.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_TIMESTAMP_KEY = 'adieuu.chunkReloadAt';
const RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'loading chunk',
  'chunkloaderror',
];

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name?.toLowerCase() ?? '';
  if (name === 'chunkloaderror') return true;
  const message = (error as { message?: string }).message?.toLowerCase() ?? '';
  return CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  reloading: boolean;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (isChunkLoadError(error) && this.tryAutoReload()) {
      this.setState({ reloading: true });
    }
  }

  private tryAutoReload(): boolean {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) ?? '0');
      if (Date.now() - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now()));
        window.location.reload();
        return true;
      }
    } catch {
      // sessionStorage unavailable — fall through to manual retry.
    }
    return false;
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error, reloading } = this.state;

    if (reloading) {
      return (
        <div className="auth-layout">
          <div className="spinner spinner-lg" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="route-error-boundary">
          <div className="route-error-boundary__inner">
            <h1 className="route-error-boundary__title">Something went wrong</h1>
            <p className="route-error-boundary__message">
              This page failed to load. Reloading usually fixes it.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
