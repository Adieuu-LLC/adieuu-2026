/**
 * Zod request shapes for conversation routes.
 *
 * @module routes/conversations/conversation-schemas
 */

import { z } from '@adieuu/shared/schemas';

export const CreateConversationSchema = z.object({
  type: z.enum(['dm', 'group']),
  participants: z.array(z.string().length(24)).min(1).max(24),
  encryptedName: z.string().max(500).optional(),
  nameNonce: z.string().max(100).optional(),
  /** When true (DM only), create a new thread even if one already exists with this peer. */
  forceNew: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  ciphertext: z.string().min(1).max(1_000_000),
  nonce: z.string().min(1).max(100),
  wrappedKeys: z
    .array(
      z.object({
        identityId: z.string().length(24),
        ephemeralPublicKey: z.string().min(1).max(200),
        kemCiphertext: z.string().min(1).max(3000),
        wrappedSessionKey: z.string().min(1).max(500),
        wrappingNonce: z.string().min(1).max(100),
        preKeyType: z.enum(['static', 'spk', 'otpk']),
        signedPreKeyId: z.string().uuid().optional(),
        oneTimePreKeyId: z.string().uuid().optional(),
        spkKemCiphertext: z.string().max(3000).optional(),
        otpkKemCiphertext: z.string().max(3000).optional(),
        routingTag: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientMessageId: z.string().uuid(),
  e2eMediaIds: z.array(z.string().min(1).max(100)).max(10).optional(),
  expiresInSeconds: z.number().int().min(30).max(1209600).optional(),
  replyToMessageId: z.string().length(24).optional(),
  mentionedIdentityIds: z.array(z.string().length(24)).max(200).optional(),
});

export const EditMessageSchema = z.object({
  ciphertext: z.string().min(1).max(1_000_000),
  nonce: z.string().min(1).max(100),
  wrappedKeys: z
    .array(
      z.object({
        identityId: z.string().length(24),
        ephemeralPublicKey: z.string().min(1).max(200),
        kemCiphertext: z.string().min(1).max(3000),
        wrappedSessionKey: z.string().min(1).max(500),
        wrappingNonce: z.string().min(1).max(100),
        preKeyType: z.enum(['static', 'spk', 'otpk']),
        signedPreKeyId: z.string().uuid().optional(),
        oneTimePreKeyId: z.string().uuid().optional(),
        spkKemCiphertext: z.string().max(3000).optional(),
        otpkKemCiphertext: z.string().max(3000).optional(),
        routingTag: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientEditId: z.string().uuid(),
});

export const AddMemberSchema = z.object({
  identityId: z.string().length(24),
});

export const PromoteAdminSchema = z.object({
  identityId: z.string().length(24),
});

export const LeaveSchema = z
  .object({
    transferAdminTo: z.string().length(24).optional(),
    transferStrategy: z.enum(['oldest', 'most_active']).optional(),
  })
  .optional();

export const UpdateNameSchema = z.object({
  encryptedName: z.string().min(1).max(500),
  nameNonce: z.string().min(1).max(100),
});

export const UpdateMemberSettingsSchema = z.object({
  encryptedMemberSettings: z.string().min(1).max(10_000),
  memberSettingsNonce: z.string().min(1).max(100),
});

export const UpdatePreferencesSchema = z.object({
  archived: z.boolean().optional(),
  keepArchived: z.boolean().optional(),
  favorited: z.boolean().optional(),
});

export const UpdateGifsDisabledSchema = z.object({
  gifsDisabled: z.boolean(),
});

export const UpdateCustomEmojisDisabledSchema = z.object({
  customEmojisDisabled: z.boolean(),
});

export const UpdateMessageSearchCacheSchema = z.object({
  disallowPersistentMessageSearchCache: z.boolean(),
});

export const PinMessageBodySchema = z.object({
  messageId: z.string().length(24),
});

export const SendReactionSchema = z.object({
  ciphertext: z.string().min(1).max(50_000),
  nonce: z.string().min(1).max(100),
  wrappedKeys: z
    .array(
      z.object({
        identityId: z.string().length(24),
        ephemeralPublicKey: z.string().min(1).max(200),
        kemCiphertext: z.string().min(1).max(3000),
        wrappedSessionKey: z.string().min(1).max(500),
        wrappingNonce: z.string().min(1).max(100),
        preKeyType: z.enum(['static', 'spk', 'otpk']),
        signedPreKeyId: z.string().uuid().optional(),
        oneTimePreKeyId: z.string().uuid().optional(),
        spkKemCiphertext: z.string().max(3000).optional(),
        otpkKemCiphertext: z.string().max(3000).optional(),
        routingTag: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientReactionId: z.string().uuid(),
});

export type CreateConversationBody = z.infer<typeof CreateConversationSchema>;
export type SendMessageBody = z.infer<typeof SendMessageSchema>;
export type EditMessageBody = z.infer<typeof EditMessageSchema>;
export type SendReactionBody = z.infer<typeof SendReactionSchema>;
