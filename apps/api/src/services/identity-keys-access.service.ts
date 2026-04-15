/**
 * Authorization for viewing another identity's E2E public keys (including SPKs).
 *
 * Keys are only returned to: self, mutual friends, or identities that share
 * a conversation (DM or group) with the viewer. Blocked pairs are denied.
 *
 * @module services/identity-keys-access
 */

import { ObjectId } from 'mongodb';
import type { IdentityDocument, IdentityPublicKeys } from '../models/identity';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getPreKeyRepository } from '../repositories/pre-key.repository';
import { isBlockedByEither } from './block.service';

/**
 * Whether the viewer may call GET /identity/:id/keys or POST .../pre-keys/claim
 * for the target identity.
 */
export async function canViewerAccessTargetIdentityKeys(
  viewerId: ObjectId,
  targetId: ObjectId
): Promise<boolean> {
  if (viewerId.equals(targetId)) {
    return true;
  }
  if (await isBlockedByEither(viewerId, targetId)) {
    return false;
  }
  const friendshipRepo = getFriendshipRepository();
  if (await friendshipRepo.areFriends(viewerId, targetId)) {
    return true;
  }
  const conversationRepo = getConversationRepository();
  const shared = await conversationRepo.findAnyWithBothParticipants(viewerId, targetId);
  return shared !== null;
}

/**
 * Augments each device with the active signed pre-key (read-only) for safety fingerprints.
 */
export async function attachActiveSignedPreKeysToPublicKeys(
  identity: IdentityDocument,
  base: IdentityPublicKeys
): Promise<IdentityPublicKeys> {
  const preKeyRepo = getPreKeyRepository();
  const oid = identity._id;
  const devices = await Promise.all(
    base.devices.map(async (d) => {
      const row = await preKeyRepo.getActiveSignedPreKey(oid, d.deviceId);
      if (!row?.signature) {
        return { ...d, signedPreKey: null };
      }
      return {
        ...d,
        signedPreKey: {
          keyId: row.keyId,
          ecdhPublicKey: row.ecdhPublicKey,
          kemPublicKey: row.kemPublicKey,
          signature: row.signature,
        },
      };
    })
  );
  return { ...base, devices };
}
