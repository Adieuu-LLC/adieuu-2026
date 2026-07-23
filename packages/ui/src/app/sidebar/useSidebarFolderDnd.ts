/**
 * Typed drag-and-drop ids and handlers for mixed conversation/space folders.
 */

import { useCallback, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { CreateConversationFolderParams } from '@adieuu/shared';

export type FolderableKind = 'conversation' | 'space';

export interface FolderableRef {
  kind: FolderableKind;
  id: string;
}

export function folderableDndId(kind: FolderableKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseFolderableDndId(raw: string): FolderableRef | null {
  if (raw.startsWith('conversation:')) {
    return { kind: 'conversation', id: raw.slice('conversation:'.length) };
  }
  if (raw.startsWith('space:')) {
    return { kind: 'space', id: raw.slice('space:'.length) };
  }
  return null;
}

export function parseFolderDropId(raw: string): string | null {
  if (raw.startsWith('folder:')) return raw.slice('folder:'.length);
  return null;
}

export function buildCreateFolderParams(
  name: string,
  a: FolderableRef,
  b: FolderableRef,
): CreateConversationFolderParams {
  const conversationIds: string[] = [];
  const spaceIds: string[] = [];
  for (const ref of [a, b]) {
    if (ref.kind === 'conversation') conversationIds.push(ref.id);
    else spaceIds.push(ref.id);
  }
  return {
    name,
    ...(conversationIds.length > 0 ? { conversationIds } : {}),
    ...(spaceIds.length > 0 ? { spaceIds } : {}),
  };
}

export interface UseSidebarFolderDndParams {
  folderedConversationIds: Set<string>;
  folderedSpaceIds: Set<string>;
  createFolder: (params: CreateConversationFolderParams) => Promise<unknown>;
  addConversationToFolder: (folderId: string, conversationId: string) => Promise<void>;
  addSpaceToFolder: (folderId: string, spaceId: string) => Promise<void>;
  newFolderName: string;
}

export function useSidebarFolderDnd({
  folderedConversationIds,
  folderedSpaceIds,
  createFolder,
  addConversationToFolder,
  addSpaceToFolder,
  newFolderName,
}: UseSidebarFolderDndParams) {
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const isFoldered = useCallback(
    (ref: FolderableRef) =>
      ref.kind === 'conversation'
        ? folderedConversationIds.has(ref.id)
        : folderedSpaceIds.has(ref.id),
    [folderedConversationIds, folderedSpaceIds],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const draggedRaw = String(active.id);
      const overRaw = String(over.id);
      if (draggedRaw === overRaw) return;

      const dragged = parseFolderableDndId(draggedRaw);
      if (!dragged || isFoldered(dragged)) return;

      const folderId = parseFolderDropId(overRaw);
      if (folderId) {
        if (dragged.kind === 'conversation') {
          void addConversationToFolder(folderId, dragged.id);
        } else {
          void addSpaceToFolder(folderId, dragged.id);
        }
        return;
      }

      const overItem = parseFolderableDndId(overRaw);
      if (!overItem || isFoldered(overItem)) return;

      void createFolder(buildCreateFolderParams(newFolderName, overItem, dragged));
    },
    [
      isFoldered,
      addConversationToFolder,
      addSpaceToFolder,
      createFolder,
      newFolderName,
    ],
  );

  return {
    dragActiveId,
    handleDragStart,
    handleDragEnd,
    draggedRef: dragActiveId ? parseFolderableDndId(dragActiveId) : null,
  };
}
