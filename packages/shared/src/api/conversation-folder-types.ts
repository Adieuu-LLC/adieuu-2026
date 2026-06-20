export type FolderIconType = 'dynamic' | 'icon';

export type FolderIconName =
  | 'folder'
  | 'folders'
  | 'layer-group'
  | 'ball-pile'
  | 'building'
  | 'family'
  | 'sportsball'
  | 'dice'
  | 'dice-d10'
  | 'dice-d12'
  | 'game-board'
  | 'game-console-handheld';

export interface ConversationFolder {
  id: string;
  name: string;
  iconType: FolderIconType;
  iconName?: string;
  iconColor?: string;
  conversationIds: string[];
  favorited: boolean;
  sortOrder: number;
}

export interface CreateConversationFolderParams {
  name: string;
  conversationIds: string[];
  iconType?: FolderIconType;
  iconName?: FolderIconName;
  iconColor?: string;
}

export interface UpdateConversationFolderParams {
  name?: string;
  iconType?: FolderIconType;
  iconName?: FolderIconName;
  iconColor?: string | null;
  favorited?: boolean;
  sortOrder?: number;
}
