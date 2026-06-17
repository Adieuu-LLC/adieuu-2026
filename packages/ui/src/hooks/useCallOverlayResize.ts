import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampCallOverlayHeight,
  resolveInitialCallOverlayHeight,
  writeStoredCallOverlayHeight,
} from '../services/callOverlayPreferences';

export interface UseCallOverlayResizeOptions {
  disabled?: boolean;
}

export interface CallOverlayResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useCallOverlayResize(options: UseCallOverlayResizeOptions = {}) {
  const { disabled = false } = options;
  const initialHeight = resolveInitialCallOverlayHeight();
  const [heightPx, setHeightPx] = useState(initialHeight);
  const [committedHeightPx, setCommittedHeightPx] = useState(initialHeight);
  const dragRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);

  useEffect(() => {
    const onWindowResize = () => {
      setHeightPx((current) => {
        const clamped = clampCallOverlayHeight(current);
        setCommittedHeightPx(clamped);
        return clamped;
      });
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setHeightPx((current) => {
      const clamped = clampCallOverlayHeight(current);
      writeStoredCallOverlayHeight(clamped);
      setCommittedHeightPx(clamped);
      return clamped;
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragRef.current = {
      startY: event.clientY,
      startHeight: heightPx,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [disabled, heightPx]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - dragRef.current.startY;
    setHeightPx(clampCallOverlayHeight(dragRef.current.startHeight + deltaY));
  }, []);

  const resizeHandleProps: CallOverlayResizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  };

  return { heightPx, committedHeightPx, resizeHandleProps };
}
