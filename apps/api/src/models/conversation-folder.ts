/**
 * Conversation folder model
 * Per-identity folders for organising conversations into groups.
 *
 * Each identity can create folders to visually group conversations
 * in the sidebar. Folders are identity-scoped and do not affect
 * the underlying conversations themselves.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type FolderIconType = 'dynamic' | 'icon';

export interface ConversationFolderDocument extends BaseDocument {
  /** The identity that owns this folder */
  identityId: ObjectId;

  /** User-chosen display name */
  name: string;

  /**
   * 'dynamic' — show overlapping conversation avatars (up to 3).
   * 'icon' — show a single FontAwesome icon with optional colour.
   */
  iconType: FolderIconType;

  /** FontAwesome icon name when iconType === 'icon' */
  iconName?: string;

  /** Hex colour for the icon when iconType === 'icon' */
  iconColor?: string;

  /** Ordered list of conversation IDs in this folder */
  conversationIds: ObjectId[];

  /** Whether the folder is pinned as a favourite */
  favorited: boolean;

  /** Sort weight for future drag-reorder of folders themselves */
  sortOrder: number;
}

export interface PublicConversationFolder {
  id: string;
  name: string;
  iconType: FolderIconType;
  iconName?: string;
  iconColor?: string;
  conversationIds: string[];
  favorited: boolean;
  sortOrder: number;
}

export function toPublicConversationFolder(
  doc: ConversationFolderDocument,
): PublicConversationFolder {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    iconType: doc.iconType,
    ...(doc.iconName ? { iconName: doc.iconName } : {}),
    ...(doc.iconColor ? { iconColor: doc.iconColor } : {}),
    conversationIds: doc.conversationIds.map((id) => id.toHexString()),
    favorited: doc.favorited,
    sortOrder: doc.sortOrder,
  };
}
