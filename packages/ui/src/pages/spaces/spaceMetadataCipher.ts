/**
 * Encrypt/decrypt helpers for Space structural metadata (names, descriptions).
 * Uses the same Community Cipher master key as channel messages.
 */

import {
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_MEMBER_ROLE_NAME,
  DEFAULT_SPACE_CATEGORY_NAME,
  DEFAULT_SPACE_CHANNEL_NAME,
  type CreateSpaceEncryptedSeed,
  type EncryptedSpaceField,
  type PublicSpace,
  type PublicSpaceChannel,
  type PublicSpaceRole,
} from '@adieuu/shared';
import type { CommunityCipher } from '@adieuu/crypto';
import { encryptContent, decryptBody } from './spaceChannelCipher';

export interface SpaceMetadataPlaceholders {
  encryptedSpace: string;
  encryptedChannel: string;
  encryptedRole: string;
}

export function encryptSpaceMetadataField(
  cipher: CommunityCipher,
  plaintext: string,
): EncryptedSpaceField {
  const fields = encryptContent(cipher, plaintext);
  return {
    encryptedName: fields.ciphertext,
    nameNonce: fields.nonce,
    cipherId: fields.cipherId,
  };
}

export function decryptSpaceMetadataField(
  cipher: CommunityCipher | null | undefined,
  fields: { encryptedName?: string; nameNonce?: string; cipherId?: string } | undefined,
  fallback: string,
): string {
  if (!fields?.encryptedName || !fields.nameNonce || !fields.cipherId) {
    return fallback;
  }
  return decryptBody(
    {
      ciphertext: fields.encryptedName,
      nonce: fields.nameNonce,
      cipherId: fields.cipherId,
    },
    cipher,
    fallback,
  );
}

export function decryptSpaceDescription(
  cipher: CommunityCipher | null | undefined,
  space: Pick<PublicSpace, 'encryptedDescription' | 'descriptionNonce' | 'cipherId'>,
  fallback: string,
): string {
  if (!space.encryptedDescription || !space.descriptionNonce || !space.cipherId) {
    return fallback;
  }
  return decryptBody(
    {
      ciphertext: space.encryptedDescription,
      nonce: space.descriptionNonce,
      cipherId: space.cipherId,
    },
    cipher,
    fallback,
  );
}

/** Build client-encrypted seed payloads for default category/channel + system roles. */
export function buildEncryptedSpaceSeed(cipher: CommunityCipher): CreateSpaceEncryptedSeed {
  return {
    category: encryptSpaceMetadataField(cipher, DEFAULT_SPACE_CATEGORY_NAME),
    channel: encryptSpaceMetadataField(cipher, DEFAULT_SPACE_CHANNEL_NAME),
    roles: [
      {
        system: 'admin',
        ...encryptSpaceMetadataField(cipher, DEFAULT_ADMIN_ROLE_NAME),
      },
      {
        system: 'member',
        ...encryptSpaceMetadataField(cipher, DEFAULT_MEMBER_ROLE_NAME),
      },
    ],
  };
}

/** Resolve a Space display name, decrypting when identity is encrypted. */
export function resolveSpaceDisplayName(
  space: Pick<
    PublicSpace,
    'name' | 'slug' | 'encryptIdentity' | 'encryptedName' | 'nameNonce' | 'cipherId'
  >,
  cipher: CommunityCipher | null | undefined,
  placeholders: Pick<SpaceMetadataPlaceholders, 'encryptedSpace'>,
): string {
  if (!space.encryptIdentity) {
    return space.name || space.slug;
  }
  const decrypted = decryptSpaceMetadataField(
    cipher,
    {
      encryptedName: space.encryptedName,
      nameNonce: space.nameNonce,
      cipherId: space.cipherId,
    },
    '',
  );
  if (decrypted) return decrypted;
  return placeholders.encryptedSpace;
}

/** Resolve a Space description for display. */
export function resolveSpaceDisplayDescription(
  space: Pick<
    PublicSpace,
    | 'description'
    | 'encryptIdentity'
    | 'encryptedDescription'
    | 'descriptionNonce'
    | 'cipherId'
  >,
  cipher: CommunityCipher | null | undefined,
): string | undefined {
  if (!space.encryptIdentity) {
    return space.description;
  }
  if (!space.encryptedDescription) return undefined;
  const decrypted = decryptSpaceDescription(cipher, space, '');
  return decrypted || undefined;
}

/** Resolve a channel display name, decrypting when ciphertext is present. */
export function resolveChannelDisplayName(
  channel: Pick<PublicSpaceChannel, 'name' | 'encryptedName' | 'nameNonce' | 'cipherId'>,
  cipher: CommunityCipher | null | undefined,
  placeholders: Pick<SpaceMetadataPlaceholders, 'encryptedChannel'>,
): string {
  if (channel.encryptedName && channel.nameNonce && channel.cipherId) {
    const decrypted = decryptSpaceMetadataField(
      cipher,
      {
        encryptedName: channel.encryptedName,
        nameNonce: channel.nameNonce,
        cipherId: channel.cipherId,
      },
      '',
    );
    if (decrypted) return decrypted;
    return placeholders.encryptedChannel;
  }
  return channel.name;
}

/** Resolve a role display name, decrypting when ciphertext is present. */
export function resolveRoleDisplayName(
  role: Pick<PublicSpaceRole, 'name' | 'encryptedName' | 'nameNonce' | 'cipherId'>,
  cipher: CommunityCipher | null | undefined,
  placeholders: Pick<SpaceMetadataPlaceholders, 'encryptedRole'>,
): string {
  if (role.encryptedName && role.nameNonce && role.cipherId) {
    const decrypted = decryptSpaceMetadataField(
      cipher,
      {
        encryptedName: role.encryptedName,
        nameNonce: role.nameNonce,
        cipherId: role.cipherId,
      },
      '',
    );
    if (decrypted) return decrypted;
    return placeholders.encryptedRole;
  }
  return role.name;
}
