/**
 * Chat UI: DMs, groups, composer, moderation hooks for media.
 */
export const conversations = {
    contextMenu: {
        copy: 'Copy',
        copyAll: 'Copy all',
        selectAll: 'Select all',
        paste: 'Paste',
        copyGifLink: 'Copy GIF link',
        copyStickerLink: 'Copy sticker link',
        copySelection: 'Copy selection',
        copyMessage: 'Copy message',
        copyLink: 'Copy link',
        copyImage: 'Copy image',
        download: 'Download',
        copied: 'Copied',
        copyFailed: 'Could not copy to clipboard',
        pasteFailed: 'Could not paste from clipboard',
        downloadFailed: 'Could not download file',
        fileSaved: 'File saved',
        mediaNotReady: 'This attachment is not ready to download yet.',
        pasteNoEditable:
            "Paste is available when a text field is focused, or when pasting on this page in your browser's default way (for example, Ctrl/cmd+V or long-press).",
        archive: 'Archive',
        unarchive: 'Unarchive',
        keepArchived: 'Keep archived on new messages',
        addFavorite: 'Add to Favourites',
        removeFavorite: 'Remove from Favourites',
        editConversation: 'Edit Conversation',
    },

    mediaLoading: 'Loading...',
    mediaUploading: 'Uploading...',
    mediaScanning: 'Awaiting moderation...',
    /** Composer attachment chip while the file is uploading to storage. */
    composerAttachmentUploading: 'Uploading',
    /** Composer attachment chip while moderation scan runs (after upload completes). */
    composerAttachmentModerating: 'Moderating',
    mediaRejected: 'This content has been removed (auto-moderation)',
    mediaModerationError: 'This content could not be verified and has been hidden for safety',
    mediaError: 'Failed to load media',
    expandMedia: 'Click to expand',
    /** Composer attach control (images + video). */
    attachMedia: 'Attach image or video',
    /** Paste looked like media but we could not read bytes (e.g. some app clipboard formats). */
    pasteMediaUnreadableTitle: 'Could not use clipboard content',
    pasteMediaUnreadableDesc:
        'We noticed a paste that may include an image or video, but could not read usable media. Try saving the file and attaching it, or copying from another app.',
    /** Conversation drag-and-drop overlay. */
    dropFilesToAttach: 'Drop to attach',
    dropFilesToAttachHint: 'Drag and drop media or files to attach',
    mediaLightbox: 'Image preview',
    group: 'Group',
    members: 'Members',
    directMessage: 'Direct message',
    /** Sidebar hover: e.g. "120 messages" (count from GET /conversations/:id). */
    sidebarHoverMessageCount: '{{count}} messages',
    /** Sidebar hover: second line; `left` is "N members" or "N participants", `right` is message count or an ellipsis while loading. */
    sidebarHoverMetaBulletMessages: '{{left}} • {{right}}',
    /** Sidebar hover: `right` when message count still loading. */
    sidebarHoverMessagesLoading: '…',
    /** Sidebar hover: start date under meta line. */
    sidebarHoverSince: 'Since {{date}}',
    headerLatestPinLoading: 'Loading…',
    headerLatestPinUnavailable: 'Pinned message unavailable',
    headerLatestPinSystem: 'System message',
    headerLatestPinTooltip: 'Open the newest pinned message (by send time)',
    settings: 'Settings',
    settingsTabPersonal: 'For you',
    settingsTabConversation: 'Conversation',
    leave: 'Leave',
    you: 'You',
    admin: 'Admin',
    makeAdmin: 'Make Admin',
    removeMember: 'Remove',
    invitedSection: 'Invited',
    revokeInvite: 'Revoke invite',
    revokeInviteFailed: 'Could not revoke the invite.',
    notFound: 'Conversation not found',
    loadMessageContextFailed: 'Could not load messages',
    backHome: 'Back to home',
    deleteGroup: 'Delete Group',
    deleteConversation: 'Delete conversation',
    reactionSaveError: 'Could not save your reaction.',
    reactionRemoveError: 'Could not remove your reaction.',
    pinnedMessages: 'Pinned messages',
    pinnedMessage: 'Pinned',
    pinMessage: 'Pin message',
    unpinMessage: 'Unpin message',
    removePinTooltip: 'Remove Pin',
    pinFailed: 'Could not pin message',
    unpinFailed: 'Could not unpin message',
    pins: 'Pins',
    closePinsPanel: 'Close pinned messages',
    moreOptions: 'More options',
    pinsEmpty: 'No pinned messages yet.',
    pinsCouldNotLoad: 'Could not load pins.',
    loadPinnedFailed: 'Could not load pinned messages',

    leaveGroup: {
      title: 'Leave group?',
      confirm: "You won't be able to rejoin without a new invite.",
      lastMember: 'You are the last member. The group and all messages will be permanently deleted.',
      confirmBtn: 'Leave',
    },

    deleteGroupDialog: {
      title: 'Delete group?',
      confirm: 'This will permanently delete the group and all messages for everyone. Not reversible.',
      confirmBtn: 'Delete',
    },

    deleteConversationDialog: {
      title: 'Delete conversation?',
      confirm: 'This will permanently delete the conversation and all messages for everyone.',
      confirmBtn: 'Delete',
    },

    editMember: 'Edit member',
    nickname: 'Nickname',
    nicknamePlaceholder: 'Custom name...',
    memberColor: 'Colour',
    clearNickname: 'Clear nickname',
    clearColor: 'Clear colour',
    saveMemberSettings: 'Save',
    cancelMemberSettings: 'Cancel',
    colorDisplayMode: 'Member colour display',
    colorDisplayNameOnly: 'Name only',
    colorDisplayNameAccent: 'Name + avatar accent',
    colorDisplayNameBubble: 'Name + message tint',
    memberSettingsUpdated: 'Member settings updated',

    memberSecurity: {
      link: 'Device Signatures',
      title: 'Device Signatures — {{name}}',
      titleSelf: 'Your device signatures',
      toolbarTooltip: 'Open your device signatures',
      toolbarAria: 'Device signatures',
      summary:
        'Below are {{name}}\'s device trust fingerprints. Each line is stable for that device until they change keys, and is the same in every conversation. You can mark a device verified to compare against future messages.',
      summarySelf:
        'Below are your device trust fingerprints. Others can compare these lines to what they see for you in any chat. Each line stays the same until you replace keys on that device.',
      accordionTitle: 'Would you like to know more?',
      introP1:
        'All DM and group conversations in Adieuu are end-to-end encrypted, meaning the messages are encrypted on user devices before they reach Adieuu servers. Each different device (phone, desktop, etc) a user logs in with has its own keys that it encrypts and signs messages with.',
      introP1Self:
        'All DM and group conversations in Adieuu are end-to-end encrypted, meaning the messages are encrypted on user devices before they reach Adieuu servers. Each different device (phone, desktop, etc) you use has its own keys to encrypt and sign messages.',
      introP2:
        'Much like a wax seal on an envelope, different signatures might indicate that someone tampered with {{name}}\'s messages, or tried to impersonate them.',
      introP2Self:
        'Much like a wax seal on an envelope, a signature that does not match what others expect might mean someone tampered with your messages, or tried to impersonate you.',
      introP3:
        'What to do: ask {{name}} to open Device Signatures in their app. Read the full fingerprint lines to each other (voice/video or in-person if you want to be careful). The same device shows the same line in every conversation.',
      introP3Self:
        'What to do: when the other person is ready, read your fingerprint lines aloud so they can confirm they match what they see for your devices in their app. Your lines are the same in every chat until you change keys on a device.',
      introP4:
        'If the signatures do not match, it\'s possible that device (or its messages) are compromised.',
      introP4Self:
        'If the signatures do not match, it\'s possible that your device is compromised, or your messages are otherwise being tampered with before reaching the others.',
      devicesHeading: 'Signatures by device',
      deviceListBlurb:
        'Each block below is one device. Agree which block you are comparing (the device id can help), then check that the full line matches exactly what {{name}} sees for that device—the line is identical in any conversation.',
      deviceListBlurbSelf:
        'Each block below is one of your devices. Agree which block you are comparing (the device id can help), then read your full line aloud so the other person can confirm it matches what they see for you anywhere in the app.',
      deviceOrdinal: 'Device {{n}}',
      deviceIdCaption: 'Device ID v{{version}}',
      loadError: 'Could not load security information.',
      noDevices: 'No devices are registered for this person yet, so there is nothing to compare (this is unlikely if the issue persists, contact Support).',
      noDevicesSelf:
        'No devices are registered for your account yet, so there is nothing to compare (this is unlikely if the issue persists, contact Support).',
      codeCaption: 'Signature (compare the full line)',
      spkUnavailable:
        'We cannot show a signature for this device from here. Ask them to read their code from their own app, or try again later.',
      verifyFailed:
        'We could not confirm this device\'s code from here. Be cautious until you can verify another way.',
      attestationPending:
        'No trust fingerprint yet for this device—{{name}} needs to update to the latest app and sign in so their device can publish a signature.',
      attestationPendingSelf:
        'No trust fingerprint for this device yet. Update to the latest app and stay signed in; your device will publish a signature automatically.',
      copied: 'Signature copied',
      copyFailed: 'Could not copy to clipboard',
      markVerified: 'Verified',
      verifyPersistFailed: 'Could not update verification',
      fingerprintMatchIndicator:
        'This device matches your verified fingerprint.',
      fingerprintMismatchIndicator:
        'Verified fingerprint no longer matches this device. Keys may have changed.',
    },

    settingsFs: 'Forward Secrecy',
    settingsFsHint: 'Default messages in this conversation to use forward secrecy. Messages without FS remain end-to-end encrypted but persist in history.',
    settingsRenameTitle: 'Conversation topic or name',
    settingsRenamePlaceholder: 'Enter new conversation topic or name...',
    conversationTopicOrNamePlaceholder: 'Conversation topic or name (optional)',
    startSeparateDmLabel: 'Start a new conversation? (must add topic name)',
    firstDmWithFriendNote:
      'You have not messaged this person in a direct conversation before.',
    settingsRenameSave: 'Save',

    adminTransfer: {
      title: 'Choose a new admin',
      description: 'You are the last admin. Choose who should take over before you leave.',
      oldest: 'Oldest member',
      oldestHint: 'The member who joined earliest',
      mostActive: 'Most active member',
      mostActiveHint: 'The member who sent the most messages',
      manual: 'Choose a member',
      manualHint: 'Select a specific member to promote',
      skip: 'Skip',
      leave: 'Leave',
    },

    systemMessage: {
      memberJoined: '{{name}} has joined the conversation',
      memberInvited: '{{actor}} invited {{name}} to the group',
      memberInvitedLine: '{{invitee}} was invited by {{actor}}',
      memberInvitedInviteeOnly: '{{invitee}} was invited',
      memberLeft: '{{name}} has left the conversation',
      adminPromoted: '{{actor}} made {{name}} an admin',
      adminPromotedSimple: '{{name}} is now an admin',
      groupRenamed: '{{actor}} updated the conversation topic',
      groupRenamedSimple: '{{name}} updated the conversation topic',
      callStarted: '{{name}} started a call',
      callJoined: '{{name}} joined the call',
      callLeft: '{{name}} left the call',
      callLeftEnded: '{{name}} left the call, and the call was ended',
      callEnded: '{{name}} ended the call',
    },

    invites: {
      panelTitle: 'Chat Invitations',
      group: 'Group',
      groupNameHidden: 'Conversation topic hidden',
      inviterAndOthers: '{{name}} + {{count}} others',
      inviterAndOthers_one: '{{name}} + 1 other',
      inviterAndOthers_other: '{{name}} + {{count}} others',
      inviterGroup: "{{name}}'s Group",
      invitedBy: 'From {{name}}',
      invitedByLabel: 'Invited by',
      memberCount: '{{count}} members',
      memberCount_one: '1 member',
      memberCount_other: '{{count}} members',
      accept: 'Accept',
      decline: 'Decline',
      noInvites: 'No pending invitations',
      previewMemberCount: '{{count}} members',
      previewMemberCount_one: '1 member',
      previewMemberCount_other: '{{count}} members',
      previewMembers: 'Members',
      previewUnavailable: 'Preview unavailable',
      alsoInvited: 'Also Invited',
      othersInvited: '+{{count}} others invited',
      othersInvited_one: '+1 other invited',
      othersInvited_other: '+{{count}} others invited',
    },

    addMember: 'Add Member',

    inviteMember: {
      title: 'Invite Member',
      button: 'Invite Member',
      invite: 'Invite',
      privacyNote:
        'Invitees will be able to see current and invited member lists, but the conversation topic or name will be hidden until they join.',
      previouslyLeft: 'Previously left',
      noEligible: 'No friends available to invite',
      createNew: 'Create New Conversation Instead',
      statusMember: 'Member',
      statusInvited: 'Invited',
    },

    newUnreads: 'New messages',
    jumpToLatest: 'Jump to latest message',
    jumpToLatestLabel: 'Latest',
    jumpToLatestWithUnread: 'Jump to latest message, {{count}} unread',

    reply: 'Reply',
    cancelReply: 'Cancel reply',
    replyOriginal: 'Original message',
    replyDeleted: 'Message deleted',
    replySystem: 'System message',

    /** Default composer field when a playful placeholder verb is not active. */
    messagePlaceholder: 'Type a message…',
    /** Banner while changing an already-sent message. */
    editingMessage: 'Editing',
    /** Dismiss inline edit in the composer. */
    cancelEdit: 'Cancel edit',
    /** Text-only v1: media blocks entering edit mode (toast + in-composer). */
    editNoAttachments: 'Only text can be edited. Remove attachments first.',
    /** Context menu and message action bar. */
    editMessage: 'Edit',
    /** Inline label next to the sent time after an E2E replace. */
    messageEdited: 'Edited',
    /** Max E2E revisions: toast, disabled pen control, and context `title` when the row is non-actionable. */
    messageEditMax: 'Edit limit reached. Send a new message.',
    /** Rare: “Edited” control has no `lastEditedAt` (native `title` hint). */
    viewEditHistory: 'History',
    /** Popover heading for prior ciphertext snapshots. */
    editHistoryTitle: 'Earlier versions',
    editHistoryLoading: 'Loading…',
    loadEditHistoryFailed: "Couldn't load earlier versions",
    editHistoryEmpty: 'No earlier versions',
    /** Row label: `n` is 1-based, oldest prior version first. */
    editHistoryVersion: 'v{{n}}',
    editHistoryUnableDecrypt: "Can't decrypt this version",
    editHistoryNoPlaintext: 'No text',
    editHistoryNoText: '—',

    notifications: {
      newMessage: 'New message',
      newMessageBody: 'Message from {{name}}',
      newMessageGeneric: 'You received a new message',
      messageReply: 'Reply to your message',
      messageReplyBody: '{{name}} replied to your message',
      messageReplyGeneric: 'Someone replied to your message',
      mentioned: 'You were mentioned',
      mentionedBody: '{{name}} mentioned you',
      mentionedGeneric: 'Someone mentioned you',
      groupInvite: 'Group invitation',
      groupInviteNameHidden:
        "You've been invited to a group (name hidden until you join)",
      groupInviteFromBody: '{{name}} + {{count}} others invited you',
      groupInviteFromBody_one: '{{name}} + 1 other invited you',
      groupInviteFromBody_other: '{{name}} + {{count}} others invited you',
      groupInviteFromSolo: '{{name}} is inviting you',
      groupTerminated: 'Conversation deleted',
      groupTerminatedBody: '{{name}} deleted the conversation',
      memberJoined: 'Member joined',
      memberJoinedBody: '{{name}} joined the group',
      memberAdded: 'Member added',
      memberAddedBody: '{{name}} was added to the group',
      memberLeft: 'Member left',
      memberLeftBody: '{{name}} left the group',
      memberRemoved: 'Member removed',
      memberRemovedBody: '{{name}} was removed from the group',
      groupRenamed: 'Conversation updated',
      groupRenamedBody: 'The conversation topic or name was updated',
      groupRenamedByBody: '{{name}} updated the conversation topic',
      conversationTopicUpdated: 'Conversation updated',
      conversationTopicUpdatedBody: 'The conversation topic or name was updated',
      conversationTopicUpdatedByBody: '{{name}} updated the conversation topic',
      adminPromoted: 'New admin',
      adminPromotedBody: '{{name}} was promoted to admin',
      reaction: 'Reaction',
      reactionBody: '{{name}} reacted to your message',
      reactionGeneric: 'Someone reacted to your message',
    },

    placeholderVerbs: {
      message: '💬 Message',
      hi: '💬 Say Hi to',
      // ping: '🔔 Ping',
      // poke: '👉 Poke',
      // nudge: '👆 Nudge',
      // sendLove: '💖 Send love to',
      // whisper: '👂 Whisper to',
      // shout: '🔊 Shout at',
      // wave: '👋 Wave at',
      // holla: '👋 Holla at',
      // buzz: '🐝 Buzz',
      // serenade: '🎼 Serenade',
      // sing: '🎵 Sing a song to',
      // pigeon: '🐦 Send a pigeon to',
      // dropLine: '💬 Drop a line to',
      // converse: '💬 Converse with',
      // sonnet: '📝 Write a sonnet for',
      // telepathy: '🧠 Telepathically reach',
      // vibes: '✨ Send vibes to',
      // beam: '📡 Beam a signal to',
      // raven: '🐦‍⬛ Dispatch a raven to',
      // smoke: '🔥 Send smoke signals to',
      // touchGrass: '🌿 Touch grass with',
      // party: '🎉 Party with',
      // gauntlet: '🏆 Run the gauntlet with',
      // duel: '🤺 Duel with',
      // memories: '💭 Make memories with',
      // brainstorm: '💡 Brainstorm with',
      // dance: '💃 Dance with',
      // cake: '🎂 Bake a cake with',
    },

    externalLink: {
      title: 'External Link',
      description:
        'You are about to open a link that will take you outside of Adieuu. Please verify you trust this destination before continuing.',
      destination: 'Destination',
      trackingDetected: 'Tracking parameters detected',
      trackingHint:
        'This URL contains parameters commonly used for cross-site tracking ({{params}}). You can open the link without them to reduce fingerprinting.',
      trustDomain: "Don't warn me again for {{domain}}",
      trustAll: "Don't warn me for any external links",
      openClean: 'Open without tracking',
      openConfirm: 'Open Anyway',
    },

    ttlOff: 'Disappear this message',
    ttlActive: 'Message will disappear after {{ttl}}',

    filter: {
      button: 'Filter',
      typeAll: 'All',
      typeDms: 'DMs',
      typeGroups: 'Groups',
      sortRecent: 'Recent',
      sortAlpha: 'A\u2013Z',
      showArchived: 'Show archived',
    },

    favorites: {
      section: 'Favourites',
    },

    archiveToast: 'Conversation archived',
    unarchiveToast: 'Conversation unarchived',
    favoriteAddedToast: 'Added to favourites',
    favoriteRemovedToast: 'Removed from favourites',

    /** Outbox send blocked (e.g. other user blocked you). */
    sendBlocked: 'Message could not be sent',

    mediaOutbox: {
        panelTitle: 'Pending media sends',
        closePanel: 'Close',
        empty: 'No pending uploads for this chat.',
        toolbarAria: 'Pending media uploads',
        toolbarTitle: 'Pending uploads',
        cancel: 'Cancel send',
        retry: 'Retry',
        dismiss: 'Dismiss',
        /** Shown inline in the thread while an outbox job is active. */
        inlinePendingOne: 'Sending media…',
        inlinePendingMany: 'Sending {{count}} media…',
        stageQueued: 'Queued',
        stagePreparing: 'Preparing media…',
        stageEncrypting: 'Encrypting…',
        stageUploading: 'Uploading…',
        stageSending: 'Sending message…',
        stageScan: 'Safety scan uploading…',
        stageFailed: 'Failed',
        stageCancelled: 'Cancelled',
    },

    /** MP4-only: skip ffmpeg when the browser cannot decode (e.g. HEVC). */
    sendMp4NoReencode: 'No re-encoding (MP4 only)',
    sendMp4NoReencodeHelp:
      'Send the original MP4 bytes without converting to H.264. Playback may fail on some devices; use only when you understand the trade-off.',

    messageSearch: {
        title: 'Search messages',
        placeholder: 'Search…',
        close: 'Close',
        newSearch: 'New search',
        startSearch: 'Start search',
        modifySearch: 'Modify search',
        endSearch: 'End search',
        recentSearches: 'Recent searches',
        recentSearchesShort: 'Recent Searches',
        recentNoKeywords: 'Any text',
        adminNoPersistent:
            'This conversation requires that local search data is not kept after you close search.',
        filterHasReplies: 'Has replies',
        filterRepliesOnly: 'Replies only',
        filterHasAttachments: 'Has attachments',
        filterAuthor: 'Author',
        filterAuthorAll: 'Anyone',
        timeRangeLabel: 'Time range',
        timeRange7d: 'Last 7 days',
        timeRange14d: 'Last 2 weeks',
        timeRange30d: 'Last month',
        timeRange90d: 'Last 3 months',
        timeRange180d: 'Last 6 months',
        timeRange365d: 'Last year',
        timeRangeAll: 'All time',
        loading: 'Loading…',
        searching: 'Searching…',
        searchComplete: 'Search complete',
        searchPaused: 'Paused',
        searchStatusLineOne:
            '{{time}} · 1 result found across {{indexedCount, number}} messages indexed',
        searchStatusLineMany:
            '{{time}} · {{resultCount, number}} results found across {{indexedCount, number}} messages indexed',
        pauseSearch: 'Pause search',
        searchPausedHint: 'Resume to keep loading older messages and update results.',
        resumeSearch: 'Resume search',
        sortLabel: 'Sort',
        sortNewestFirst: 'Newest first',
        sortOldestFirst: 'Oldest first',
        resultsListAria: 'Search results',
        noResults: 'No messages match.',
        toolbarAria: 'Search messages',
        settingsDisallowTitle: 'Disallow persistent local search cache',
        settingsDisallowHint:
            'Members cannot keep decrypted message text on their device for search after they close search. Search still works during an active search session.',
    },

    // Moderation skip
    enableModeration: 'Enable content moderation',
    enableModerationTooltip:
        'Uncheck to opt-out of anonymized moderation scanning for these files (e.g. for files with sensitive personal data).\n\nAbnormal volumes of unmoderated content may result in throttling/caps for your Alias and other conversation members: we want to give you privacy (which is why we offer an opt-out), but we don\'t want to support illegal content.',
    allowSkipModeration: 'Allow members to skip moderation',
    allowSkipModerationHint:
        'Members can choose to skip content moderation scanning when sending media. Recipients may hide unmoderated content.',
    unmoderatedMediaHidden: 'Content skipped moderation',
    showUnmoderatedMedia: 'Show anyway',
    unmoderatedMediaTitle: 'Unmoderated Media',
    unmoderatedMediaDescription:
        'Control whether media that skipped moderation scanning is automatically displayed or hidden behind a placeholder.',
    unmoderatedMediaAllow: 'Display all media (including unmoderated)',
    unmoderatedMediaHide: 'Hide unmoderated media behind a placeholder',
} as const;
