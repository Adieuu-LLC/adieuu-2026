import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react';
import { Icon } from '../../icons/Icon';

export const COMPARISON_TABLE_PRESET_NEUTRAL = {
  shell: 'comparison-table-shell',
  scroll: 'comparison-table-scroll',
  scrollCanPanX: 'comparison-table-scroll--can-pan-x',
  scrollDragging: 'comparison-table-scroll--dragging',
  table: 'comparison-table-table',
  nudgeBar: 'comparison-table-scroll-nudge-bar',
  nudgeBarSide: 'comparison-table-scroll-nudge-bar__side',
  nudgeBarSideEnd: 'comparison-table-scroll-nudge-bar__side--end',
  nudgeHint: 'comparison-table-scroll-nudge-hint',
  nudgeBtn: 'comparison-table-scroll-nudge-btn',
  nudgePlaceholder: 'comparison-table-scroll-nudge-placeholder',
} as const;

export type ComparisonTableClassNames = {
  [K in keyof typeof COMPARISON_TABLE_PRESET_NEUTRAL]: string;
};

/** Subscription account surfaces: accent-tinted scroll nudge (see `.comparison-table--subscription`). */
export const COMPARISON_TABLE_PRESET_SUBSCRIPTION: ComparisonTableClassNames = {
  ...COMPARISON_TABLE_PRESET_NEUTRAL,
  shell: 'comparison-table-shell comparison-table--subscription',
};

/** @deprecated Use `COMPARISON_TABLE_PRESET_NEUTRAL`. */
export const COMPARISON_TABLE_DEFAULT_CLASS_NAMES = COMPARISON_TABLE_PRESET_NEUTRAL;

const HEADER_DRAG_THRESHOLD_PX = 8;

function mergeClassNames(partial?: Partial<ComparisonTableClassNames>): ComparisonTableClassNames {
  return { ...COMPARISON_TABLE_PRESET_NEUTRAL, ...partial };
}

function isComparisonHeaderDragTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('button, a, input, textarea, select, [role="button"]')) {
    return false;
  }
  return el.closest('thead tr:first-child th') != null;
}

export interface ComparisonTableProps {
  /** Passed to `aria-labelledby` on the table. */
  labelledBy: string;
  nudgeRegionAriaLabel: string;
  nudgeHint: ReactNode;
  scrollPrevAriaLabel: string;
  scrollNextAriaLabel: string;
  /** Selector under the scroll root for measuring one column step (e.g. first tier header cell). */
  scrollStepColumnSelector: string;
  /** Override BEM classes; defaults to neutral `comparison-table-*` SCSS. */
  classNames?: Partial<ComparisonTableClassNames>;
  /** Extra dependencies to refresh scroll metrics (e.g. `[showActionsRow]`). */
  layoutDeps?: DependencyList;
  children: ReactNode;
}

export function ComparisonTable({
  labelledBy,
  nudgeRegionAriaLabel,
  nudgeHint,
  scrollPrevAriaLabel,
  scrollNextAriaLabel,
  scrollStepColumnSelector,
  classNames: classNamesProp,
  layoutDeps = [],
  children,
}: ComparisonTableProps) {
  const cn = useMemo(() => mergeClassNames(classNamesProp), [classNamesProp]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);
  const [scrollState, setScrollState] = useState({
    canLeft: false,
    canRight: false,
    canPanX: false,
  });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setScrollState({
      canLeft: scrollLeft > 2,
      canRight: max > 2 && scrollLeft < max - 2,
      canPanX: max > 2,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutDeps expanded intentionally
  }, [updateScrollState, ...layoutDeps]);

  useEffect(() => {
    const id = requestAnimationFrame(() => updateScrollState());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutDeps expanded intentionally
  }, [updateScrollState, ...layoutDeps]);

  const scrollByStep = useCallback(
    (direction: 1 | -1) => {
      const root = scrollRef.current;
      if (!root) return;
      const stepEl = root.querySelector<HTMLElement>(scrollStepColumnSelector);
      const step = stepEl?.offsetWidth ?? Math.round(root.clientWidth * 0.35);
      root.scrollBy({ left: direction * step, behavior: 'smooth' });
    },
    [scrollStepColumnSelector],
  );

  const endHeaderDrag = useCallback(
    (e: React.PointerEvent, el: HTMLDivElement) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      dragRef.current = null;
      el.classList.remove(cn.scrollDragging);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const dx = e.clientX - session.startX;
      if (Math.abs(dx) > HEADER_DRAG_THRESHOLD_PX) {
        e.preventDefault();
      }
    },
    [cn.scrollDragging],
  );

  const onScrollPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = scrollRef.current;
      if (!el || el.scrollWidth <= el.clientWidth + 2) return;
      if (!isComparisonHeaderDragTarget(e.target)) return;
      dragRef.current = {
        startX: e.clientX,
        startScroll: el.scrollLeft,
        pointerId: e.pointerId,
      };
      el.classList.add(cn.scrollDragging);
      el.setPointerCapture(e.pointerId);
    },
    [cn.scrollDragging],
  );

  const onScrollPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    const el = scrollRef.current;
    if (!session || !el || session.pointerId !== e.pointerId) return;
    const dx = e.clientX - session.startX;
    el.scrollLeft = session.startScroll - dx;
  }, []);

  const onScrollPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      endHeaderDrag(e, el);
    },
    [endHeaderDrag],
  );

  const onScrollPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      endHeaderDrag(e, el);
    },
    [endHeaderDrag],
  );

  const showScrollNudgeBar = scrollState.canPanX;

  const scrollClassName = [cn.scroll, scrollState.canPanX && cn.scrollCanPanX].filter(Boolean).join(' ');

  return (
    <div className={cn.shell}>
      {showScrollNudgeBar ? (
        <section className={cn.nudgeBar} aria-label={nudgeRegionAriaLabel}>
          <div className={cn.nudgeBarSide}>
            {scrollState.canLeft ? (
              <button
                type="button"
                className={cn.nudgeBtn}
                onClick={() => scrollByStep(-1)}
                aria-label={scrollPrevAriaLabel}
              >
                <Icon name="arrowLeft" size="sm" />
              </button>
            ) : (
              <span className={cn.nudgePlaceholder} aria-hidden />
            )}
          </div>
          <p className={cn.nudgeHint}>{nudgeHint}</p>
          <div className={`${cn.nudgeBarSide} ${cn.nudgeBarSideEnd}`}>
            {scrollState.canRight ? (
              <button
                type="button"
                className={cn.nudgeBtn}
                onClick={() => scrollByStep(1)}
                aria-label={scrollNextAriaLabel}
              >
                <Icon name="chevronRight" size="sm" />
              </button>
            ) : (
              <span className={cn.nudgePlaceholder} aria-hidden />
            )}
          </div>
        </section>
      ) : null}
      <div
        ref={scrollRef}
        className={scrollClassName}
        onScroll={updateScrollState}
        onPointerDown={onScrollPointerDown}
        onPointerMove={onScrollPointerMove}
        onPointerUp={onScrollPointerUp}
        onPointerCancel={onScrollPointerCancel}
      >
        <table className={cn.table} aria-labelledby={labelledBy}>
          {children}
        </table>
      </div>
    </div>
  );
}
