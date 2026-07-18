import { useCallback, useEffect, useState } from 'react';
import type { createApiClient, IdentityPublicKeys } from '@adieuu/shared';
import type { DecryptedConversation } from './types';

type IdentityApi = ReturnType<typeof createApiClient>['identity'];

/**
 * Owns conversation-level security/verification state: cached peer public keys,
 * the verification revision counter, the key-change alert banner, and the
 * member-security modal.
 */
export function useConversationSecurityState(params: {
  conversationId: string | undefined;
  conversation: DecryptedConversation | undefined;
  identityApi: IdentityApi;
}) {
  const { conversationId, conversation, identityApi } = params;

  const [memberSecurityModal, setMemberSecurityModal] = useState<{ id: string; label: string } | null>(
    null,
  );
  const openMemberSecurity = useCallback((identityId: string, displayLabel: string) => {
    setMemberSecurityModal({ id: identityId, label: displayLabel });
  }, []);

  const [peerPublicKeysById, setPeerPublicKeysById] = useState<Record<string, IdentityPublicKeys>>({});
  const [verificationRevision, setVerificationRevision] = useState(0);
  const bumpVerificationRevision = useCallback(() => {
    setVerificationRevision((n) => n + 1);
  }, []);

  // Conversation-level key-change alert: set when any rendered message reveals
  // that a previously verified device fingerprint no longer matches the
  // sender's current keys. Per-message icons remain; this banner makes the
  // first mismatch impossible to miss. Dismissal is per conversation view.
  const [keyChangeAlertIdentityIds, setKeyChangeAlertIdentityIds] = useState<string[]>([]);
  const [keyChangeAlertDismissed, setKeyChangeAlertDismissed] = useState(false);
  useEffect(() => {
    setKeyChangeAlertIdentityIds([]);
    setKeyChangeAlertDismissed(false);
  }, [conversationId]);
  const handleDeviceTrustMismatch = useCallback((identityId: string) => {
    setKeyChangeAlertIdentityIds((prev) => {
      if (prev.includes(identityId)) return prev;
      setKeyChangeAlertDismissed(false);
      return [...prev, identityId];
    });
  }, []);

  useEffect(() => {
    setPeerPublicKeysById({});
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation?.id) return;
    let cancelled = false;
    const participants = conversation.participants;
    void Promise.all(
      participants.map(async (pid) => {
        const res = await identityApi.getPublicKeys(pid);
        if (cancelled || !res.success || !res.data) return;
        setPeerPublicKeysById((prev) => ({ ...prev, [pid]: res.data! }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [conversation?.id, conversation?.participants.join(','), identityApi]);

  return {
    memberSecurityModal,
    setMemberSecurityModal,
    openMemberSecurity,
    peerPublicKeysById,
    verificationRevision,
    bumpVerificationRevision,
    keyChangeAlertIdentityIds,
    keyChangeAlertDismissed,
    setKeyChangeAlertDismissed,
    handleDeviceTrustMismatch,
  };
}
