import { ReactNode } from 'react';
import {
  Tour as ArkTour,
  useTour as useArkTour,
  type UseTourProps,
  type UseTourReturn,
  type TourStepDetails,
} from '@ark-ui/react';
import { Icon } from '../icons/Icon';

/**
 * Step definition for the Tour component.
 * Supports tooltip (anchored to element), dialog (centered modal), and floating types.
 */
export interface TourStep {
  /** Unique identifier for this step */
  id: string;
  /** The type of step - tooltip anchors to target, dialog is centered, floating is fixed position */
  type?: 'tooltip' | 'dialog' | 'floating';
  /** CSS selector or function returning the target element (required for tooltip type) */
  target?: string | (() => HTMLElement | null);
  /** Title displayed in the step */
  title: string;
  /** Description/content for the step */
  description?: string;
  /** Placement of the tooltip relative to target */
  placement?:
    | 'top'
    | 'top-start'
    | 'top-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end'
    | 'right'
    | 'right-start'
    | 'right-end';
  /** Actions/buttons to show for this step */
  actions?: TourStepAction[];
  /** Custom content to render instead of description */
  content?: ReactNode;
  /**
   * Run when entering this step (Zag tour). For tooltip/dialog steps you must call `show()`
   * after any async prep. Return a cleanup function when leaving the step.
   */
  effect?: TourStepEffect;
}

export interface TourStepAction {
  /** Label for the action button */
  label: string;
  /** Action type - determines behavior */
  action: 'prev' | 'next' | 'dismiss' | 'skip';
}

/**
 * Zag tour step effect. For non-wait steps you must call `show()` so the step becomes active.
 * Return a cleanup function to run when leaving the step.
 */
export type TourStepEffect = (args: {
  next: () => void;
  goto: (id: string) => void;
  dismiss: () => void;
  show: () => void;
  update: (data: Record<string, unknown>) => void;
  target?: () => HTMLElement | null;
}) => void | (() => void);

export interface TourProviderProps {
  /** Array of steps to show in the tour */
  steps: TourStep[];
  /** Callback when the tour step changes */
  onStepChange?: (details: TourStepDetails) => void;
  /** Callback when the tour status changes (started, stopped, skipped, completed) */
  onStatusChange?: (details: { status: string }) => void;
  /** Whether to close on escape key */
  closeOnEscape?: boolean;
  /** Whether to close when clicking outside */
  closeOnInteractOutside?: boolean;
  /** Whether to show keyboard shortcuts hint */
  keyboardNavigation?: boolean;
  /** Children to render */
  children: ReactNode;
}

/**
 * Hook to access the tour API.
 * Must be used within a TourProvider.
 */
export function useTour(props?: UseTourProps): UseTourReturn {
  return useArkTour(props);
}

/**
 * Re-export the tour return type for external usage
 */
export type { UseTourReturn as TourApi };

/**
 * Tour component providing a guided walkthrough experience.
 * 
 * Usage:
 * ```tsx
 * const tour = useTour({
 *   steps: [
 *     { id: 'welcome', type: 'dialog', title: 'Welcome!', description: 'Let us show you around.' },
 *     { id: 'sidebar', target: '[data-tour="sidebar"]', title: 'Navigation', description: 'Use the sidebar to navigate.' },
 *   ],
 * });
 * 
 * return (
 *   <>
 *     <TourRoot tour={tour} />
 *     <button onClick={() => tour.start()}>Start Tour</button>
 *   </>
 * );
 * ```
 */
export interface TourRootProps {
  /** Tour instance from useTour hook */
  tour: UseTourReturn;
  /** Whether the tour is initially present (for animations) */
  lazyMount?: boolean;
  /** Whether to unmount on exit (for animations) */
  unmountOnExit?: boolean;
}

export function TourRoot({ tour, lazyMount = true, unmountOnExit = true }: TourRootProps) {
  return (
    <ArkTour.Root tour={tour} lazyMount={lazyMount} unmountOnExit={unmountOnExit}>
      <ArkTour.Backdrop className="tour-backdrop" />
      <ArkTour.Spotlight className="tour-spotlight" />
      <ArkTour.Positioner className="tour-positioner">
        <ArkTour.Content className="tour-content">
          <ArkTour.Arrow className="tour-arrow">
            <ArkTour.ArrowTip className="tour-arrow-tip" />
          </ArkTour.Arrow>

          <div className="tour-header">
            <ArkTour.Title className="tour-title" />
            <ArkTour.CloseTrigger className="tour-close-trigger" aria-label="Close tour">
              <Icon name="x" />
            </ArkTour.CloseTrigger>
          </div>

          <ArkTour.Description className="tour-description" />

          <div className="tour-footer">
            <ArkTour.ProgressText className="tour-progress" />
            <ArkTour.Actions>
              {(actions) => (
                <div className="tour-actions">
                  {actions.map((action) => (
                    <ArkTour.ActionTrigger
                      key={action.label}
                      action={action}
                      className={`tour-action-btn ${action.action === 'next' ? 'tour-action-btn-primary' : ''}`}
                    >
                      {action.label}
                    </ArkTour.ActionTrigger>
                  ))}
                </div>
              )}
            </ArkTour.Actions>
          </div>
        </ArkTour.Content>
      </ArkTour.Positioner>
    </ArkTour.Root>
  );
}

/** Internal step details type compatible with Ark UI */
type StepDetails = {
  id: string;
  type?: 'tooltip' | 'dialog' | 'floating';
  target?: () => HTMLElement | null;
  title: string;
  description: string;
  placement?: TourStep['placement'];
  actions?: TourStepAction[];
  content?: ReactNode;
  effect?: TourStepEffect;
};

/**
 * Helper function to create tour steps with default actions.
 * Automatically adds prev/next/close buttons based on step position.
 * Converts string targets (CSS selectors) to functions compatible with Ark UI.
 */
export function createTourSteps(steps: TourStep[]): StepDetails[] {
  return steps.map((step, index) => {
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    // Convert string target to function
    let targetFn: (() => HTMLElement | null) | undefined;
    if (typeof step.target === 'string') {
      const selector = step.target;
      targetFn = () => document.querySelector(selector) as HTMLElement | null;
    } else {
      targetFn = step.target;
    }

    // Generate default actions based on position if not provided
    let actions = step.actions;
    if (!actions) {
      actions = [];

      if (!isFirst) {
        actions.push({ label: 'Previous', action: 'prev' });
      }

    if (isLast) {
      actions.push({ label: 'Finish', action: 'dismiss' });
    } else {
      actions.push({ label: 'Next', action: 'next' });
    }
    }

    return {
      id: step.id,
      type: step.type ?? 'tooltip',
      target: targetFn,
      title: step.title,
      description: step.description ?? '',
      placement: step.placement ?? 'bottom',
      actions,
      content: step.content,
      ...(step.effect ? { effect: step.effect } : {}),
    };
  });
}
