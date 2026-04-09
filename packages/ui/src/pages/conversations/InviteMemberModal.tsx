import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { useConversations } from '../../hooks/useConversations';
import { useFriends } from '../../hooks/useFriends';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
import type { FormerMember } from '@adieuu/shared';

export function InviteMemberModal({
  open,
  onOpenChange,
  conversationId,
  currentParticipants,
  onCreateNewConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentParticipants: string[];
  onCreateNewConversation: () => void;
}) {
  const { t } = useTranslation();
  const { friends } = useFriends();
  const { addMember, getFormerMembers } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [formerMembers, setFormerMembers] = useState<FormerMember[]>([]);
  const [formerMembersLoaded, setFormerMembersLoaded] = useState(false);

  useEffect(() => {
    if (open && !formerMembersLoaded) {
      void getFormerMembers(conversationId).then((members) => {
        setFormerMembers(members);
        setFormerMembersLoaded(true);
      });
    }
    if (!open) {
      setSearchQuery('');
      setInviting(null);
      setFormerMembersLoaded(false);
      setFormerMembers([]);
    }
  }, [open, conversationId, formerMembersLoaded, getFormerMembers]);

  const currentParticipantSet = new Set(currentParticipants);
  const formerMemberSet = new Set(formerMembers.map((m) => m.id));

  const eligibleFriends = friends.filter(
    (f) => !currentParticipantSet.has(f.identity.id)
  );

  const filteredFriends = searchQuery.trim()
    ? eligibleFriends.filter(
        (f) =>
          f.identity.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.identity.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : eligibleFriends;

  const handleInvite = useCallback(
    async (identityId: string) => {
      setInviting(identityId);
      const success = await addMember(conversationId, identityId);
      setInviting(null);
      if (success) {
        onOpenChange(false);
      }
    },
    [addMember, conversationId, onOpenChange]
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
                  'Invitees will be able to see current and invited member lists, but the group name will be hidden until they join.'
                )}
              </span>
            </div>

            <div className="invite-member-modal-search">
              <Input
                inputSize="sm"
                leftIcon={<Icon name="search" />}
                placeholder={t('conversations.searchFriendsPlaceholder', 'Search friends...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="invite-member-modal-list">
              {filteredFriends.map((friend) => {
                const isFormer = formerMemberSet.has(friend.identity.id);
                const isInviting = inviting === friend.identity.id;

                return (
                  <div
                    key={friend.identity.id}
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
                          {friend.identity.displayName.charAt(0).toUpperCase()}
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
                      {isFormer && (
                        <span className="invite-member-modal-item-left-badge">
                          {t('conversations.inviteMember.previouslyLeft', 'Previously left')}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleInvite(friend.identity.id)}
                      disabled={!!inviting}
                    >
                      {isInviting ? (
                        <span className="spinner spinner-sm" />
                      ) : (
                        t('conversations.inviteMember.invite', 'Invite')
                      )}
                    </Button>
                  </div>
                );
              })}

              {filteredFriends.length === 0 && (
                <div className="invite-member-modal-empty">
                  {searchQuery
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
