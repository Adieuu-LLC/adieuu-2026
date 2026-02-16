import { createContext, useContext, type ReactNode } from 'react';
import { Toaster, Toast as ArkToast, createToaster } from '@ark-ui/react';

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
  info: (title: string, description?: string) => void;
  /** Show a warning toast */
  warning: (title: string, description?: string) => void;
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
    toaster.create({
      title: options.title,
      description: options.description,
      type: options.variant ?? 'info',
      duration: options.duration ?? 5000,
    });
  };

  const success = (title: string, description?: string) => {
    toast({ title, description, variant: 'success' });
  };

  const error = (title: string, description?: string) => {
    toast({ title, description, variant: 'error' });
  };

  const info = (title: string, description?: string) => {
    toast({ title, description, variant: 'info' });
  };

  const warning = (title: string, description?: string) => {
    toast({ title, description, variant: 'warning' });
  };

  const value: ToastContextValue = {
    toast,
    success,
    error,
    info,
    warning,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toaster={toaster}>
        {(toast) => (
          <ArkToast.Root key={toast.id} className={`toast toast-${toast.type}`}>
            <div className="toast-content">
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
              </div>
            </div>
            <ArkToast.CloseTrigger className="toast-close" aria-label="Close">
              <CloseIcon />
            </ArkToast.CloseTrigger>
          </ArkToast.Root>
        )}
      </Toaster>
    </ToastContext.Provider>
  );
}

/** Icon component for toast variants */
function ToastIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'success':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'error':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'warning':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

/** Close icon for toast */
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
