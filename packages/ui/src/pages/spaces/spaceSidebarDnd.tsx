/**
 * Thin @dnd-kit wrappers for the Space channel sidebar with Discord-style
 * before / after / on drop zones.
 */

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import {
  useDndMonitor,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { SpaceSidebarDropZone } from './spaceSidebarLayout';

export type SpaceDropTargetData = {
  kind: 'channel' | 'category';
  id: string;
};

export type DropHighlight = {
  overId: string;
  zone: SpaceSidebarDropZone;
} | null;

type DropHighlightApi = {
  highlight: DropHighlight;
  zoneRef: MutableRefObject<DropHighlight>;
};

const SpaceDropHighlightContext = createContext<DropHighlightApi | null>(null);

export function resolveDropZone(
  clientY: number,
  rect: { top: number; height: number },
): SpaceSidebarDropZone {
  if (rect.height <= 0) return 'on';
  const ratio = (clientY - rect.top) / rect.height;
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'on';
}

/** Tracks active over-id + zone for drop line / on indicators. */
export function SpaceDropHighlightProvider({
  children,
  zoneRef,
}: {
  children: ReactNode;
  /** Shared with drag-end handler (must outlive this provider). */
  zoneRef: MutableRefObject<DropHighlight>;
}) {
  const [highlight, setHighlight] = useState<DropHighlight>(null);
  const pointerYRef = useRef<number | null>(null);
  const detachPointerMoveRef = useRef<(() => void) | null>(null);

  useDndMonitor({
    onDragStart() {
      detachPointerMoveRef.current?.();
      const onMove = (e: PointerEvent) => {
        pointerYRef.current = e.clientY;
      };
      pointerYRef.current = null;
      window.addEventListener('pointermove', onMove);
      detachPointerMoveRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        detachPointerMoveRef.current = null;
      };
    },
    onDragMove(event) {
      const over = event.over;
      if (!over) {
        zoneRef.current = null;
        setHighlight(null);
        return;
      }
      const translated = event.active.rect.current.translated;
      const pointerY =
        pointerYRef.current ??
        (translated
          ? translated.top + translated.height / 2
          : over.rect.top + over.rect.height / 2);
      const zone = resolveDropZone(pointerY, over.rect);
      const next = { overId: String(over.id), zone };
      zoneRef.current = next;
      setHighlight((prev) =>
        prev && prev.overId === next.overId && prev.zone === next.zone ? prev : next,
      );
    },
    onDragEnd() {
      detachPointerMoveRef.current?.();
      // Keep zoneRef until end handler reads it; clear visual after.
      setHighlight(null);
    },
    onDragCancel() {
      detachPointerMoveRef.current?.();
      zoneRef.current = null;
      setHighlight(null);
    },
  });

  const value = useMemo(() => ({ highlight, zoneRef }), [highlight, zoneRef]);

  return (
    <SpaceDropHighlightContext.Provider value={value}>
      {children}
    </SpaceDropHighlightContext.Provider>
  );
}

export function useSpaceDropHighlight(): DropHighlight {
  return useContext(SpaceDropHighlightContext)?.highlight ?? null;
}

export function DraggableSpaceItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      className={isDragging ? 'space-sidebar-dragging' : undefined}
    >
      {children}
    </div>
  );
}

export function DroppableSpaceTarget({
  id,
  disabled,
  data,
  children,
}: {
  id: string;
  disabled?: boolean;
  data?: SpaceDropTargetData;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data,
  });
  const highlight = useSpaceDropHighlight();
  const active =
    !disabled && highlight && highlight.overId === id
      ? highlight.zone
      : isOver && !disabled
        ? 'on'
        : null;

  const className = useMemo(() => {
    const classes = ['space-sidebar-drop-target'];
    if (active === 'before') classes.push('space-sidebar-drop-line--before');
    if (active === 'after') classes.push('space-sidebar-drop-line--after');
    if (active === 'on') classes.push('space-sidebar-drop-on');
    return classes.join(' ');
  }, [active]);

  return (
    <div ref={setNodeRef} className={className} data-drop-zone={active ?? undefined}>
      {children}
    </div>
  );
}
