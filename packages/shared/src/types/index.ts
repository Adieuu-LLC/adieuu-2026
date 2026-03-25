// Shared TypeScript types
// These are inferred from Zod schemas where possible

import type { z } from 'zod';
import type { UserSchema, ApiResponseSchema } from '../schemas';
import type { PublicIdentity } from '../api/client';

export type {
  ThemeColorTokens,
  ThemeDefinition,
  ThemeLabel,
  ThemeMeta,
  CommunityTheme,
  UserThemePreferences,
} from './theme';

export { TOKEN_TO_CSS_VAR, THEME_TOKEN_KEYS } from './theme';

// Infer types from schemas for single source of truth
export type User = z.infer<typeof UserSchema>;
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    /** Structured hints (e.g. PAYLOAD_TOO_LARGE → maxBytes) */
    details?: {
      maxBytes?: number;
    };
  };
};

// Platform detection
export type Platform = 'web' | 'desktop' | 'mobile';

// Common utility types
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// Conversation member
export interface ConversationMember {
  identity: PublicIdentity;
  joinedAt: string;
}

// Conversation types
export type ConversationType = 'direct' | 'group';

// Conversation
export interface Conversation {
  id: string;
  type: ConversationType;
  members: ConversationMember[];
  customTitle?: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}
