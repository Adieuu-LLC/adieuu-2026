import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

export function DraggableConversation({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? 'conversation-dragging' : undefined}
    >
      {children}
    </div>
  );
}

export function DroppableTarget({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'conversation-drop-over' : undefined}
    >
      {children}
    </div>
  );
}
