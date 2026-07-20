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
  SPACE_SEED_ROLE_SYSTEMS,
  SPACE_PERMISSIONS,
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

const EncryptedSpaceFieldSchema = z.object({
  encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH),
  nameNonce: z.string().min(1).max(500),
  cipherId: z.string().min(1).max(256),
});

export const CreateSpaceEncryptedSeedSchema = z.object({
  channel: EncryptedSpaceFieldSchema,
  roles: z
    .array(
      EncryptedSpaceFieldSchema.extend({
        system: z.enum(SPACE_SEED_ROLE_SYSTEMS),
      }),
    )
    .length(2)
    .refine(
      (roles) => {
        const systems = new Set(roles.map((r) => r.system));
        return systems.has('admin') && systems.has('member');
      },
      { message: 'encryptedSeed.roles must include admin and member' },
    ),
});

export const CreateSpaceSchema = z
  .object({
    id: z.string().length(24).optional(),
    slug: SpaceSlugSchema.optional(),
    name: z.string().min(SPACE_NAME_MIN_LENGTH).max(SPACE_NAME_MAX_LENGTH).optional(),
    description: z.string().max(SPACE_DESCRIPTION_MAX_LENGTH).optional(),
    visibility: SpaceVisibilitySchema,
    allowFreeMembers: z.boolean().optional(),
    cipherCheck: CipherCheckSchema.optional(),
    e2ee: z.boolean().optional(),
    encryptIdentity: z.boolean().optional(),
    cipherRequired: z.boolean().optional(),
    encryptedSeed: CreateSpaceEncryptedSeedSchema.optional(),
    encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    nameNonce: z.string().min(1).max(500).optional(),
    cipherId: z.string().min(1).max(256).optional(),
    encryptedDescription: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    descriptionNonce: z.string().min(1).max(500).optional(),
  })
  .refine(
    (v) =>
      !(
        v.visibility === 'public' &&
        (v.cipherCheck || v.e2ee || v.cipherRequired || v.encryptIdentity)
      ),
    {
      message: 'Public spaces cannot use Cipher gates or E2EE',
      path: ['cipherCheck'],
    },
  )
  .refine((v) => !((v.e2ee || v.cipherRequired) && !v.cipherCheck), {
    message: 'cipherCheck is required when e2ee or cipherRequired is enabled',
    path: ['cipherCheck'],
  })
  .refine((v) => !(v.encryptIdentity && !v.e2ee), {
    message: 'encryptIdentity requires e2ee',
    path: ['encryptIdentity'],
  })
  .refine((v) => !(v.e2ee && !v.encryptedSeed), {
    message: 'encryptedSeed is required when e2ee is enabled',
    path: ['encryptedSeed'],
  })
  .refine(
    (v) => {
      if (!v.encryptIdentity) return true;
      return !!(v.encryptedName && v.nameNonce && v.cipherId);
    },
    {
      message: 'encryptedName, nameNonce, and cipherId are required when encryptIdentity is enabled',
      path: ['encryptedName'],
    },
  )
  .refine(
    (v) => {
      if (!v.encryptIdentity) return true;
      // No plaintext identity when encrypting for the directory.
      return !v.name && !v.description;
    },
    {
      message: 'plaintext name/description are not allowed when encryptIdentity is enabled',
      path: ['name'],
    },
  )
  .refine(
    (v) => {
      if (v.encryptIdentity) return true;
      return typeof v.name === 'string' && v.name.length >= SPACE_NAME_MIN_LENGTH;
    },
    {
      message: 'name is required when encryptIdentity is not enabled',
      path: ['name'],
    },
  )
  .refine(
    (v) => {
      const hasDesc = !!v.encryptedDescription;
      const hasNonce = !!v.descriptionNonce;
      return hasDesc === hasNonce;
    },
    {
      message: 'encryptedDescription and descriptionNonce must be provided together',
      path: ['encryptedDescription'],
    },
  )
  .refine((v) => !(v.encryptedDescription && !v.encryptIdentity), {
    message: 'encryptedDescription requires encryptIdentity',
    path: ['encryptedDescription'],
  })
  // Public/listed Spaces need a custom vanity slug; Hidden Spaces use ObjectId.
  .refine(
    (v) => {
      if (v.visibility === 'hidden') return true;
      return typeof v.slug === 'string' && v.slug.length >= SPACE_SLUG_MIN_LENGTH;
    },
    {
      message: 'slug is required for public and listed spaces',
      path: ['slug'],
    },
  )
  .refine(
    (v) => {
      if (v.visibility !== 'hidden') return true;
      return typeof v.id === 'string' && v.id.length === 24;
    },
    {
      message: 'id is required for hidden spaces (used as the routing slug)',
      path: ['id'],
    },
  )
  .refine(
    (v) => {
      if (v.visibility !== 'hidden' || !v.id) return true;
      // Client may omit slug (server assigns id) or must send slug === id.
      return v.slug === undefined || v.slug === v.id;
    },
    {
      message: 'hidden space slug must equal id when provided',
      path: ['slug'],
    },
  );

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

const SpacePermissionSchema = z.enum(SPACE_PERMISSIONS);

export const CreateSpaceRoleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(SpacePermissionSchema).max(SPACE_PERMISSIONS.length).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    displaySeparately: z.boolean().optional(),
    mentionable: z.boolean().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    nameNonce: z.string().min(1).max(500).optional(),
    cipherId: z.string().min(1).max(256).optional(),
  })
  .refine(
    (v) => {
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      const hasPartial =
        !!(v.encryptedName || v.nameNonce || v.cipherId) && !hasCipher;
      return !hasPartial;
    },
    { message: 'encryptedName, nameNonce, and cipherId must be provided together' },
  );

export const UpdateSpaceRoleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(SpacePermissionSchema).max(SPACE_PERMISSIONS.length).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    displaySeparately: z.boolean().optional(),
    mentionable: z.boolean().optional(),
    isDefaultMember: z.boolean().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    nameNonce: z.string().min(1).max(500).optional(),
    cipherId: z.string().min(1).max(256).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (v) => {
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      const hasPartial =
        !!(v.encryptedName || v.nameNonce || v.cipherId) && !hasCipher;
      return !hasPartial;
    },
    { message: 'encryptedName, nameNonce, and cipherId must be provided together' },
  );

export const SetMemberRolesSchema = z.object({
  roleIds: z.array(z.string().length(24)).max(50),
});

export const CreateSpaceChannelSchema = z
  .object({
    name: z.string().min(SPACE_CHANNEL_NAME_MIN_LENGTH).max(SPACE_CHANNEL_NAME_MAX_LENGTH).optional(),
    type: z.literal('text'),
    allowedRoleIds: z.array(z.string().length(24)).max(50).optional(),
    categoryId: z.string().length(24).optional(),
    encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    nameNonce: z.string().min(1).max(500).optional(),
    cipherId: z.string().min(1).max(256).optional(),
    /**
     * When true (or omitted on an e2ee Space), the channel inherits the parent
     * Space's `cipherCheck` unless an explicit `cipherCheck` is provided.
     * When false, the channel stores no `cipherCheck`.
     */
    encrypt: z.boolean().optional(),
    cipherCheck: CipherCheckSchema.optional(),
  })
  .refine(
    (v) => {
      const hasPlain = typeof v.name === 'string' && v.name.length > 0;
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      return (hasPlain || hasCipher) && !(hasPlain && hasCipher);
    },
    { message: 'Provide either name (plaintext) or encryptedName+nameNonce+cipherId, not both' },
  )
  .refine((v) => !(v.encrypt === false && v.cipherCheck), {
    message: 'cipherCheck cannot be set when encrypt is false',
    path: ['cipherCheck'],
  });

export const UpdateSpaceChannelSchema = z
  .object({
    name: z.string().min(SPACE_CHANNEL_NAME_MIN_LENGTH).max(SPACE_CHANNEL_NAME_MAX_LENGTH).optional(),
    allowedRoleIds: z.array(z.string().length(24)).max(50).optional(),
    categoryId: z.string().length(24).nullable().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
    nameNonce: z.string().min(1).max(500).optional(),
    cipherId: z.string().min(1).max(256).optional(),
    /** Set/clear channel content encryption (`cipherCheck`). */
    encrypt: z.boolean().optional(),
    cipherCheck: CipherCheckSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (v) => {
      const hasPlain = typeof v.name === 'string' && v.name.length > 0;
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      const hasPartial =
        !!(v.encryptedName || v.nameNonce || v.cipherId) && !hasCipher;
      if (hasPartial) return false;
      if (hasPlain && hasCipher) return false;
      return true;
    },
    { message: 'Provide either name (plaintext) or encryptedName+nameNonce+cipherId, not both' },
  )
  .refine((v) => !(v.encrypt === false && v.cipherCheck), {
    message: 'cipherCheck cannot be set when encrypt is false',
    path: ['cipherCheck'],
  });

const spaceCategoryNameFields = {
  name: z.string().min(SPACE_CHANNEL_NAME_MIN_LENGTH).max(SPACE_CHANNEL_NAME_MAX_LENGTH).optional(),
  allowedRoleIds: z.array(z.string().length(24)).max(50).optional(),
  encryptedName: z.string().min(1).max(SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH).optional(),
  nameNonce: z.string().min(1).max(500).optional(),
  cipherId: z.string().min(1).max(256).optional(),
  parentCategoryId: z.string().length(24).nullable().optional(),
};

export const CreateSpaceChannelCategorySchema = z
  .object(spaceCategoryNameFields)
  .refine(
    (v) => {
      const hasPlain = typeof v.name === 'string' && v.name.length > 0;
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      return (hasPlain || hasCipher) && !(hasPlain && hasCipher);
    },
    { message: 'Provide either name (plaintext) or encryptedName+nameNonce+cipherId, not both' },
  );

export const UpdateSpaceChannelCategorySchema = z
  .object({
    ...spaceCategoryNameFields,
    position: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (v) => {
      const hasPlain = typeof v.name === 'string' && v.name.length > 0;
      const hasCipher = !!(v.encryptedName && v.nameNonce && v.cipherId);
      const hasPartial =
        !!(v.encryptedName || v.nameNonce || v.cipherId) && !hasCipher;
      if (hasPartial) return false;
      if (hasPlain && hasCipher) return false;
      return true;
    },
    { message: 'Provide either name (plaintext) or encryptedName+nameNonce+cipherId, not both' },
  );

export const UpdateSpaceChannelLayoutSchema = z.object({
  groups: z
    .array(
      z.object({
        parentCategoryId: z.string().length(24).nullable(),
        items: z
          .array(
            z.discriminatedUnion('type', [
              z.object({ type: z.literal('channel'), id: z.string().length(24) }),
              z.object({ type: z.literal('category'), id: z.string().length(24) }),
            ]),
          )
          .max(500),
      }),
    )
    .max(201),
});

export type CreateSpaceBody = z.infer<typeof CreateSpaceSchema>;
export type UpdateSpaceBody = z.infer<typeof UpdateSpaceSchema>;
export type CreateSpaceInviteBody = z.infer<typeof CreateSpaceInviteSchema>;
export type SendSpaceMessageBody = z.infer<typeof SendSpaceMessageSchema>;
export type CreateSpaceChannelBody = z.infer<typeof CreateSpaceChannelSchema>;
export type UpdateSpaceChannelBody = z.infer<typeof UpdateSpaceChannelSchema>;
export type CreateSpaceChannelCategoryBody = z.infer<typeof CreateSpaceChannelCategorySchema>;
export type UpdateSpaceChannelCategoryBody = z.infer<typeof UpdateSpaceChannelCategorySchema>;
export type UpdateSpaceChannelLayoutBody = z.infer<typeof UpdateSpaceChannelLayoutSchema>;
export type CreateSpaceRoleBody = z.infer<typeof CreateSpaceRoleSchema>;
export type UpdateSpaceRoleBody = z.infer<typeof UpdateSpaceRoleSchema>;
export type SetMemberRolesBody = z.infer<typeof SetMemberRolesSchema>;
