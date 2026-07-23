/**
 * Conversation header: wraps {@link ConversationToolbar} and builds its slots
 * (call button, pins menu, media-outbox menu, device signatures, search).
 * Purely presentational — coordinated state arrives from {@link ConversationView}.
 */

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { useConversationPreferences } from '../../hooks/conversations/useConversationPreferences';
import type { ConversationPane } from '../../hooks/conversations/useConversationMessageSearchSession';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import { Icon } from '../../icons/Icon';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { ConversationCallButton } from '../../components/call/ConversationCallButton';
import { ConversationToolbar, type ConversationToolbarAvatarMember } from './ConversationToolbar';
import { ConversationPinsMenu } from './ConversationPinsMenu';
import { ConversationMediaOutboxMenu } from './ConversationMediaOutboxMenu';

export interface ConversationHeaderProps {
  conversation: DecryptedConversation;
  identity: PublicIdentity | null | undefined;
  t: TFunction;

  displayName: string;
  avatarMembers: ConversationToolbarAvatarMember[];
  subtitle: ReactNode;

  isDmBlocked: boolean;
  blockedByOther: boolean;
  audioAllowed: boolean;
  isInCallElsewhere: boolean;
  isInCallHere: boolean;
  onStartCall: () => void;

  canManagePins: boolean;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  messagesById: Map<string, DisplayMessage>;
  memberColorDisplay: MemberColorDisplay;
  loadPinnedMessagesPage: (
    conversationId: string,
    cursor?: string | null,
  ) => Promise<{ messages: DisplayMessage[]; nextCursor: string | null } | null>;
  scrollToMessageId: (id: string) => void;
  onUnpin: (messageId: string) => Promise<void>;
  ensureReplyParentHydration: (conversationId: string, parentMessageId: string) => Promise<void>;
  prefs: ReturnType<typeof useConversationPreferences>;

  mediaOutboxOpen: boolean;
  setMediaOutboxOpen: Dispatch<SetStateAction<boolean>>;
  hasMediaOutboxJobs: boolean;

  onOpenMemberSecurity: (identityId: string, displayLabel: string) => void;

  messageSearchSessionActive: boolean;
  onToggleMessageSearch: () => void;

  activePane: ConversationPane;
  setActivePane: Dispatch<SetStateAction<ConversationPane>>;

  canDeleteConversation: boolean;
  onDeleteGroup: () => void;
  onLeave: () => void;
}

export function ConversationHeader(props: ConversationHeaderProps): ReactNode {
  const {
    conversation,
    identity,
    t,
    displayName,
    avatarMembers,
    subtitle,
    isDmBlocked,
    blockedByOther,
    audioAllowed,
    isInCallElsewhere,
    isInCallHere,
    onStartCall,
    canManagePins,
    participantProfiles,
    memberSettings,
    messagesById,
    memberColorDisplay,
    loadPinnedMessagesPage,
    scrollToMessageId,
    onUnpin,
    ensureReplyParentHydration,
    prefs,
    mediaOutboxOpen,
    setMediaOutboxOpen,
    hasMediaOutboxJobs,
    onOpenMemberSecurity,
    messageSearchSessionActive,
    onToggleMessageSearch,
    activePane,
    setActivePane,
    canDeleteConversation,
    onDeleteGroup,
    onLeave,
  } = props;

  const callEnabled = audioAllowed && !isDmBlocked && !blockedByOther;

  return (
    <ConversationToolbar
      displayName={displayName}
      avatarMembers={avatarMembers}
      subtitle={subtitle}
      callSlot={
        callEnabled ? (
          <ConversationCallButton
            disabled={false}
            disabledReason={isInCallElsewhere ? t('call.alreadyInActiveCall') : undefined}
            inCallForThisConversation={isInCallHere}
            onStartCall={onStartCall}
            onFocusOverlay={undefined}
          />
        ) : undefined
      }
      showCallInMenu={callEnabled}
      onCallMenuClick={onStartCall}
      callMenuDisabled={false}
      callMenuLabel={isInCallHere ? t('call.active') : t('call.startCall')}
      pinsSlot={
        <ConversationPinsMenu
          conversationId={conversation.id}
          pinnedCount={conversation.pinnedMessageIds?.length ?? 0}
          pinnedMessageIdsKey={(conversation.pinnedMessageIds ?? []).join(',')}
          loadPinnedMessagesPage={loadPinnedMessagesPage}
          scrollToMessageId={scrollToMessageId}
          onUnpin={onUnpin}
          canUnpin={canManagePins}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          messagesById={messagesById}
          ensureReplyParentHydration={ensureReplyParentHydration}
          identity={identity ?? undefined}
          memberColorDisplay={memberColorDisplay}
          gifsEnabled={
            !(conversation.gifsDisabled ?? false) && !prefs.convGifHidden && !prefs.gifsGloballyDisabled
          }
          gifAnimateOnHoverOnly={prefs.effectiveGifAnimateOnHover}
        />
      }
      mediaJobsSlot={
        <ConversationMediaOutboxMenu
          conversationId={conversation.id}
          externalOpen={mediaOutboxOpen}
          onExternalOpenChange={setMediaOutboxOpen}
        />
      }
      deviceSignaturesSlot={
        identity?.id ? (
          <Tooltip
            content={t('conversations.memberSecurity.toolbarTooltip', 'Open your device signatures for this conversation')}
            position="bottom"
          >
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="conversation-toolbar-btn conversation-toolbar-btn--icon-only"
              onClick={() => onOpenMemberSecurity(identity.id, t('conversations.you', 'You'))}
              aria-label={t('conversations.memberSecurity.toolbarAria', 'Device signatures')}
            >
              <span className="conversation-toolbar-btn-icon" aria-hidden>
                <Icon name="key" size="sm" />
              </span>
            </Button>
          </Tooltip>
        ) : null
      }
      searchSlot={
        <Tooltip
          content={
            messageSearchSessionActive
              ? t('conversations.messageSearch.endSearch', 'End search')
              : t('conversations.messageSearch.toolbarAria', 'Search messages')
          }
          position="bottom"
        >
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${messageSearchSessionActive ? ' active' : ''}`}
            onClick={onToggleMessageSearch}
            aria-label={
              messageSearchSessionActive
                ? t('conversations.messageSearch.endSearch', 'End search')
                : t('conversations.messageSearch.toolbarAria', 'Search messages')
            }
            aria-pressed={messageSearchSessionActive}
          >
            <span className="conversation-toolbar-btn-icon" aria-hidden>
              <Icon name="search" size="sm" />
            </span>
          </Button>
        </Tooltip>
      }
      showSettings={activePane === 'settings'}
      onToggleSettings={() => {
        setActivePane((prev) => (prev === 'settings' ? null : 'settings'));
      }}
      showMembers={activePane === 'members'}
      onToggleMembers={() => {
        setActivePane((prev) => (prev === 'members' ? null : 'members'));
      }}
      isGroup={conversation.type === 'group'}
      canDeleteConversation={canDeleteConversation}
      onDeleteGroup={onDeleteGroup}
      onLeave={onLeave}
      onToggleSearch={onToggleMessageSearch}
      isSearchActive={messageSearchSessionActive}
      onToggleMediaOutbox={() => setMediaOutboxOpen((v) => !v)}
      hasMediaOutboxJobs={hasMediaOutboxJobs}
      onOpenDeviceSignatures={
        identity?.id ? () => onOpenMemberSecurity(identity.id, t('conversations.you', 'You')) : undefined
      }
      hasDeviceSignatures={!!identity?.id}
    />
  );
}
