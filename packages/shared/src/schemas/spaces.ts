/**
 * Zod validation schemas for Space request payloads.
 *
 * Shared between the client (create/edit flows) and the API routes so slug,
 * name, visibility, and cipher-challenge rules stay in a single place.
 *
 * @module schemas/spaces
 */

import { z } from 'zod';
import {
  SPACE_VISIBILITY_VALUES,
  SPACE_SLUG_MIN_LENGTH,
  SPACE_SLUG_MAX_LENGTH,
  SPACE_SLUG_PATTERN,
  SPACE_NAME_MIN_LENGTH,
  SPACE_NAME_MAX_LENGTH,
  SPACE_DESCRIPTION_MAX_LENGTH,
  SPACE_CHANNEL_NAME_MIN_LENGTH,
  SPACE_CHANNEL_NAME_MAX_LENGTH,
  SPACE_MESSAGE_MAX_LENGTH,
} from '../api/spaces-types';

export const SpaceVisibilitySchema = z.enum(SPACE_VISIBILITY_VALUES);

export const SpaceSlugSchema = z
  .string()
  .min(SPACE_SLUG_MIN_LENGTH)
  .max(SPACE_SLUG_MAX_LENGTH)
  .regex(SPACE_SLUG_PATTERN, 'Slug must be lowercase letters, numbers, and internal hyphens');

/** Blind-relay cipher verification challenge (opaque to the server). */
export const CipherCheckSchema = z.object({
  knownValue: z.string().min(1).max(64),
  encryptedKnownValue: z.string().min(1).max(500),
  nonce: z.string().min(1).max(100),
});

export const CreateSpaceSchema = z
  .object({
    id: z.string().length(24).optional(),
    slug: SpaceSlugSchema,
    name: z.string().min(SPACE_NAME_MIN_LENGTH).max(SPACE_NAME_MAX_LENGTH),
    description: z.string().max(SPACE_DESCRIPTION_MAX_LENGTH).optional(),
    visibility: SpaceVisibilitySchema,
    allowFreeMembers: z.boolean().optional(),
    cipherCheck: CipherCheckSchema.optional(),
  })
  .refine((v) => !(v.visibility === 'public' && v.cipherCheck), {
    message: 'Public spaces cannot have Space-wide E2EE',
    path: ['cipherCheck'],
  });

export const UpdateSpaceSchema = z
  .object({
    name: z.string().min(SPACE_NAME_MIN_LENGTH).max(SPACE_NAME_MAX_LENGTH).optional(),
    description: z.string().max(SPACE_DESCRIPTION_MAX_LENGTH).optional(),
    visibility: SpaceVisibilitySchema.optional(),
    allowFreeMembers: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });

export const CreateSpaceInviteSchema = z.object({
  identityId: z.string().length(24),
});

export const SendSpaceMessageSchema = z.object({
  content: z.string().min(1).max(SPACE_MESSAGE_MAX_LENGTH),
  clientMessageId: z.string().uuid(),
  replyToMessageId: z.string().length(24).optional(),
  mentionedIdentityIds: z.array(z.string().length(24)).max(50).optional(),
});

export const EditSpaceMessageSchema = z.object({
  content: z.string().min(1).max(SPACE_MESSAGE_MAX_LENGTH),
});

export const AddSpaceReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export const PinSpaceMessageSchema = z.object({
  messageId: z.string().length(24),
});

export const CreateSpaceChannelSchema = z.object({
  name: z.string().min(SPACE_CHANNEL_NAME_MIN_LENGTH).max(SPACE_CHANNEL_NAME_MAX_LENGTH),
  type: z.literal('text'),
});

export type CreateSpaceBody = z.infer<typeof CreateSpaceSchema>;
export type UpdateSpaceBody = z.infer<typeof UpdateSpaceSchema>;
export type CreateSpaceInviteBody = z.infer<typeof CreateSpaceInviteSchema>;
export type SendSpaceMessageBody = z.infer<typeof SendSpaceMessageSchema>;
export type CreateSpaceChannelBody = z.infer<typeof CreateSpaceChannelSchema>;
