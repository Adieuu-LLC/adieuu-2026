/**
 * Shared IndexedDB wipe when ending an E2EE message search session.
 *
 * @module services/messageSearch/messageSearchSessionEnd
 */

import { loadMessageSearchRetention } from '../../hooks/useMessageSearchPreferences';
import { messageSearchCacheDeleteConversation } from './messageSearchCacheDb';

export function endMessageSearchSessionAndWipeCache(args: {
  identityId: string;
  conversationId: string;
  adminDisallowPersistentCache: boolean;
}): void {
  const { identityId, conversationId, adminDisallowPersistentCache } = args;
  const retention = loadMessageSearchRetention(identityId);
  if (adminDisallowPersistentCache || retention !== 'never') {
    void messageSearchCacheDeleteConversation(conversationId);
  }
}
