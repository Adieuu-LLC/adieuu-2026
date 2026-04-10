/**
 * HoverCard component built on Ark UI for displaying contextual information on hover.
 *
 * Exposes two mechanisms for child components:
 *
 * 1. **Lock** (`useHoverCardLock`) — prevents the card from closing while a
 *    child interaction (e.g. a confirm dialog) is active.
 *
 * 2. **Dialog outlet** (`useHoverCardDialogOutlet`) — renders content as a
 *    sibling of the Ark HoverCard root so that Ark's internal dismiss /
 *    layer cascade does not affect it.
 */

import { type ReactNode, createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { HoverCard as ArkHoverCard, Portal } from '@ark-ui/react';

/* ------------------------------------------------------------------ */
/*  Lock context                                                       */
/* ------------------------------------------------------------------ */

export interface HoverCardLock {
  lockOpen: () => void;
  unlockOpen: () => void;
}

const HoverCardLockContext = createContext<HoverCardLock | null>(null);

/**
 * Call from any child rendered inside a `HoverCard` to hold it open
 * while a modal / dialog is active. Returns `null` when used outside
 * a HoverCard (safe to optional-chain).
 */
export function useHoverCardLock(): HoverCardLock | null {
  return useContext(HoverCardLockContext);
}

/* ------------------------------------------------------------------ */
/*  Dialog outlet context                                              */
/* ------------------------------------------------------------------ */

type SetDialogOutlet = (content: ReactNode) => void;

const HoverCardDialogOutletContext = createContext<SetDialogOutlet | null>(null);

/**
 * Returns a setter that renders the given `ReactNode` **outside** the Ark
 * HoverCard tree, as a sibling of `ArkHoverCard.Root`. Use this to host
 * dialogs that would otherwise be dismissed by Ark's layer cascade.
 *
 * Returns `null` when called outside a HoverCard (safe to optional-chain).
 */
export function useHoverCardDialogOutlet(): SetDialogOutlet | null {
  return useContext(HoverCardDialogOutletContext);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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
  const [hoverOpen, setHoverOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [outletContent, setOutletContent] = useState<ReactNode>(null);

  // Ref mirrors `locked` so the onOpenChange callback always reads the
  // latest value without needing it in its dependency array.
  const lockedRef = useRef(false);

  const handleOpenChange = useCallback(
    (details: { open: boolean }) => {
      if (!details.open && lockedRef.current) return;
      setHoverOpen(details.open);
      onOpenChange?.(details);
    },
    [onOpenChange],
  );

  const lockOpen = useCallback(() => {
    lockedRef.current = true;
    setLocked(true);
  }, []);

  const unlockOpen = useCallback(() => {
    lockedRef.current = false;
    setLocked(false);
  }, []);

  const lockValue = useMemo<HoverCardLock>(
    () => ({ lockOpen, unlockOpen }),
    [lockOpen, unlockOpen],
  );

  return (
    <>
      <ArkHoverCard.Root
        positioning={positioning}
        openDelay={openDelay}
        closeDelay={closeDelay}
        open={hoverOpen || locked}
        onOpenChange={handleOpenChange}
      >
        <ArkHoverCard.Trigger asChild>{trigger}</ArkHoverCard.Trigger>
        <Portal>
          <ArkHoverCard.Positioner>
            <ArkHoverCard.Content className={`hover-card-content ${className}`.trim()}>
              <ArkHoverCard.Arrow className="hover-card-arrow">
                <ArkHoverCard.ArrowTip className="hover-card-arrow-tip" />
              </ArkHoverCard.Arrow>
              <HoverCardDialogOutletContext.Provider value={setOutletContent}>
                <HoverCardLockContext.Provider value={lockValue}>
                  {children}
                </HoverCardLockContext.Provider>
              </HoverCardDialogOutletContext.Provider>
            </ArkHoverCard.Content>
          </ArkHoverCard.Positioner>
        </Portal>
      </ArkHoverCard.Root>
      {outletContent}
    </>
  );
}
