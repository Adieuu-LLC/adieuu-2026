/**
 * HoverCard component built on Ark UI for displaying contextual information on hover.
 */

import { type ReactNode } from 'react';
import { HoverCard as ArkHoverCard, Portal } from '@ark-ui/react';

export interface HoverCardProps {
  /** The trigger element */
  trigger: ReactNode;
  /** The content to show in the hover card */
  children: ReactNode;
  /** Position of the hover card relative to the trigger */
  positioning?: {
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' | 'right-start' | 'right-end';
    gutter?: number;
  };
  /** CSS class name for the hover card content */
  className?: string;
  /** Delay before showing the hover card (ms) */
  openDelay?: number;
  /** Delay before hiding the hover card (ms) */
  closeDelay?: number;
  /** Called when the hover card opens or closes */
  onOpenChange?: (details: { open: boolean }) => void;
}

/**
 * A hover card component for displaying contextual information on hover.
 * Unlike tooltips, hover cards can contain interactive content.
 *
 * @example
 * ```tsx
 * <HoverCard
 *   trigger={<span>Hover me</span>}
 *   positioning={{ placement: 'right' }}
 * >
 *   <div>
 *     <h3>Profile</h3>
 *     <button>View Profile</button>
 *   </div>
 * </HoverCard>
 * ```
 */
export function HoverCard({
  trigger,
  children,
  positioning = { placement: 'right', gutter: 8 },
  className = '',
  openDelay = 200,
  closeDelay = 300,
  onOpenChange,
}: HoverCardProps) {
  return (
    <ArkHoverCard.Root
      positioning={positioning}
      openDelay={openDelay}
      closeDelay={closeDelay}
      onOpenChange={onOpenChange}
    >
      <ArkHoverCard.Trigger asChild>{trigger}</ArkHoverCard.Trigger>
      <Portal>
        <ArkHoverCard.Positioner>
          <ArkHoverCard.Content className={`hover-card-content ${className}`.trim()}>
            <ArkHoverCard.Arrow className="hover-card-arrow">
              <ArkHoverCard.ArrowTip className="hover-card-arrow-tip" />
            </ArkHoverCard.Arrow>
            {children}
          </ArkHoverCard.Content>
        </ArkHoverCard.Positioner>
      </Portal>
    </ArkHoverCard.Root>
  );
}
