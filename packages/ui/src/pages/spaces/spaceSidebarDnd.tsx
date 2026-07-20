/**
 * Thin @dnd-kit wrappers for the Space channel sidebar.
 */

import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

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
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      className={isOver && !disabled ? 'space-sidebar-drop-over' : undefined}
    >
      {children}
    </div>
  );
}
