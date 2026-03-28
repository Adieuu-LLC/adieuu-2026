import { createContext, useContext, type ReactNode } from 'react';
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
    toaster.create({
      title: options.title,
      description: options.description,
      type: options.variant ?? 'info',
      duration: options.duration ?? 5000,
      meta: options.action ? { action: options.action } : undefined,
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
      <Toaster toaster={toaster}>
        {(toast) => {
          const action = (toast.meta as { action?: ToastOptions['action'] } | undefined)?.action;
          return (
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
    </ToastContext.Provider>
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
