/**
 * Popover component built on Ark UI for displaying contextual information.
 */

import { type ReactNode } from 'react';
import { Popover as ArkPopover, Portal } from '@ark-ui/react';

export interface PopoverProps {
  /** The trigger element */
  trigger: ReactNode;
  /** The content to show in the popover */
  children: ReactNode;
  /** Position of the popover relative to the trigger */
  positioning?: {
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';
  };
  /** CSS class name for the popover content */
  className?: string;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A popover component for displaying contextual information on click.
 *
 * @example
 * ```tsx
 * <Popover
 *   trigger={<button>Click me</button>}
 *   positioning={{ placement: 'bottom-start' }}
 * >
 *   <p>Popover content here</p>
 * </Popover>
 * ```
 */
export function Popover({
  trigger,
  children,
  positioning = { placement: 'bottom' },
  className = '',
  onOpenChange,
}: PopoverProps) {
  const handleOpenChange = onOpenChange
    ? (details: { open: boolean }) => onOpenChange(details.open)
    : undefined;

  return (
    <ArkPopover.Root positioning={positioning} onOpenChange={handleOpenChange}>
      <ArkPopover.Trigger asChild>{trigger}</ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner>
          <ArkPopover.Content className={`popover-content ${className}`.trim()}>
            <ArkPopover.Arrow className="popover-arrow">
              <ArkPopover.ArrowTip className="popover-arrow-tip" />
            </ArkPopover.Arrow>
            {children}
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}
