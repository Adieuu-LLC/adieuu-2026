import { ReactNode } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';

/**
 * Confirmation dialog variant types.
 */
export type ConfirmDialogVariant = 'default' | 'danger' | 'warning';

/**
 * Props for the ConfirmDialog component.
 */
export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  description?: string;
  /** Custom content to render instead of description */
  children?: ReactNode;
  /** Text for the confirm button */
  confirmLabel?: string;
  /** Text for the cancel button */
  cancelLabel?: string;
  /** Callback when confirm is clicked */
  onConfirm: () => void;
  /** Callback when cancel is clicked (defaults to closing dialog) */
  onCancel?: () => void;
  /** Whether the confirm action is in progress */
  loading?: boolean;
  /** Dialog variant - danger shows destructive styling */
  variant?: ConfirmDialogVariant;
  /** Override closeOnInteractOutside (defaults to `!loading`) */
  closeOnInteractOutside?: boolean;
}

/**
 * A reusable confirmation dialog component built on Ark UI Dialog.
 * Use this instead of window.confirm() for better UX and consistent styling.
 *
 * @example
 * ```tsx
 * const [deleteOpen, setDeleteOpen] = useState(false);
 * const [deleting, setDeleting] = useState(false);
 *
 * const handleDelete = async () => {
 *   setDeleting(true);
 *   await deleteItem();
 *   setDeleting(false);
 *   setDeleteOpen(false);
 * };
 *
 * <ConfirmDialog
 *   open={deleteOpen}
 *   onOpenChange={setDeleteOpen}
 *   title="Delete item?"
 *   description="This action cannot be undone."
 *   confirmLabel="Delete"
 *   variant="danger"
 *   loading={deleting}
 *   onConfirm={handleDelete}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  variant = 'default',
  closeOnInteractOutside,
}: ConfirmDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)} closeOnInteractOutside={closeOnInteractOutside ?? !loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className={`confirm-dialog-content confirm-dialog-${variant}`}>
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
            </div>

            {(description || children) && (
              <div className="confirm-dialog-body">
                {description && (
                  <Dialog.Description className="confirm-dialog-description">
                    {description}
                  </Dialog.Description>
                )}
                {children}
              </div>
            )}

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'danger' ? 'primary' : 'primary'}
                className={variant === 'danger' ? 'btn-danger' : ''}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <LoadingSpinner />
                    {confirmLabel}
                  </span>
                ) : (
                  confirmLabel
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** Small loading spinner for the confirm button */
function LoadingSpinner() {
  return (
    <svg
      className="confirm-dialog-spinner"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
