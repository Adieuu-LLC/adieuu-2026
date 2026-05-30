/**
 * WebSocket Chat Client for Adieuu
 *
 * Handles real-time communication with the chat service.
 * Authenticates using identity session cookies.
 */

// ============================================================================
// Types
// ============================================================================

export type ChatMessageType =
  | 'ping'
  | 'pong'
  | 'presence'
  | 'ack'
  | 'error'
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'friend_removed'
  | 'conversation_created'
  | 'conversation_updated'
  | 'conversation_message'
  | 'conversation_message_edited'
  | 'group_invite_received'
  | 'group_invite_accepted'
  | 'group_invite_revoked'
  | 'conversation_message_deleted'
  | 'group_terminated'
  | 'reaction_added'
  | 'reaction_removed'
  | 'notification_created'
  | 'identity_profile_updated'
  | 'call_initiated'
  | 'call_participant_joined'
  | 'call_participant_left'
  | 'call_ended'
  | 'call_media_state_changed';

export interface ChatMessageBase {
  type: ChatMessageType;
  id?: string;
}

export interface ChatPingMessage extends ChatMessageBase {
  type: 'ping';
}

export interface ChatPongMessage extends ChatMessageBase {
  type: 'pong';
}

export interface ChatErrorMessage extends ChatMessageBase {
  type: 'error';
  code: string;
  message: string;
}

export interface ChatAckMessage extends ChatMessageBase {
  type: 'ack';
  id: string;
}

export interface ChatFriendRequestReceivedMessage extends ChatMessageBase {
  type: 'friend_request_received';
  data: {
    requestId: string;
    fromIdentity: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
    };
  };
}

export interface ChatFriendRequestAcceptedMessage extends ChatMessageBase {
  type: 'friend_request_accepted';
  data: {
    requestId: string;
    byIdentity: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
    };
  };
}

export interface ChatFriendRemovedMessage extends ChatMessageBase {
  type: 'friend_removed';
  data: {
    identityId: string;
  };
}

export interface ChatConversationCreatedMessage extends ChatMessageBase {
  type: 'conversation_created';
  data: {
    conversation: {
      id: string;
      type: 'dm' | 'group';
      participants: string[];
      createdBy: string;
      admins: string[];
      encryptedName?: string;
      nameNonce?: string;
      createdAt: string;
      updatedAt: string;
    };
  };
}

export interface ChatConversationUpdatedMessage extends ChatMessageBase {
  type: 'conversation_updated';
  data: {
    conversationId: string;
    action:
      | 'member_added'
      | 'member_removed'
      | 'member_left'
      | 'removed'
      | 'renamed'
      | 'admin_promoted'
      | 'gifs_disabled_updated'
      | 'gif_content_filter_updated'
      | 'custom_emojis_disabled_updated'
      | 'message_search_cache_policy_updated'
      | 'allow_skip_moderation_updated'
      | 'pending_invites_changed'
      | 'pins_updated'
      | 'call_settings_updated';
    identityId?: string;
    gifsDisabled?: boolean;
    gifContentFilter?: string;
    customEmojisDisabled?: boolean;
    disallowPersistentMessageSearchCache?: boolean;
    allowSkipModeration?: boolean;
    pinnedMessageIds?: string[];
    /** Present for action renamed — drives notification copy (group vs DM). */
    conversationType?: 'dm' | 'group';
    audioCallsDisabled?: boolean;
    videoCallsDisabled?: boolean;
    screenshareDisabled?: boolean;
  };
}

export interface ChatGroupTerminatedMessage extends ChatMessageBase {
  type: 'group_terminated';
  data: {
    conversationId: string;
    terminatedBy: {
      id: string;
      username?: string;
      displayName?: string;
    };
    encryptedName?: string;
    nameNonce?: string;
  };
}

export interface ChatConversationMessageMessage extends ChatMessageBase {
  type: 'conversation_message';
  data: {
    conversationId: string;
    messageId: string;
    fromIdentityId: string;
    createdAt: string;
    /** Present when the new message is a reply; identifies the original message */
    replyToMessageId?: string;
    /** Author of the message being replied to (for reply-specific client UX) */
    replyToMessageAuthorId?: string;
    /** ISO-8601 expiry timestamp when the message is a disappearing/TTL message. */
    expiresAt?: string;
    /** Identity IDs of participants @mentioned in this message (for mention-specific notification sounds). */
    mentionedIdentityIds?: string[];
  };
}

export interface ChatConversationMessageEditedMessage extends ChatMessageBase {
  type: 'conversation_message_edited';
  data: {
    conversationId: string;
    messageId: string;
    fromIdentityId: string;
    lastEditedAt: string;
    revisionCount: number;
    expiresAt?: string;
  };
}

export interface ChatGroupInviteReceivedMessage extends ChatMessageBase {
  type: 'group_invite_received';
  data: {
    invite: {
      id: string;
      conversationId: string;
      invitedIdentityId: string;
      invitedByIdentityId: string;
      status: string;
      groupName?: string;
      hasGroupName?: boolean;
      memberCount: number;
      createdAt: string;
    };
  };
}

export interface ChatGroupInviteAcceptedMessage extends ChatMessageBase {
  type: 'group_invite_accepted';
  data: {
    conversationId: string;
    identityId: string;
    username?: string;
    displayName?: string;
  };
}

export interface ChatGroupInviteRevokedMessage extends ChatMessageBase {
  type: 'group_invite_revoked';
  data: {
    inviteId: string;
    conversationId: string;
  };
}

export interface ChatConversationMessageDeletedMessage extends ChatMessageBase {
  type: 'conversation_message_deleted';
  data: {
    conversationId: string;
    messageId: string;
    deletedBy: string;
    forEveryone: boolean;
  };
}

export interface ChatReactionAddedMessage extends ChatMessageBase {
  type: 'reaction_added';
  data: {
    reaction: {
      id: string;
      messageId: string;
      conversationId: string;
      fromIdentityId: string;
      ciphertext: string;
      nonce: string;
      wrappedKeys: {
        identityId: string;
        ephemeralPublicKey: string;
        kemCiphertext: string;
        wrappedSessionKey: string;
        wrappingNonce: string;
        preKeyType: 'static' | 'spk' | 'otpk';
        signedPreKeyId?: string;
        oneTimePreKeyId?: string;
        spkKemCiphertext?: string;
        otpkKemCiphertext?: string;
        routingTag?: string;
      }[];
      signature: string;
      cryptoProfile: 'default' | 'cnsa2';
      clientReactionId: string;
      createdAt: string;
    };
    /** Identity id of the message author (server-known; for author notifications). */
    messageAuthorId?: string;
  };
}

export interface ChatReactionRemovedMessage extends ChatMessageBase {
  type: 'reaction_removed';
  data: {
    reactionId: string;
    messageId: string;
    conversationId: string;
  };
}

export interface ChatNotificationCreatedMessage extends ChatMessageBase {
  type: 'notification_created';
  data: {
    notification: {
      id: string;
      type: string;
      data: Record<string, unknown>;
      read: boolean;
      createdAt: string;
    };
  };
}

export interface ChatIdentityProfileUpdatedMessage extends ChatMessageBase {
  type: 'identity_profile_updated';
  data: {
    identityId: string;
  };
}

export interface ChatCallMediaOptions {
  audio: boolean;
  video: boolean;
  screenshare: boolean;
}

export interface ChatCallInitiatedMessage extends ChatMessageBase {
  type: 'call_initiated';
  data: {
    call: {
      id: string;
      conversationId: string;
      initiatorIdentityId: string;
      status: string;
      allowedMedia: ChatCallMediaOptions;
      participants?: {
        identityId: string;
        joinedAt: string;
        leftAt?: string;
        mediaState: ChatCallMediaOptions;
      }[];
      roomName: string;
      createdAt: string;
    };
  };
}

export interface ChatCallParticipantJoinedMessage extends ChatMessageBase {
  type: 'call_participant_joined';
  data: {
    callId: string;
    identityId: string;
    mediaState: ChatCallMediaOptions;
  };
}

export interface ChatCallParticipantLeftMessage extends ChatMessageBase {
  type: 'call_participant_left';
  data: {
    callId: string;
    identityId: string;
  };
}

export interface ChatCallEndedMessage extends ChatMessageBase {
  type: 'call_ended';
  data: {
    callId: string;
    endedBy: string;
  };
}

export interface ChatCallMediaStateChangedMessage extends ChatMessageBase {
  type: 'call_media_state_changed';
  data: {
    callId: string;
    identityId: string;
    mediaState: ChatCallMediaOptions;
  };
}

export type ChatIncomingMessage =
  | ChatPongMessage
  | ChatErrorMessage
  | ChatAckMessage
  | ChatFriendRequestReceivedMessage
  | ChatFriendRequestAcceptedMessage
  | ChatFriendRemovedMessage
  | ChatConversationCreatedMessage
  | ChatConversationUpdatedMessage
  | ChatConversationMessageMessage
  | ChatConversationMessageEditedMessage
  | ChatGroupInviteReceivedMessage
  | ChatGroupInviteAcceptedMessage
  | ChatGroupInviteRevokedMessage
  | ChatConversationMessageDeletedMessage
  | ChatGroupTerminatedMessage
  | ChatReactionAddedMessage
  | ChatReactionRemovedMessage
  | ChatNotificationCreatedMessage
  | ChatIdentityProfileUpdatedMessage
  | ChatCallInitiatedMessage
  | ChatCallParticipantJoinedMessage
  | ChatCallParticipantLeftMessage
  | ChatCallEndedMessage
  | ChatCallMediaStateChangedMessage;

export type ChatOutgoingMessage =
  | ChatPingMessage;

export type ChatConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ChatClientConfig {
  /** WebSocket URL for chat service (ws:// or wss://) */
  wsUrl: string;
  /** Optional auth token for non-cookie auth (mobile/cross-domain) */
  authToken?: string;
  /** Heartbeat interval in ms (default: 15000) */
  heartbeatInterval?: number;
  /**
   * Heartbeat interval when the tab/window is in the background (default: 90000).
   * Browsers throttle setInterval in hidden tabs to ~60s+, which causes false
   * pong timeouts at the normal 15s cadence. This longer interval avoids
   * unnecessary disconnections while the tab is backgrounded.
   */
  backgroundHeartbeatInterval?: number;
  /** Reconnect delay in ms (default: 1000, max: 30000 with exponential backoff) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Max time to wait for a connection to open before retrying (default: 10000) */
  connectTimeout?: number;
  /** Max time to wait for a pong after sending a ping (default: 10000) */
  pongTimeout?: number;
}

export interface ChatClientEvents {
  onStateChange?: (state: ChatConnectionState) => void;
  onMessage?: (message: ChatIncomingMessage) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Chat Client
// ============================================================================

export class ChatClient {
  private ws: WebSocket | null = null;
  private config: Required<ChatClientConfig>;
  private events: ChatClientEvents;
  private state: ChatConnectionState = 'disconnected';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(config: ChatClientConfig, events: ChatClientEvents = {}) {
    this.config = {
      wsUrl: config.wsUrl,
      authToken: config.authToken ?? '',
      heartbeatInterval: config.heartbeatInterval ?? 15000,
      backgroundHeartbeatInterval: config.backgroundHeartbeatInterval ?? 90000,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
      connectTimeout: config.connectTimeout ?? 10000,
      pongTimeout: config.pongTimeout ?? 10000,
    };
    this.events = events;
  }

  /**
   * Get the current connection state
   */
  getState(): ChatConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Connect to the chat server
   */
  connect(): void {
    if (this.ws && (this.state === 'connected' || this.state === 'connecting')) {
      return;
    }

    this.intentionalClose = false;
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    let url = this.config.wsUrl;
    if (this.config.authToken) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}token=${encodeURIComponent(this.config.authToken)}`;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Failed to create WebSocket'));
      this.scheduleReconnect();
      return;
    }

    this.startConnectTimeout();

    this.ws.onopen = () => {
      this.clearConnectTimeout();
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.clearConnectTimeout();
      this.stopHeartbeat();
      this.clearPongTimeout();
      this.ws = null;

      if (!this.intentionalClose) {
        this.handleError(new Error(`Connection closed: ${event.code} ${event.reason}`));
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      this.handleError(new Error('WebSocket error'));
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Disconnect from the chat server
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.clearPongTimeout();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  /**
   * Force an immediate reconnection attempt.
   * Tears down any existing socket, resets backoff, and connects fresh.
   * No-op if the client was intentionally disconnected.
   */
  forceReconnect(): void {
    if (this.intentionalClose) {
      return;
    }

    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.clearPongTimeout();
    this.stopHeartbeat();
    this.detachAndCloseSocket();
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Send a message to the server
   */
  send(message: ChatOutgoingMessage): boolean {
    if (!this.ws || this.state !== 'connected') {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update event handlers
   */
  setEventHandlers(events: ChatClientEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Update auth token (for token refresh)
   */
  updateAuthToken(token: string): void {
    this.config.authToken = token;
    if (this.state === 'connected') {
      this.disconnect();
      this.connect();
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private setState(state: ChatConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.events.onStateChange?.(state);
    }
  }

  private handleMessage(data: string | ArrayBuffer | Blob): void {
    try {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
      const message = JSON.parse(text) as ChatIncomingMessage;

      if (message.type === 'pong') {
        this.clearPongTimeout();
      }

      this.events.onMessage?.(message);
    } catch {
      this.handleError(new Error('Failed to parse message'));
    }
  }

  private handleError(error: Error): void {
    this.events.onError?.(error);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const interval = this.isDocumentHidden()
      ? this.config.backgroundHeartbeatInterval
      : this.config.heartbeatInterval;

    this.heartbeatTimer = setInterval(() => {
      if (this.send({ type: 'ping' })) {
        this.startPongTimeout();
      }
    }, interval);

    this.startVisibilityTracking();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.stopVisibilityTracking();
  }

  private isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
  }

  private startVisibilityTracking(): void {
    if (typeof document === 'undefined') return;
    this.stopVisibilityTracking();

    this.visibilityHandler = () => {
      if (this.state !== 'connected') return;
      this.clearPongTimeout();
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }

      const interval = document.hidden
        ? this.config.backgroundHeartbeatInterval
        : this.config.heartbeatInterval;

      if (!document.hidden) {
        if (this.send({ type: 'ping' })) {
          this.startPongTimeout();
        }
      }

      this.heartbeatTimer = setInterval(() => {
        if (this.send({ type: 'ping' })) {
          this.startPongTimeout();
        }
      }, interval);
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private stopVisibilityTracking(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Closes the current socket and detaches all event handlers so that
   * stale callbacks from an abandoned socket never interfere with a
   * subsequent connection attempt.
   */
  private detachAndCloseSocket(): void {
    if (!this.ws) return;

    const ws = this.ws;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    this.ws = null;
    try { ws.close(); } catch { /* best-effort */ }
  }

  // -- Connect timeout ------------------------------------------------------

  private startConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.ws && this.state !== 'connected') {
        this.handleError(new Error('Connection timed out'));
        this.detachAndCloseSocket();
        this.scheduleReconnect();
      }
    }, this.config.connectTimeout);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  // -- Pong timeout ----------------------------------------------------------

  private startPongTimeout(): void {
    this.clearPongTimeout();
    this.pongTimeoutTimer = setTimeout(() => {
      if (this.ws && this.state === 'connected') {
        this.handleError(new Error('Heartbeat timeout: no pong received'));
        this.detachAndCloseSocket();
        this.stopHeartbeat();
        this.scheduleReconnect();
      }
    }, this.config.pongTimeout);
  }

  private clearPongTimeout(): void {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  // -- Reconnect scheduling --------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionalClose) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState('disconnected');
      this.handleError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.clearReconnectTimer();
    this.setState('reconnecting');

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a chat client instance
 */
export function createChatClient(
  config: ChatClientConfig,
  events?: ChatClientEvents
): ChatClient {
  return new ChatClient(config, events);
}
