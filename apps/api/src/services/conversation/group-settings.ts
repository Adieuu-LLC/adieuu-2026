/**
 * Encrypted name/topic, member settings, and GIF toggle for conversations.
 *
 * @module services/conversation/group-settings
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { createNotification } from '../notification.service';
import { toPublicConversation } from '../../models/conversation';
import { toPublicIdentity } from '../../models/identity';
import type { ConversationResult } from './types';
import { publishConversationEvent, publishToParticipants } from './redis-events';
import { isGroupAdmin } from './group-permissions';

/**
 * Update the encrypted conversation topic or name (group: admin only; DM: any participant).
 */
export async function updateGroupName(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  encryptedName: string,
  nameNonce: string
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (conversation.type === 'dm') {
    const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
    if (!isParticipant) {
      return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
    }

    const updated = await conversationRepo.updateEncryptedName(convObjId, encryptedName, nameNonce);

    await publishToParticipants(conversation.participants, requesterObjId, {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'renamed',
        identityId: requesterObjId.toHexString(),
        conversationType: 'dm',
      },
    });

    return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
  }

  if (conversation.type !== 'group') {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can rename', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateEncryptedName(convObjId, encryptedName, nameNonce);

  const identityRepo = getIdentityRepository();
  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;

  const messageRepo = getMessageRepository();
  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: requesterObjId,
    messageType: 'system',
    systemEvent: {
      type: 'group_renamed',
      identityId: requesterObjId.toHexString(),
      displayName: requesterPublic?.displayName ?? requesterPublic?.username,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: `sys-group-renamed-${Date.now()}`,
  });

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'renamed',
      identityId: requesterObjId.toHexString(),
      conversationType: 'group',
    },
  });

  for (const participantId of conversation.participants) {
    if (participantId.equals(requesterObjId)) continue;
    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: requesterObjId.toHexString(),
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });
    await createNotification(participantId, 'group_renamed', {
      conversationId: convObjId.toHexString(),
    });
  }

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

/**
 * Update encrypted member settings (nicknames/colours).
 * DMs: any participant. Groups: admin only.
 */
export async function updateMemberSettings(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  encryptedMemberSettings: string,
  memberSettingsNonce: string
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can update member settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateMemberSettings(
    convObjId,
    encryptedMemberSettings,
    memberSettingsNonce
  );

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'member_settings_updated',
      identityId: requesterObjId.toHexString(),
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// GIF settings
// ---------------------------------------------------------------------------

/**
 * Toggle whether GIFs are disabled for a conversation.
 * In groups only admins may call this; in DMs either participant may.
 */
export async function updateGifsDisabled(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  gifsDisabled: boolean
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can toggle GIF settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateGifsDisabled(convObjId, gifsDisabled);

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'gifs_disabled_updated',
      identityId: requesterObjId.toHexString(),
      gifsDisabled,
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// Custom emoji settings
// ---------------------------------------------------------------------------

/**
 * Toggle whether custom emojis are disabled for a conversation.
 * In groups only admins may call this; in DMs either participant may.
 */
export async function updateCustomEmojisDisabled(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  customEmojisDisabled: boolean
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can toggle custom emoji settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateCustomEmojisDisabled(convObjId, customEmojisDisabled);

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'custom_emojis_disabled_updated',
      identityId: requesterObjId.toHexString(),
      customEmojisDisabled,
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// Local message search cache policy
// ---------------------------------------------------------------------------

/**
 * Toggle whether members may keep a persistent local plaintext message search index.
 * In groups only admins may call this; in DMs either participant may.
 */
export async function updateDisallowPersistentMessageSearchCache(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  disallowPersistentMessageSearchCache: boolean
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can change this', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateDisallowPersistentMessageSearchCache(
    convObjId,
    disallowPersistentMessageSearchCache
  );

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'message_search_cache_policy_updated',
      identityId: requesterObjId.toHexString(),
      disallowPersistentMessageSearchCache,
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// Allow skip moderation
// ---------------------------------------------------------------------------

/**
 * Toggle whether participants may opt out of client-side moderation scanning per-send.
 * In groups only admins may call this; in DMs either participant may.
 */
export async function updateAllowSkipModeration(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  allowSkipModeration: boolean
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can toggle moderation settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateAllowSkipModeration(convObjId, allowSkipModeration);

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'allow_skip_moderation_updated',
      identityId: requesterObjId.toHexString(),
      allowSkipModeration,
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}
