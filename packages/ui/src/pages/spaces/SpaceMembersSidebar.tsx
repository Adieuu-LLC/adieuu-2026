import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicIdentity, PublicSpaceMember, PublicSpaceRole } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { Icon } from '../../icons/Icon';
import { Spinner } from '../../components/Spinner';
import { resolveDisplayName } from '../conversations/conversationUtils';

interface SpaceMembersSidebarProps {
  spaceId: string;
  roles: PublicSpaceRole[];
  selfId: string | undefined;
  listMembers: (
    spaceId: string,
    options?: { limit?: number; cursor?: string },
  ) => Promise<{ success: boolean; data?: { members: PublicSpaceMember[]; cursor: string | null } }>;
  resolveProfile: (identityId: string) => PublicIdentity | undefined;
  onClose: () => void;
}

const PAGE_SIZE = 30;

export function SpaceMembersSidebar({
  spaceId,
  roles,
  selfId,
  listMembers,
  resolveProfile,
  onClose,
}: SpaceMembersSidebarProps) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<PublicSpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current++;
    setMembers([]);
    setCursor(null);
    setLoading(true);
    loadingRef.current = false;
  }, [spaceId]);

  const loadPage = useCallback(
    async (c?: string | null) => {
      if (loadingRef.current) return;
      const gen = c ? generationRef.current : ++generationRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await listMembers(spaceId, { limit: PAGE_SIZE, cursor: c ?? undefined });
        if (gen !== generationRef.current) return;
        if (res.success && res.data) {
          setMembers((prev) => (c ? [...prev, ...res.data!.members] : res.data!.members));
          setCursor(res.data.cursor);
        }
      } catch {
        // consumed -- void call sites cannot handle rejections
      } finally {
        if (gen === generationRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [listMembers, spaceId],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const roleMap = useMemo(() => {
    const map = new Map<string, PublicSpaceRole>();
    for (const role of roles) map.set(role.id, role);
    return map;
  }, [roles]);

  const getMemberRoleLabel = useCallback(
    (member: PublicSpaceMember): string | null => {
      for (const roleId of member.roleIds) {
        const role = roleMap.get(roleId);
        if (role && !role.isDefaultMember) return role.name;
      }
      return null;
    },
    [roleMap],
  );

  return (
    <div className="conversation-members-sidebar">
      <div className="conversation-members-header">
        <h3>{t('conversations.members', 'Members')}</h3>
        <span className="conversation-members-count">{members.length}</span>
        <Button
          variant="ghost"
          size="sm"
          className="conversation-members-close-btn"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
        >
          <Icon name="x" size="sm" />
        </Button>
      </div>

      <div className="conversation-members-list">
        {members.map((member) => {
          const profile = resolveProfile(member.identityId);
          const displayName = profile
            ? resolveDisplayName(member.identityId, { [member.identityId]: profile } as Record<string, PublicIdentity>, {})
            : member.identityId.slice(0, 8);
          const roleLabel = getMemberRoleLabel(member);
          const isSelf = member.identityId === selfId;

          if (!profile) {
            return (
              <div key={member.id} className="conversation-member-row">
                <div className="conversation-member-avatar">
                  <span className="conversation-member-avatar-placeholder">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="conversation-member-info">
                  <span className="conversation-member-name">{displayName}</span>
                  {roleLabel && <span className="conversation-member-role-badge">{roleLabel}</span>}
                </div>
              </div>
            );
          }

          return (
            <IdentityHoverCard
              key={member.id}
              identity={profile}
            >
              <div className="conversation-member-row">
                <div className="conversation-member-avatar">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="conversation-member-avatar-img"
                    />
                  ) : (
                    <span className="conversation-member-avatar-placeholder">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="conversation-member-info">
                  <span className="conversation-member-name">
                    {displayName}
                    {isSelf && (
                      <span className="conversation-member-you">
                        {t('conversations.memberYou', '(you)')}
                      </span>
                    )}
                  </span>
                  {roleLabel && (
                    <span className="conversation-member-role-badge">{roleLabel}</span>
                  )}
                </div>
              </div>
            </IdentityHoverCard>
          );
        })}

        {loading && (
          <div className="conversation-members-loading">
            <Spinner size="sm" />
          </div>
        )}

        {!loading && cursor && (
          <Button
            variant="ghost"
            size="sm"
            className="conversation-members-load-more"
            onClick={() => void loadPage(cursor)}
          >
            {t('common.loadMore', 'Load more')}
          </Button>
        )}
      </div>
    </div>
  );
}
