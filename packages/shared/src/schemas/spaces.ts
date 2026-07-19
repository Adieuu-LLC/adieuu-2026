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
  SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH,
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
    e2ee: z.boolean().optional(),
    cipherRequired: z.boolean().optional(),
  })
  .refine((v) => !(v.visibility === 'public' && (v.cipherCheck || v.e2ee || v.cipherRequired)), {
    message: 'Public spaces cannot use Cipher gates or E2EE',
    path: ['cipherCheck'],
  })
  .refine((v) => !((v.e2ee || v.cipherRequired) && !v.cipherCheck), {
    message: 'cipherCheck is required when e2ee or cipherRequired is enabled',
    path: ['cipherCheck'],
  });

export const UpdateSpaceSchema = z
  .object({
    name: z.string().min(SPACE_NAME_MIN_LENGTH).max(SPACE_NAME_MAX_LENGTH).optional(),
    description: z.string().max(SPACE_DESCRIPTION_MAX_LENGTH).optional(),
    visibility: SpaceVisibilitySchema.optional(),
    allowFreeMembers: z.boolean().optional(),
    cipherRequired: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });

export const CreateSpaceInviteSchema = z.object({
  identityId: z.string().length(24),
});

const SpaceMessageCommonFields = {
  clientMessageId: z.string().uuid(),
  replyToMessageId: z.string().length(24).optional(),
  mentionedIdentityIds: z.array(z.string().length(24)).max(50).optional(),
  expiresInSeconds: z.number().int().positive().optional(),
};

const SpaceMessageCipherFields = {
  ciphertext: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH),
  nonce: z.string().min(1).max(500),
  cipherId: z.string().min(1).max(256),
};

export const SendSpaceMessageSchema = z
  .object({
    content: z.string().min(1).max(SPACE_MESSAGE_MAX_LENGTH).optional(),
    ...SpaceMessageCipherFields,
    ciphertext: SpaceMessageCipherFields.ciphertext.optional(),
    nonce: SpaceMessageCipherFields.nonce.optional(),
    cipherId: SpaceMessageCipherFields.cipherId.optional(),
    ...SpaceMessageCommonFields,
  })
  .refine(
    (v) => {
      const hasContent = !!v.content;
      const hasCipher = !!(v.ciphertext && v.nonce && v.cipherId);
      return (hasContent || hasCipher) && !(hasContent && hasCipher);
    },
    { message: 'Provide either content (plaintext) or ciphertext+nonce+cipherId (encrypted), not both' },
  );

export const EditSpaceMessageSchema = z
  .object({
    content: z.string().min(1).max(SPACE_MESSAGE_MAX_LENGTH).optional(),
    ciphertext: SpaceMessageCipherFields.ciphertext.optional(),
    nonce: SpaceMessageCipherFields.nonce.optional(),
    cipherId: SpaceMessageCipherFields.cipherId.optional(),
  })
  .refine(
    (v) => {
      const hasContent = !!v.content;
      const hasCipher = !!(v.ciphertext && v.nonce && v.cipherId);
      return (hasContent || hasCipher) && !(hasContent && hasCipher);
    },
    { message: 'Provide either content (plaintext) or ciphertext+nonce+cipherId (encrypted), not both' },
  );

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
