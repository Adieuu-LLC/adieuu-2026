/**
 * Prefetch + cache Space members/roles for channel nicknames, colours, and the
 * members sidebar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicSpaceMember, PublicSpaceRole } from '@adieuu/shared';
import type { SpacesApi } from '@adieuu/shared';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { onSpaceMemberUpdated } from '../../services/spacesMembershipEvents';
import { spaceMembersToSettingsMap } from '../../pages/spaces/groupSpaceMembersByRole';

export function useSpaceChannelMembers(params: {
  spaceId: string;
  api: { spaces: Pick<SpacesApi, 'listRoles' | 'listMembers'> };
  resolveProfiles: (ids: string[]) => void;
}): {
  memberRoles: PublicSpaceRole[];
  memberSettings: MemberSettingsMap;
  spaceMembersById: Record<string, PublicSpaceMember>;
  upsertSpaceMembers: (list: readonly PublicSpaceMember[]) => void;
  removeSpaceMember: (identityId: string) => void;
  handleSidebarMembersChange: (list: readonly PublicSpaceMember[]) => void;
} {
  const { spaceId, api, resolveProfiles } = params;
  const [memberRoles, setMemberRoles] = useState<PublicSpaceRole[]>([]);
  const [spaceMembersById, setSpaceMembersById] = useState<Record<string, PublicSpaceMember>>(
    {},
  );

  const upsertSpaceMembers = useCallback((list: readonly PublicSpaceMember[]) => {
    if (list.length === 0) return;
    setSpaceMembersById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of list) {
        const existing = next[m.identityId];
        if (
          !existing ||
          existing.nickname !== m.nickname ||
          existing.color !== m.color ||
          existing.joinedAt !== m.joinedAt ||
          existing.roleIds.length !== m.roleIds.length ||
          existing.roleIds.some((id, i) => id !== m.roleIds[i])
        ) {
          next[m.identityId] = m;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const memberSettings: MemberSettingsMap = useMemo(
    () => spaceMembersToSettingsMap(Object.values(spaceMembersById), memberRoles),
    [spaceMembersById, memberRoles],
  );

  useEffect(() => {
    setSpaceMembersById({});
    setMemberRoles([]);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    void api.spaces.listRoles(spaceId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setMemberRoles(res.data.roles);
      } else {
        setMemberRoles([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId, api]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    const prefetch = async () => {
      let cursor: string | null | undefined;
      let pages = 0;
      const maxPages = 10;
      do {
        const res = await api.spaces.listMembers(spaceId, {
          limit: 50,
          cursor: cursor ?? undefined,
        });
        if (cancelled || !res.success || !res.data) return;
        upsertSpaceMembers(res.data.members);
        const ids = res.data.members.map((m) => m.identityId);
        if (ids.length > 0) resolveProfiles(ids);
        cursor = res.data.cursor;
        pages += 1;
      } while (cursor && pages < maxPages);
    };
    void prefetch();
    return () => {
      cancelled = true;
    };
  }, [spaceId, api, upsertSpaceMembers, resolveProfiles]);

  useEffect(() => {
    return onSpaceMemberUpdated((sid, member) => {
      if (sid !== spaceId) return;
      upsertSpaceMembers([member]);
    });
  }, [spaceId, upsertSpaceMembers]);

  const handleSidebarMembersChange = useCallback(
    (list: readonly PublicSpaceMember[]) => {
      upsertSpaceMembers(list);
      const ids = list.map((m) => m.identityId);
      if (ids.length > 0) resolveProfiles(ids);
    },
    [upsertSpaceMembers, resolveProfiles],
  );

  const removeSpaceMember = useCallback((identityId: string) => {
    setSpaceMembersById((prev) => {
      if (!(identityId in prev)) return prev;
      const next = { ...prev };
      delete next[identityId];
      return next;
    });
  }, []);

  return {
    memberRoles,
    memberSettings,
    spaceMembersById,
    upsertSpaceMembers,
    removeSpaceMember,
    handleSidebarMembersChange,
  };
}
