import { useState, useEffect } from 'react';
import { createApiClient } from '@adieuu/shared';
import type { DecryptedConversation } from './types';

type ApiClient = ReturnType<typeof createApiClient>;

export function useDmBlockedByOther(
  api: ApiClient,
  conversation: DecryptedConversation | undefined,
  identityId: string | undefined,
) {
  const [blockedByOther, setBlockedByOther] = useState(false);

  useEffect(() => {
    setBlockedByOther(false);
    if (!conversation || conversation.type !== 'dm' || !identityId) return;
    const otherId = conversation.participants.find((p) => p !== identityId);
    if (!otherId) return;
    let cancelled = false;
    api.blocks.checkBlockedByEither(otherId).then((resp) => {
      if (cancelled) return;
      if (resp.data) {
        setBlockedByOther(resp.data.blockedByEither && !resp.data.blockedByYou);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [conversation?.id, conversation?.type, identityId, api]);

  return { blockedByOther, setBlockedByOther };
}
