import type { ChannelMessageBubbleProps } from './ChannelMessageBubble';

export function areChannelMessageBubblePropsEqual(
  prev: Readonly<ChannelMessageBubbleProps>,
  next: Readonly<ChannelMessageBubbleProps>,
): boolean {
  if (prev.isOwn !== next.isOwn) return false;
  if (prev.layout !== next.layout) return false;
  if (prev.isFlashHighlight !== next.isFlashHighlight) return false;
  if (prev.memberColorDisplay !== next.memberColorDisplay) return false;
  if (prev.gifsEnabled !== next.gifsEnabled) return false;
  if (prev.gifAnimateOnHoverOnly !== next.gifAnimateOnHoverOnly) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.canManagePin !== next.canManagePin) return false;
  if (prev.onOpenMemberSecurity !== next.onOpenMemberSecurity) return false;
  if (prev.onDeviceTrustMismatch !== next.onDeviceTrustMismatch) return false;
  if (prev.verificationRevision !== next.verificationRevision) return false;
  if (prev.peerPublicKeysById !== next.peerPublicKeysById) return false;

  const pm = prev.message;
  const nm = next.message;
  if (pm.id !== nm.id) return false;
  if (pm.body !== nm.body) return false;
  if ((pm.revisionCount ?? 0) !== (nm.revisionCount ?? 0)) return false;
  if (pm.lastEditedAt !== nm.lastEditedAt) return false;
  if (pm.deleted !== nm.deleted) return false;
  if (pm.hasReactions !== nm.hasReactions) return false;
  if (pm.forwardSecrecy !== nm.forwardSecrecy) return false;
  if (pm.fsDowngraded !== nm.fsDowngraded) return false;
  if (pm.signatureVerified !== nm.signatureVerified) return false;
  if (pm.expiresAt !== nm.expiresAt) return false;
  if (pm.decryptionError !== nm.decryptionError) return false;
  if (pm.replyToMessageId !== nm.replyToMessageId) return false;
  if (pm.channelId !== nm.channelId) return false;
  if (pm.messageType !== nm.messageType) return false;
  if (pm.senderDeviceId !== nm.senderDeviceId) return false;
  if (pm.systemEvent !== nm.systemEvent) return false;
  if (pm.attachments !== nm.attachments) return false;
  if (pm.mentions !== nm.mentions) return false;
  if (pm.gifAttachments !== nm.gifAttachments) return false;
  if (pm.customEmojis !== nm.customEmojis) return false;

  if (prev.onStartEdit !== next.onStartEdit) return false;

  if (prev.senderProfile?.id !== next.senderProfile?.id) return false;
  if (prev.senderProfile?.avatarUrl !== next.senderProfile?.avatarUrl) return false;
  if (prev.senderProfile?.displayName !== next.senderProfile?.displayName) return false;
  if (prev.ownProfile?.id !== next.ownProfile?.id) return false;
  if (prev.ownProfile?.avatarUrl !== next.ownProfile?.avatarUrl) return false;

  if (prev.participantProfiles !== next.participantProfiles) return false;
  if (prev.memberSettings !== next.memberSettings) return false;

  if (prev.fsInfo !== next.fsInfo && (
    prev.fsInfo?.rotationLabel !== next.fsInfo?.rotationLabel ||
    prev.fsInfo?.readableWindow !== next.fsInfo?.readableWindow ||
    prev.fsInfo?.tooltip !== next.fsInfo?.tooltip
  )) return false;

  const pr = prev.groupedReactions;
  const nr = next.groupedReactions;
  if (pr.length !== nr.length) return false;
  for (let i = 0; i < pr.length; i++) {
    if (pr[i]!.emoji !== nr[i]!.emoji || pr[i]!.count !== nr[i]!.count ||
        pr[i]!.isOwn !== nr[i]!.isOwn || pr[i]!.ownReactionId !== nr[i]!.ownReactionId) return false;
  }

  if (prev.favoriteEmojis.length !== next.favoriteEmojis.length) return false;
  for (let i = 0; i < prev.favoriteEmojis.length; i++) {
    if (prev.favoriteEmojis[i] !== next.favoriteEmojis[i]) return false;
  }

  const pq = prev.replyQuote;
  const nq = next.replyQuote;
  if (!pq !== !nq) return false;
  if (pq && nq) {
    if (pq.text !== nq.text) return false;
    if (pq.quotedAuthor?.displayName !== nq.quotedAuthor?.displayName) return false;
    if (pq.quotedAuthor?.avatarUrl !== nq.quotedAuthor?.avatarUrl) return false;
    if (pq.onQuoteClick !== nq.onQuoteClick) return false;
  }

  return true;
}
