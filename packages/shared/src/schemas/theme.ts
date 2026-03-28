/**
 * Zod validation schemas for theme data.
 *
 * These schemas enforce that colour values are safe CSS colour strings
 * and reject anything that could be used for injection (url(), expression(),
 * var(), env(), @import, javascript:, etc.).
 *
 * @module schemas/theme
 */

import { z } from 'zod';

const MAX_COLOR_VALUE_LENGTH = 64;

/**
 * Patterns that are explicitly forbidden in CSS colour values.
 * Tested case-insensitively.
 */
const FORBIDDEN_CSS_PATTERNS = [
  'url(',
  'expression(',
  'var(',
  'env(',
  '@import',
  '@charset',
  '@font-face',
  'javascript:',
  '<script',
  '</',
  '\\\\',
  'behavior:',
  '-moz-binding',
] as const;

const FORBIDDEN_RE = new RegExp(
  FORBIDDEN_CSS_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

/**
 * Validates a single CSS colour value.
 * Accepts: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), oklch(), named colours.
 * Rejects: url(), expression(), var(), env(), @import, JS injection, and values > 64 chars.
 */
export const CssColorValueSchema = z
  .string()
  .min(1)
  .max(MAX_COLOR_VALUE_LENGTH)
  .refine((val) => !FORBIDDEN_RE.test(val), {
    message: 'Colour value contains a forbidden pattern',
  });

export const ThemeColorTokensSchema = z.object({
  bgPrimary: CssColorValueSchema,
  bgSecondary: CssColorValueSchema,
  bgTertiary: CssColorValueSchema,
  bgElevated: CssColorValueSchema,
  bgHover: CssColorValueSchema,
  bgActive: CssColorValueSchema,

  textPrimary: CssColorValueSchema,
  textSecondary: CssColorValueSchema,
  textMuted: CssColorValueSchema,
  textInverse: CssColorValueSchema,

  accentPrimary: CssColorValueSchema,
  accentPrimaryHover: CssColorValueSchema,
  accentPrimaryActive: CssColorValueSchema,
  accentSecondary: CssColorValueSchema,
  accentGlow: CssColorValueSchema,

  border: CssColorValueSchema,
  borderMuted: CssColorValueSchema,
  borderFocus: CssColorValueSchema,

  success: CssColorValueSchema,
  successBg: CssColorValueSchema,
  warning: CssColorValueSchema,
  warningBg: CssColorValueSchema,
  error: CssColorValueSchema,
  errorBg: CssColorValueSchema,
  info: CssColorValueSchema,
  infoBg: CssColorValueSchema,
  danger: CssColorValueSchema,

  logoPrimary: CssColorValueSchema,
  logoSecondary: CssColorValueSchema,
});

export const ThemeDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(50),
  description: z.string().max(200).default(''),
  version: z.number().int().min(1),
  colors: ThemeColorTokensSchema,
  author: z.string().max(50).optional(),
});

/**
 * Stricter schema used when importing a user-uploaded theme file.
 * Uses .strict() to reject any unknown keys.
 */
export const ThemeImportSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(50),
    description: z.string().max(200).default(''),
    version: z.number().int().min(1),
    colors: ThemeColorTokensSchema.strict(),
  })
  .strict();

export const ThemeMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  label: z.enum(['official', 'community']),
  authorIdentityId: z.string().optional(),
  authorUsername: z.string().optional(),
  downloads: z.number().optional(),
  upvotes: z.number().optional(),
  tags: z.array(z.string().max(20)).max(5).optional(),
  createdAt: z.string(),
});

export const UserThemePreferencesSchema = z.object({
  themeId: z.string().optional(),
  customThemes: z.array(ThemeDefinitionSchema).optional(),
  iconPackId: z.string().max(50).optional(),
});

export const CommunityThemeUploadSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200).default(''),
  theme: ThemeDefinitionSchema,
  tags: z.array(z.string().min(1).max(20)).max(5).default([]),
});
