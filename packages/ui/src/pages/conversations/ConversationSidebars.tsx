/**
 * Right-hand conversation sidebars: settings, members, and message search.
 * Renders whichever pane is active. Purely presentational — coordinated state
 * arrives via grouped hook results from {@link ConversationView}.
 */

import type { ReactNode } from 'react';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { MessageSearchCacheMode } from '../../services/messageSearch/messageSearchCacheTypes';
import type { useConversationDialogState } from '../../hooks/conversations/useConversationDialogState';
import type { useConversationAdminSettings } from '../../hooks/conversations/useConversationAdminSettings';
import type { useConversationPreferences } from '../../hooks/conversations/useConversationPreferences';
import type { ConversationPane } from '../../hooks/conversations/useConversationMessageSearchSession';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import { ConversationSettingsSidebar } from './ConversationSettingsSidebar';
import { ConversationMembersSidebar } from './ConversationMembersSidebar';
import { ConversationMessageSearchPanel } from './ConversationMessageSearch';

type IdentityLike = { id: string } | null | undefined;

export interface ConversationSidebarsProps {
  conversationId: string;
  conversation: DecryptedConversation;
  activePane: ConversationPane;
  onCloseActivePane: () => void;
  identity: IdentityLike;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  isCurrentUserAdmin: boolean;
  canEditMemberSettings: boolean;
  fsConfigEnabled: boolean;
  memberColorDisplay: MemberColorDisplay;

  dialogs: ReturnType<typeof useConversationDialogState>;
  adminSettings: ReturnType<typeof useConversationAdminSettings>;
  prefs: ReturnType<typeof useConversationPreferences>;

  onOpenMemberSecurity: (identityId: string, displayLabel: string) => void;
  onAddMember: () => void;

  pendingInvites: import('@adieuu/shared').PublicGroupInvite[];
  pendingInvitesLoading: boolean;
  onRevokeInvite: (inviteId: string) => Promise<void>;

  messageSearchSessionActive: boolean;
  messageSearchCacheMode: MessageSearchCacheMode;
  getActiveMessages: () => DisplayMessage[];
  loadOlder: () => Promise<void>;
  messagesLoading: boolean;
  activeMessagesOlderCursor: string | null;
  onEndSearchSession: () => void;
  scrollToMessageId: (id: string) => void;
  selfParticipantJoinedAtMs: number | null;
}

export function ConversationSidebars(props: ConversationSidebarsProps): ReactNode {
  const {
    conversationId,
    conversation,
    activePane,
    onCloseActivePane,
    identity,
    participantProfiles,
    memberSettings,
    isCurrentUserAdmin,
    canEditMemberSettings,
    fsConfigEnabled,
    memberColorDisplay,
    dialogs,
    adminSettings,
    prefs,
    onOpenMemberSecurity,
    onAddMember,
    pendingInvites,
    pendingInvitesLoading,
    onRevokeInvite,
    messageSearchSessionActive,
    messageSearchCacheMode,
    getActiveMessages,
    loadOlder,
    messagesLoading,
    activeMessagesOlderCursor,
    onEndSearchSession,
    scrollToMessageId,
    selfParticipantJoinedAtMs,
  } = props;

  const { gifsGloballyDisabled } = prefs;

  return (
    <>
      {activePane === 'settings' && (
        <ConversationSettingsSidebar
          isGroup={conversation.type === 'group'}
          isAdmin={isCurrentUserAdmin}
          renameValue={dialogs.renameValue}
          onRenameValueChange={dialogs.setRenameValue}
          currentGroupName={conversation.decryptedName}
          renaming={dialogs.renaming}
          onRename={dialogs.handleRename}
          fsEnabled={prefs.convFsOverride ?? fsConfigEnabled}
          onFsToggle={prefs.handleConvFsToggle}
          memberColorDisplay={memberColorDisplay}
          gifsDisabledByAdmin={conversation.gifsDisabled ?? false}
          onGifsDisabledByAdminToggle={adminSettings.handleGifsDisabledByAdminToggle}
          gifContentFilter={conversation.gifContentFilter}
          onGifContentFilterChange={adminSettings.handleGifContentFilterChange}
          customEmojisDisabledByAdmin={conversation.customEmojisDisabled ?? false}
          onCustomEmojisDisabledByAdminToggle={adminSettings.handleCustomEmojisDisabledByAdminToggle}
          disallowPersistentMessageSearchCache={conversation.disallowPersistentMessageSearchCache ?? false}
          onMessageSearchCachePolicyToggle={adminSettings.handleMessageSearchCachePolicyToggle}
          allowSkipModeration={conversation.allowSkipModeration ?? false}
          onAllowSkipModerationToggle={adminSettings.handleAllowSkipModerationToggle}
          audioCallsDisabled={conversation.audioCallsDisabled ?? false}
          onAudioCallsDisabledToggle={adminSettings.handleAudioCallsDisabledToggle}
          videoCallsDisabled={conversation.videoCallsDisabled ?? false}
          onVideoCallsDisabledToggle={adminSettings.handleVideoCallsDisabledToggle}
          screenshareDisabled={conversation.screenshareDisabled ?? false}
          onScreenshareDisabledToggle={adminSettings.handleScreenshareDisabledToggle}
          gifsHiddenForMe={prefs.convGifHidden}
          onGifsHiddenForMeToggle={gifsGloballyDisabled ? undefined : prefs.setConvGifHidden}
          gifAnimateOnHoverOnly={prefs.effectiveGifAnimateOnHover}
          onGifAnimateOnHoverOnlyToggle={
            gifsGloballyDisabled ? undefined : prefs.handleGifAnimateOnHoverConversationToggle
          }
          onClose={onCloseActivePane}
        />
      )}

      {activePane === 'members' && (
        <ConversationMembersSidebar
          participants={conversation.participants}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          admins={conversation.admins}
          conversationType={conversation.type}
          isCurrentUserAdmin={isCurrentUserAdmin}
          canEditMemberSettings={canEditMemberSettings}
          selfId={identity?.id}
          editingMemberId={dialogs.editingMemberId}
          onEditMember={dialogs.setEditingMemberId}
          onCloseMemberEdit={dialogs.closeMemberEdit}
          onSaveMemberEdit={dialogs.saveMemberEdit}
          onPromoteToAdmin={dialogs.handlePromoteToAdmin}
          onRemoveMember={dialogs.handleRemoveMember}
          onInviteMember={() => dialogs.setInviteMemberOpen(true)}
          onAddMember={onAddMember}
          pendingInvites={conversation.type === 'group' ? pendingInvites : undefined}
          pendingInvitesLoading={conversation.type === 'group' ? pendingInvitesLoading : undefined}
          onRevokeInvite={
            conversation.type === 'group' && isCurrentUserAdmin ? onRevokeInvite : undefined
          }
          onOpenMemberSecurity={onOpenMemberSecurity}
          onClose={onCloseActivePane}
        />
      )}

      {messageSearchSessionActive && (
        <ConversationMessageSearchPanel
          conversationId={conversationId}
          identityId={identity?.id ?? ''}
          sidebarVisible={activePane === 'search'}
          adminDisallowPersistentCache={conversation.disallowPersistentMessageSearchCache ?? false}
          getActiveMessages={getActiveMessages}
          participantProfiles={participantProfiles}
          cacheMode={messageSearchCacheMode}
          loadOlder={() => loadOlder()}
          messagesLoading={messagesLoading}
          olderCursor={activeMessagesOlderCursor}
          onEndSearchSession={onEndSearchSession}
          onPickMessage={(messageId) => {
            void scrollToMessageId(messageId);
          }}
          selfParticipantJoinedAtMs={selfParticipantJoinedAtMs}
        />
      )}
    </>
  );
}
