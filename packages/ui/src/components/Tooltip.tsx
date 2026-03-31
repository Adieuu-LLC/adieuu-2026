/**
 * Tooltip component built on Ark UI for displaying contextual information.
 * Uses Portal-based positioning for accurate placement and theme consistency.
 */

import { type ReactNode, type ReactElement } from 'react';
import { Tooltip as ArkTooltip, Portal } from '@ark-ui/react';

export interface TooltipProps {
  /** The content to show in the tooltip */
  content: ReactNode;
  /** The element that triggers the tooltip (must be a single element) */
  children: ReactElement;
  /** Position of the tooltip relative to the trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in ms before showing tooltip (default: 200) */
  delay?: number;
  /** CSS class name for the tooltip content */
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
}: TooltipProps) {
  return (
    <ArkTooltip.Root
      openDelay={delay}
      closeDelay={100}
      positioning={{ placement: position }}
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className={`tooltip ${className}`.trim()}>
            <ArkTooltip.Arrow className="tooltip-arrow">
              <ArkTooltip.ArrowTip className="tooltip-arrow-tip" />
            </ArkTooltip.Arrow>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
}
