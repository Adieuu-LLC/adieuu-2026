import { type createApiClient } from '@adieuu/shared';
import {
  encryptGroupName,
  encryptMemberSettings,
  type MemberSettingsMap,
} from './conversationCryptoService';

type ApiClient = ReturnType<typeof createApiClient>;

export async function addMemberAction(
  api: ApiClient,
  conversationId: string,
  identityId: string
): Promise<boolean> {
  try {
    const resp = await api.conversations.addMember(conversationId, identityId);
    return resp.success;
  } catch {
    return false;
  }
}

export async function removeMemberAction(
  api: ApiClient,
  conversationId: string,
  identityId: string
): Promise<boolean> {
  try {
    const resp = await api.conversations.removeMember(conversationId, identityId);
    return resp.success;
  } catch {
    return false;
  }
}

export async function leaveGroupAction(
  api: ApiClient,
  conversationId: string,
  options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
): Promise<boolean> {
  try {
    const resp = await api.conversations.leave(conversationId, options);
    return resp.success;
  } catch {
    return false;
  }
}

export async function promoteToAdminAction(
  api: ApiClient,
  conversationId: string,
  identityId: string
): Promise<boolean> {
  try {
    const resp = await api.conversations.promoteToAdmin(conversationId, identityId);
    return resp.success;
  } catch {
    return false;
  }
}

export async function terminateGroupAction(
  api: ApiClient,
  conversationId: string
): Promise<boolean> {
  try {
    const resp = await api.conversations.terminateGroup(conversationId);
    return resp.success;
  } catch {
    return false;
  }
}

export async function renameGroupAction(
  api: ApiClient,
  conversationId: string,
  newName: string
): Promise<{ ok: boolean; encryptedName?: string; nameNonce?: string }> {
  try {
    const encrypted = encryptGroupName(newName, conversationId);
    const resp = await api.conversations.updateName(
      conversationId,
      encrypted.encryptedName,
      encrypted.nameNonce
    );
    if (!resp.success) return { ok: false };
    return {
      ok: true,
      encryptedName: encrypted.encryptedName,
      nameNonce: encrypted.nameNonce,
    };
  } catch {
    return { ok: false };
  }
}

export async function updateMemberSettingsAction(
  api: ApiClient,
  conversationId: string,
  settings: MemberSettingsMap
): Promise<{
  ok: boolean;
  encryptedMemberSettings?: string;
  memberSettingsNonce?: string;
}> {
  try {
    const encrypted = encryptMemberSettings(settings, conversationId);
    const resp = await api.conversations.updateMemberSettings(
      conversationId,
      encrypted.encryptedMemberSettings,
      encrypted.memberSettingsNonce
    );
    if (!resp.success) return { ok: false };
    return {
      ok: true,
      encryptedMemberSettings: encrypted.encryptedMemberSettings,
      memberSettingsNonce: encrypted.memberSettingsNonce,
    };
  } catch {
    return { ok: false };
  }
}
