import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { useConversations } from '../../hooks/useConversations';
import { useFriends } from '../../hooks/useFriends';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
import type { FormerMember, PublicGroupInvite, PublicIdentity } from '@adieuu/shared';
import {
  compareInviteMemberRows,
  friendInfoFromPendingInvite,
  inviteMemberRowState,
  mergeFriendInfosById,
} from './inviteMemberModalUtils';

const SEARCH_DEBOUNCE_MS = 300;

export function InviteMemberModal({
  open,
  onOpenChange,
  conversationId,
  currentParticipants,
  pendingInvites,
  participantProfiles,
  onCreateNewConversation,
  onInviteSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentParticipants: string[];
  pendingInvites: PublicGroupInvite[];
  participantProfiles: Record<string, PublicIdentity>;
  onCreateNewConversation: () => void;
  onInviteSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const { friends, searchFriends } = useFriends();
  const { addMember, getFormerMembers } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof friends | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [formerMembers, setFormerMembers] = useState<FormerMember[]>([]);
  const [formerMembersLoaded, setFormerMembersLoaded] = useState(false);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (open && !formerMembersLoaded) {
      void getFormerMembers(conversationId).then((members) => {
        setFormerMembers(members);
        setFormerMembersLoaded(true);
      });
    }
    if (!open) {
      setSearchQuery('');
      setSearchResults(undefined);
      setIsSearching(false);
      setInviting(null);
      setFormerMembersLoaded(false);
      setFormerMembers([]);
    }
  }, [open, conversationId, formerMembersLoaded, getFormerMembers]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(undefined);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const res = await searchFriends(q);
        if (searchSeqRef.current !== seq) return;
        setSearchResults(res);
        setIsSearching(false);
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, searchFriends]);

  const participantSet = useMemo(
    () => new Set(currentParticipants),
    [currentParticipants]
  );

  const pendingInviteSet = useMemo(() => {
    const s = new Set<string>();
    for (const inv of pendingInvites) {
      s.add(inv.invitedIdentityId);
    }
    return s;
  }, [pendingInvites]);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.identity.id)), [friends]);

  const syntheticFromPending = useMemo(() => {
    const extra: typeof friends = [];
    for (const inv of pendingInvites) {
      if (friendIds.has(inv.invitedIdentityId)) continue;
      extra.push(
        friendInfoFromPendingInvite(inv, participantProfiles[inv.invitedIdentityId])
      );
    }
    return extra;
  }, [pendingInvites, friendIds, participantProfiles]);

  const baseFriendList = useMemo(
    () => mergeFriendInfosById([friends, syntheticFromPending]),
    [friends, syntheticFromPending]
  );

  const formerMemberSet = useMemo(
    () => new Set(formerMembers.map((m) => m.id)),
    [formerMembers]
  );

  const displayFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = baseFriendList;
    if (q.length >= 2) {
      const merged = mergeFriendInfosById([baseFriendList, searchResults ?? []]);
      list = merged.filter(
        (f) =>
          f.identity.displayName.toLowerCase().includes(q) ||
          f.identity.username.toLowerCase().includes(q)
      );
    }
    const withMeta = list.map((f) => {
      const identityId = f.identity.id;
      const state = inviteMemberRowState(identityId, participantSet, pendingInviteSet);
      return {
        friend: f,
        identityId,
        state,
        displayName: f.identity.displayName || f.identity.username,
      };
    });
    withMeta.sort(compareInviteMemberRows);
    return withMeta;
  }, [
    baseFriendList,
    searchQuery,
    searchResults,
    participantSet,
    pendingInviteSet,
  ]);

  const handleInvite = useCallback(
    async (identityId: string) => {
      setInviting(identityId);
      const success = await addMember(conversationId, identityId);
      setInviting(null);
      if (success) {
        onInviteSuccess?.();
        onOpenChange(false);
      }
    },
    [addMember, conversationId, onInviteSuccess, onOpenChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content invite-member-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('conversations.inviteMember.title', 'Invite Member')}
              </Dialog.Title>
            </div>

            <div className="invite-member-modal-notice">
              <Icon name="info" className="invite-member-modal-notice-icon" />
              <span>
                {t(
                  'conversations.inviteMember.privacyNote',
                  'Invitees will be able to see current and invited member lists, but the conversation topic or name will be hidden until they join.'
                )}
              </span>
            </div>

            <div className="invite-member-modal-search">
              <Input
                inputSize="sm"
                leftIcon={<Icon name="search" />}
                rightIcon={isSearching ? <span className="spinner spinner-sm" /> : undefined}
                placeholder={t('conversations.searchFriendsPlaceholder', 'Search friends...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="invite-member-modal-list">
              {displayFriends.map(({ friend, identityId, state }) => {
                const isFormer = formerMemberSet.has(identityId) && state === 'inviteable';
                const isInviting = inviting === identityId;
                const initialSource =
                  friend.identity.displayName || friend.identity.username || '?';

                return (
                  <div
                    key={identityId}
                    className={`invite-member-modal-item${isFormer ? ' invite-member-modal-item--former' : ''}`}
                  >
                    <div className="invite-member-modal-item-avatar">
                      {friend.identity.avatarUrl ? (
                        <img
                          src={friend.identity.avatarUrl}
                          alt=""
                          className="invite-member-modal-item-avatar-img"
                        />
                      ) : (
                        <span className="invite-member-modal-item-avatar-placeholder">
                          {initialSource.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="invite-member-modal-item-text">
                      <span className="invite-member-modal-item-name">
                        {friend.identity.displayName}
                      </span>
                      <span className="invite-member-modal-item-username">
                        @{friend.identity.username}
                      </span>
                      <div className="invite-member-modal-item-badges">
                        {state === 'member' && (
                          <span className="invite-member-modal-item-badge invite-member-modal-item-badge--member">
                            {t('conversations.inviteMember.statusMember', 'Member')}
                          </span>
                        )}
                        {state === 'invited' && (
                          <span className="invite-member-modal-item-badge invite-member-modal-item-badge--invited">
                            {t('conversations.inviteMember.statusInvited', 'Invited')}
                          </span>
                        )}
                        {isFormer && (
                          <span className="invite-member-modal-item-left-badge">
                            {t('conversations.inviteMember.previouslyLeft', 'Previously left')}
                          </span>
                        )}
                      </div>
                    </div>
                    {state === 'inviteable' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleInvite(identityId)}
                        disabled={!!inviting}
                      >
                        {isInviting ? (
                          <span className="spinner spinner-sm" />
                        ) : (
                          t('conversations.inviteMember.invite', 'Invite')
                        )}
                      </Button>
                    ) : (
                      <span className="invite-member-modal-item-status-done" aria-hidden>
                        <Icon name="check" />
                      </span>
                    )}
                  </div>
                );
              })}

              {displayFriends.length === 0 && (
                <div className="invite-member-modal-empty">
                  {searchQuery.trim()
                    ? t('conversations.noMatchingFriends', 'No matching friends')
                    : t('conversations.inviteMember.noEligible', 'No friends available to invite')}
                </div>
              )}
            </div>

            <div className="confirm-dialog-footer invite-member-modal-footer">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onCreateNewConversation();
                }}
                disabled={!!inviting}
              >
                {t('conversations.inviteMember.createNew', 'Create New Conversation Instead')}
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={!!inviting}>
                {t('common.close', 'Close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
