import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampPanelWidth } from '../services/panelWidthStorage';

const RESIZING_BODY_CLASS = 'is-resizing-panel';

export interface UseHorizontalPanelResizeOptions {
  disabled?: boolean;
  minPx: number;
  getMaxPx: (viewportWidth: number) => number;
  resolveInitial: (viewportWidth: number) => number;
  writeStored: (widthPx: number) => void;
  setCssVar: (widthPx: number | null) => void;
  /**
   * Which edge the handle sits on.
   * - `end`: left-side panel (drag right to grow)
   * - `start`: right-side panel (drag left to grow)
   */
  edge?: 'end' | 'start';
}

export interface HorizontalPanelResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

function viewportWidth(): number {
  return typeof window !== 'undefined' ? window.innerWidth : 1280;
}

export function useHorizontalPanelResize(options: UseHorizontalPanelResizeOptions) {
  const {
    disabled = false,
    minPx,
    getMaxPx,
    resolveInitial,
    writeStored,
    setCssVar,
    edge = 'end',
  } = options;

  const [widthPx, setWidthPx] = useState(() => resolveInitial(viewportWidth()));
  const dragRef = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);
  const optionsRef = useRef({ minPx, getMaxPx, writeStored, setCssVar, edge });
  optionsRef.current = { minPx, getMaxPx, writeStored, setCssVar, edge };

  const clampWidth = useCallback((value: number, vw = viewportWidth()) => {
    const { minPx: min, getMaxPx: maxFn } = optionsRef.current;
    return clampPanelWidth(value, min, maxFn(vw));
  }, []);

  useEffect(() => {
    setCssVar(widthPx);
  }, [widthPx, setCssVar]);

  useEffect(() => {
    const onWindowResize = () => {
      setWidthPx((current) => clampWidth(current));
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [clampWidth]);

  useEffect(() => {
    return () => {
      document.body.classList.remove(RESIZING_BODY_CLASS);
    };
  }, []);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    document.body.classList.remove(RESIZING_BODY_CLASS);
    setWidthPx((current) => {
      const clamped = clampWidth(current);
      optionsRef.current.writeStored(clamped);
      return clamped;
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [clampWidth]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startWidth: widthPx,
      pointerId: event.pointerId,
    };
    document.body.classList.add(RESIZING_BODY_CLASS);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [disabled, widthPx]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const signed = optionsRef.current.edge === 'end' ? deltaX : -deltaX;
    setWidthPx(clampWidth(dragRef.current.startWidth + signed));
  }, [clampWidth]);

  const resizeHandleProps: HorizontalPanelResizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  };

  return { widthPx, resizeHandleProps };
}
