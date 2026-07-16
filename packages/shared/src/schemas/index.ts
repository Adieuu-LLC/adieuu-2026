import { z } from 'zod';

// User schema - example shared validation
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// API response wrapper schema
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  });

// Auth schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

// Theme schemas
export {
  CssColorValueSchema,
  ThemeColorTokensSchema,
  ThemeDefinitionSchema,
  ThemeImportSchema,
  ThemeMetaSchema,
  UserThemePreferencesSchema,
  CommunityThemeUploadSchema,
} from './theme';

// Space schemas
export {
  SpaceVisibilitySchema,
  SpaceSlugSchema,
  CipherCheckSchema,
  CreateSpaceSchema,
  UpdateSpaceSchema,
  CreateSpaceInviteSchema,
  SendSpaceMessageSchema,
  EditSpaceMessageSchema,
  AddSpaceReactionSchema,
  PinSpaceMessageSchema,
  CreateSpaceChannelSchema,
  type CreateSpaceBody,
  type UpdateSpaceBody,
  type CreateSpaceInviteBody,
  type SendSpaceMessageBody,
  type CreateSpaceChannelBody,
} from './spaces';

// Re-export zod for convenience
export { z };
