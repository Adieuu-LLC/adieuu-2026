import { memo, useCallback, useMemo, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { ComposerSendFn, ComposerReplyContext } from '../../components/composer/composerTypes';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';
import type { GroupedReaction, ReactionCustomEmoji } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { ReplyQuotePayload } from '../conversations/conversationUtils';
import type { EditHistoryEntry } from '../../components/messaging/EditHistoryLabel';
import type { GifAttachment, MediaAttachment } from '../../services/messagePayload';
import { ChannelMessageList } from '../../components/messaging/ChannelMessageList';
import { MessageComposer } from '../../components/composer/MessageComposer';
import { SpaceChannelCipherGate } from './SpaceChannelCipherGate';

type SpaceComposerIslandProps = {
  channelId: string;
  sending: boolean;
  wrappedSend: ComposerSendFn;
  replyContext: ComposerReplyContext | null;
  editingMessage: ChannelMessage | null;
  setEditingMessage: (msg: ChannelMessage | null) => void;
  editingInitialPlaintext: string;
  editingInitialAttachments: { media: MediaAttachment[]; gifs: GifAttachment[] } | undefined;
};

const SpaceComposerIsland = memo(function SpaceComposerIsland({
  channelId,
  sending,
  wrappedSend,
  replyContext,
  editingMessage,
  setEditingMessage,
  editingInitialPlaintext,
  editingInitialAttachments,
}: SpaceComposerIslandProps) {
  const handleCancelEdit = useCallback(() => setEditingMessage(null), [setEditingMessage]);
  const editContext = useMemo(
    () =>
      editingMessage
        ? { messageId: editingMessage.id, onCancel: handleCancelEdit }
        : null,
    [editingMessage, handleCancelEdit],
  );

  return (
    <MessageComposer
      channelId={channelId}
      sending={sending}
      onSend={wrappedSend}
      replyContext={replyContext}
      editContext={editContext}
      editingMessageKey={editingMessage?.id ?? null}
      editingInitialPlaintext={editingInitialPlaintext}
      editingInitialAttachments={editingInitialAttachments}
    />
  );
});

export interface SpaceChannelMainPanelProps {
  channelId: string | undefined;
  activeChannelId: string | null;
  flatItems: ChannelListItem<ChannelMessage>[];
  messagesLoading: boolean;
  visibleMessageCount: number;
  identity: { id: string; avatarUrl?: string; displayName?: string; username?: string } | null | undefined;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  memberColorDisplay?: MemberColorDisplay;
  favoriteEmojis: string[];

  getGroupedReactions: (messageId: string) => GroupedReaction[];
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onReact: (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  onToggleReaction: (
    messageId: string,
    emoji: string,
    ownReactionId?: string,
    customEmoji?: ReactionCustomEmoji,
  ) => void;
  onReportMessage: (messageId: string) => void;
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onLinkClick: (href: string) => void;

  showScrollButton: boolean;
  onJumpToLatest: () => void | Promise<void>;
  scrollViewportRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  onScrollViewportScroll: () => void;
  onUserScrollIntent: () => void;
  cachedScrollIndex: number | null;

  hasMoreOlder: boolean;
  onReachOlder: () => void;
  hasNewerPages: boolean;
  onReachNewer: () => void;
  showManualLoadOlder: boolean;
  onManualLoadOlder: () => void;

  pinnedMessageIds: string[];
  canManagePins: boolean;
  onPinMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => void;

  onReply: (msg: ChannelMessage) => void;
  onStartEdit: (msg: ChannelMessage) => void;
  replyQuoteBuilder: (msg: ChannelMessage) => ReplyQuotePayload | null;
  scrollToMessageId: (id: string) => void;
  flashingMessageId: string | null;
  loadEditHistory: (messageId: string) => Promise<EditHistoryEntry[] | null>;

  isEncrypted: boolean;
  spaceCipher: unknown | null;
  /** When encrypted without a linked cipher, gate UI needs these. */
  cipherGate?: {
    spaceId: string;
    channelId?: string;
    cipherCheck: import('@adieuu/shared').CipherCheck;
    onCipherLinked: () => void;
  } | null;
  /** Non-member browse: hide composer (join CTA lives on SpaceLayout). */
  isMember?: boolean;
  sending: boolean;
  wrappedSend: ComposerSendFn;
  replyContext: ComposerReplyContext | null;
  editingMessage: ChannelMessage | null;
  setEditingMessage: (msg: ChannelMessage | null) => void;
  editingInitialPlaintext: string;
  editingInitialAttachments: { media: import('../../services/messagePayload').MediaAttachment[]; gifs: import('../../services/messagePayload').GifAttachment[] } | undefined;

  wrapSenderIdentity?: (identityId: string, node: ReactElement) => ReactElement;

  t: TFunction;
}

export function SpaceChannelMainPanel(props: SpaceChannelMainPanelProps): ReactNode {
  const {
    channelId,
    activeChannelId,
    flatItems,
    messagesLoading,
    visibleMessageCount,
    identity,
    participantProfiles,
    memberSettings,
    memberColorDisplay = { name: true, avatarAccent: true, messageBorder: true },
    favoriteEmojis,
    getGroupedReactions,
    onDeleteMessage,
    onReact,
    onToggleReaction,
    onReportMessage,
    onAddFavorite,
    onRemoveFavorite,
    onLinkClick,
    showScrollButton,
    onJumpToLatest,
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    onScrollViewportScroll,
    onUserScrollIntent,
    cachedScrollIndex,
    hasMoreOlder,
    onReachOlder,
    hasNewerPages,
    onReachNewer,
    showManualLoadOlder,
    onManualLoadOlder,
    pinnedMessageIds,
    canManagePins,
    onPinMessage,
    onUnpinMessage,
    onReply,
    onStartEdit,
    replyQuoteBuilder,
    scrollToMessageId,
    flashingMessageId,
    loadEditHistory,
    isEncrypted,
    spaceCipher,
    cipherGate,
    isMember = true,
    sending,
    wrappedSend,
    replyContext,
    editingMessage,
    setEditingMessage,
    editingInitialPlaintext,
    editingInitialAttachments,
    wrapSenderIdentity,
    t,
  } = props;

  return (
    <>
      <div className="space-channel-body">
        <ChannelMessageList
          entityId={channelId}
          activeEntityId={activeChannelId}
          flatItems={flatItems}
          messagesLoading={messagesLoading}
          messageCount={visibleMessageCount}
          identity={identity}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          messageLayout="linear"
          memberColorDisplay={memberColorDisplay}
          favoriteEmojis={favoriteEmojis}
          getGroupedReactions={getGroupedReactions}
          onDeleteMessage={onDeleteMessage}
          onReact={onReact}
          onToggleReaction={onToggleReaction}
          onReportMessage={onReportMessage}
          onAddFavorite={onAddFavorite}
          onRemoveFavorite={onRemoveFavorite}
          onLinkClick={onLinkClick}
          showScrollButton={showScrollButton}
          onJumpToLatest={onJumpToLatest}
          scrollViewportRef={scrollViewportRef}
          messagesContentRef={messagesContentRef}
          messagesContainerRef={messagesContainerRef}
          onScrollViewportScroll={onScrollViewportScroll}
          onUserScrollIntent={onUserScrollIntent}
          cachedScrollIndex={cachedScrollIndex}
          hasMoreOlder={hasMoreOlder}
          onReachOlder={onReachOlder}
          hasNewerPages={hasNewerPages}
          onReachNewer={onReachNewer}
          showManualLoadOlder={showManualLoadOlder}
          onManualLoadOlder={onManualLoadOlder}
          emptyMessage={t('spaces.channel.noMessages')}
          pinnedMessageIds={pinnedMessageIds}
          canManagePins={canManagePins}
          onPinMessage={onPinMessage}
          onUnpinMessage={onUnpinMessage}
          onReply={onReply}
          onStartEdit={onStartEdit}
          replyQuoteBuilder={replyQuoteBuilder}
          scrollToMessageId={scrollToMessageId}
          flashingMessageId={flashingMessageId}
          loadEditHistory={loadEditHistory}
          wrapSenderIdentity={wrapSenderIdentity}
        />
      </div>

      {isMember && (
        <div className="space-channel-composer">
          {isEncrypted && !spaceCipher && cipherGate ? (
            <SpaceChannelCipherGate
              spaceId={cipherGate.spaceId}
              channelId={cipherGate.channelId}
              cipherCheck={cipherGate.cipherCheck}
              onCipherLinked={cipherGate.onCipherLinked}
            />
          ) : isEncrypted && !spaceCipher ? (
            <div className="space-channel-no-cipher">
              <p className="spaces-state-body">{t('spaces.channel.noCipher')}</p>
            </div>
          ) : (
            <SpaceComposerIsland
              channelId={activeChannelId ?? channelId!}
              sending={sending}
              wrappedSend={wrappedSend}
              replyContext={replyContext}
              editingMessage={editingMessage}
              setEditingMessage={setEditingMessage}
              editingInitialPlaintext={editingInitialPlaintext}
              editingInitialAttachments={editingInitialAttachments}
            />
          )}
        </div>
      )}
    </>
  );
}
