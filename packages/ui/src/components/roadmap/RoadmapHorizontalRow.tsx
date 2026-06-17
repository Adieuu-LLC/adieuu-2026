import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../icons/Icon';

export function RoadmapHorizontalRow({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = {
      startX: event.clientX,
      startScroll: el.scrollLeft,
      pointerId: event.pointerId,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    el.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
  }, []);

  return (
    <div
      ref={scrollRef}
      className={`roadmap-horizontal-row${dragging ? ' roadmap-horizontal-row--dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </div>
  );
}

export function RoadmapHorizontalScrollHint() {
  return (
    <div className="roadmap-horizontal-hint" aria-hidden>
      <Icon name="chevronRight" size="xs" />
    </div>
  );
}
