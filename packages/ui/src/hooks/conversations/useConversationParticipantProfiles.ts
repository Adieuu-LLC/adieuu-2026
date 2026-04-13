import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { createApiClient, PublicIdentity } from '@adieuu/shared';

type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Participant profile resolution and signing-key cache for decryption.
 * Refs are stable across renders; {@link resolveParticipants} identity is stable for socket wiring.
 */
export function useConversationParticipantProfiles(
  api: ApiClient,
  setParticipantProfiles: Dispatch<SetStateAction<Record<string, PublicIdentity>>>
) {
  const signingKeyCache = useRef<Record<string, string>>({});
  const resolvedProfileIds = useRef<Set<string>>(new Set());

  const resolveParticipants = useCallback(
    async (ids: string[]): Promise<Record<string, PublicIdentity>> => {
      const missing = ids.filter((id) => !resolvedProfileIds.current.has(id));
      if (missing.length === 0) return {};

      for (const id of missing) resolvedProfileIds.current.add(id);

      const fetched: Record<string, PublicIdentity> = {};

      await Promise.all(
        missing.map(async (id) => {
          try {
            const resp = await api.identity.getProfile(id);
            if (resp.data) {
              fetched[id] = resp.data;
            }
          } catch {
            resolvedProfileIds.current.delete(id);
          }

          try {
            if (!signingKeyCache.current[id]) {
              const keysResp = await api.identity.getPublicKeys(id);
              if (keysResp.data) {
                signingKeyCache.current[id] = keysResp.data.signingPublicKey;
              }
            }
          } catch {
            // Signing keys unavailable
          }
        })
      );

      if (Object.keys(fetched).length > 0) {
        setParticipantProfiles((prev) => ({ ...prev, ...fetched }));
      }

      return fetched;
    },
    [api, setParticipantProfiles]
  );

  const refreshParticipantProfile = useCallback(
    async (identityId: string): Promise<void> => {
      resolvedProfileIds.current.delete(identityId);
      try {
        const resp = await api.identity.getProfile(identityId);
        if (resp.data) {
          setParticipantProfiles((prev) => ({ ...prev, [identityId]: resp.data! }));
        }
      } catch {
        setParticipantProfiles((prev) => {
          const next = { ...prev };
          delete next[identityId];
          return next;
        });
      }
    },
    [api, setParticipantProfiles]
  );

  return {
    signingKeyCache,
    resolveParticipants,
    refreshParticipantProfile,
  };
}
