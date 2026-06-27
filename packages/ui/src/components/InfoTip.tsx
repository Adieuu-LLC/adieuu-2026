/**
 * InfoTip -- renders a Tooltip for short content and upgrades to a
 * hover-controlled, scrollable Popover when content is long or rich JSX.
 *
 * Uses the same Ark UI primitives as Tooltip and Popover wrappers.
 */

import {
  type ReactNode,
  type ReactElement,
  useState,
  useRef,
  useCallback,
} from 'react';
import { Popover as ArkPopover, Portal } from '@ark-ui/react';
import { Tooltip } from './Tooltip';

/** Character count above which string content is promoted to a popover. */
export const INFOTIP_CHAR_THRESHOLD = 120;

/** Grace period (ms) when the pointer leaves trigger/popover before closing. */
const HOVER_CLOSE_DELAY = 150;

export interface InfoTipProps {
  /** The content to display */
  content: ReactNode;
  /** The element that triggers the tip (must be a single element) */
  children: ReactElement;
  /** Position relative to the trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in ms before showing (tooltip mode only, default: 200) */
  delay?: number;
  /** Extra CSS class on the content container */
  className?: string;
  /** Force a specific rendering mode instead of auto-detecting */
  mode?: 'tooltip' | 'popover' | 'auto';
}

function getContentLength(content: ReactNode): number | null {
  if (typeof content === 'string') return content.length;
  if (typeof content === 'number') return String(content).length;
  return null;
}

function shouldUsePopover(
  content: ReactNode,
  mode: 'tooltip' | 'popover' | 'auto',
): boolean {
  if (mode === 'tooltip') return false;
  if (mode === 'popover') return true;
  const len = getContentLength(content);
  if (len === null) return true;
  return len > INFOTIP_CHAR_THRESHOLD;
}

export function InfoTip({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
  mode = 'auto',
}: InfoTipProps) {
  const usePopover = shouldUsePopover(content, mode);

  if (!usePopover) {
    return (
      <Tooltip
        content={content}
        position={position}
        delay={delay}
        className={className}
      >
        {children}
      </Tooltip>
    );
  }

  return (
    <HoverPopover
      content={content}
      position={position}
      delay={delay}
      className={className}
    >
      {children}
    </HoverPopover>
  );
}

/**
 * Ark Popover controlled via pointer events so it behaves like a tooltip
 * but stays open while the user hovers over the popover body (for
 * scrolling, text selection, etc.).
 */
function HoverPopover({
  content,
  children,
  position,
  delay,
  className,
}: Omit<InfoTipProps, 'mode'>) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimers = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    cancelTimers();
    openTimer.current = setTimeout(() => setOpen(true), delay ?? 200);
  }, [delay, cancelTimers]);

  const scheduleClose = useCallback(() => {
    cancelTimers();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  }, [cancelTimers]);

  const handlePointerEnter = useCallback(() => {
    cancelTimers();
    if (!open) {
      scheduleOpen();
    }
  }, [open, scheduleOpen, cancelTimers]);

  return (
    <ArkPopover.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) scheduleClose();
      }}
      positioning={{ placement: position }}
    >
      <ArkPopover.Trigger
        asChild
        onPointerEnter={scheduleOpen}
        onPointerLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
      >
        {children}
      </ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner>
          <ArkPopover.Content
            className={`popover-content infotip-popover ${className}`.trim()}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={scheduleClose}
          >
            <ArkPopover.Arrow className="popover-arrow">
              <ArkPopover.ArrowTip className="popover-arrow-tip" />
            </ArkPopover.Arrow>
            <div className="infotip-popover-body">{content}</div>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}
