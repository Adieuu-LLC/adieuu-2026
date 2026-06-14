import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Toaster, Toast as ArkToast, createToaster } from '@ark-ui/react';
import { Icon } from '../icons/Icon';

/**
 * Toast variant types.
 */
export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

/**
 * Toast options for creating a toast.
 */
export interface ToastOptions {
  /** Title of the toast */
  title: string;
  /** Optional description */
  description?: string;
  /** Toast variant (default: 'info') */
  variant?: ToastVariant;
  /** Duration in milliseconds (default: 5000) */
  duration?: number;
  /** Action button configuration */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Clicking the toast body navigates / performs this action and dismisses the toast. */
  onClick?: () => void;
  /** ISO-8601 expiry timestamp — renders a live countdown badge on the toast. */
  expiresAt?: string;
}

/**
 * Toast context value providing the toast API.
 */
export interface ToastContextValue {
  /** Show a toast notification */
  toast: (options: ToastOptions) => void;
  /** Show a success toast */
  success: (title: string, description?: string) => void;
  /** Show an error toast */
  error: (title: string, description?: string) => void;
  /** Show an info toast */
  info: (title: string, description?: string, onClick?: () => void) => void;
  /** Show a warning toast */
  warning: (title: string, description?: string) => void;
  /** Show a message notification toast (with action to view) */
  message: (senderName: string, preview: string, onView: () => void) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast API.
 * Must be used within a ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Create the toaster instance
const toaster = createToaster({
  placement: 'top-end',
  overlap: true,
  gap: 16,
});

/**
 * Toast provider props.
 */
export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Provider component that enables toast notifications throughout the app.
 * 
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * 
 * // In a component:
 * const { success } = useToast();
 * success('Code sent!', 'Check your email for the verification code.');
 * ```
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const toast = (options: ToastOptions) => {
    const meta: Record<string, unknown> = {};
    if (options.action) meta.action = options.action;
    if (options.onClick) meta.onClick = options.onClick;
    if (options.expiresAt) meta.expiresAt = options.expiresAt;

    toaster.create({
      title: options.title,
      description: options.description,
      type: options.variant ?? 'info',
      duration: options.duration ?? 5000,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    });
  };

  const success = (title: string, description?: string) => {
    toast({ title, description, variant: 'success' });
  };

  const error = (title: string, description?: string) => {
    toast({ title, description, variant: 'error' });
  };

  const info = (title: string, description?: string, onClick?: () => void) => {
    toast({ title, description, variant: 'info', onClick });
  };

  const warning = (title: string, description?: string) => {
    toast({ title, description, variant: 'warning' });
  };

  const message = (senderName: string, preview: string, onView: () => void) => {
    toast({
      title: senderName,
      description: preview,
      variant: 'info',
      duration: 8000,
      action: { label: 'View', onClick: onView },
    });
  };

  const value: ToastContextValue = {
    toast,
    success,
    error,
    info,
    warning,
    message,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Renders the toast UI. Must be placed inside IconPackProvider (or any
 * context that Icon depends on) so toast icons resolve correctly.
 *
 * Separated from ToastProvider to break the circular dependency:
 * ToastProvider needs to wrap AuthProvider (ComplianceModals uses toasts),
 * but IconPackProvider needs AuthProvider, and toast icons need IconPackProvider.
 */
export function ToasterOutlet() {
  return (
    <Toaster toaster={toaster}>
      {(toast) => {
        const meta = toast.meta as { action?: ToastOptions['action']; onClick?: () => void; expiresAt?: string } | undefined;
        const action = meta?.action;
        const onClick = meta?.onClick;
        const expiresAt = meta?.expiresAt;
        return (
          <ArkToast.Root key={toast.id} className={`toast toast-${toast.type}${onClick ? ' toast-clickable' : ''}${expiresAt ? ' toast-expiring' : ''}`}>
            <div
              className="toast-content"
              role={onClick ? 'button' : undefined}
              tabIndex={onClick ? 0 : undefined}
              onClick={onClick ? () => { onClick(); toaster.dismiss(toast.id); } : undefined}
              onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); toaster.dismiss(toast.id); } } : undefined}
            >
              <div className="toast-icon">
                <ToastIcon variant={toast.type as ToastVariant} />
              </div>
              <div className="toast-text">
                <ArkToast.Title className="toast-title">{toast.title}</ArkToast.Title>
                {toast.description && (
                  <ArkToast.Description className="toast-description">
                    {toast.description}
                  </ArkToast.Description>
                )}
                {expiresAt && <ToastExpiryCountdown expiresAt={expiresAt} />}
              </div>
            </div>
            <div className="toast-actions">
              {action && (
                <ArkToast.ActionTrigger
                  className="toast-action"
                  onClick={() => {
                    action.onClick();
                    toaster.dismiss(toast.id);
                  }}
                >
                  {action.label}
                </ArkToast.ActionTrigger>
              )}
              <ArkToast.CloseTrigger className="toast-close" aria-label="Close">
                <Icon name="x" />
              </ArkToast.CloseTrigger>
            </div>
          </ArkToast.Root>
        );
      }}
    </Toaster>
  );
}

/** Icon component for toast variants */
const TOAST_ICON_MAP: Record<ToastVariant, 'success' | 'error' | 'warning' | 'info'> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  return <Icon name={TOAST_ICON_MAP[variant] ?? 'info'} />;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) return `${Math.ceil(totalSec / 60)}m`;
  if (totalSec < 86400) return `${Math.ceil(totalSec / 3600)}h`;
  return `${Math.ceil(totalSec / 86400)}d`;
}

function ToastExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return formatCountdown(ms);
  });

  useEffect(() => {
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLabel(formatCountdown(ms));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className="toast-expiry-countdown" aria-label={`Disappears in ${label}`}>
      <Icon name="clock" />
      {label}
    </span>
  );
}
