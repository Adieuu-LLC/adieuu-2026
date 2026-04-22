// Shared TypeScript types
// These are inferred from Zod schemas where possible

import type { z } from 'zod';
import type { UserSchema, ApiResponseSchema } from '../schemas';

export type {
  ThemeColorTokens,
  ThemeDefinition,
  ThemeLabel,
  ThemeMeta,
  CommunityTheme,
  UserThemePreferences,
} from './theme';

export type {
  ConvScanSealManifestPartV1,
  ConvScanSealManifestV1,
} from './conv-scan-manifest';

export { TOKEN_TO_CSS_VAR, THEME_TOKEN_KEYS } from './theme';

// Infer types from schemas for single source of truth
export type User = z.infer<typeof UserSchema>;
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    /** Structured hints (e.g. PAYLOAD_TOO_LARGE → maxBytes, REJECTED → moderationReason) */
    details?: {
      maxBytes?: number;
      moderationReason?: string;
      moderationReportId?: string;
      suspendedUntil?: string;
    };
  };
};

// Platform detection
export type Platform = 'web' | 'desktop' | 'mobile';

// Common utility types
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
