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
  | 'group_invite_received'
  | 'group_invite_accepted'
  | 'conversation_message_deleted';

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
    action: 'member_added' | 'member_removed' | 'member_left' | 'removed' | 'renamed';
    identityId?: string;
  };
}

export interface ChatConversationMessageMessage extends ChatMessageBase {
  type: 'conversation_message';
  data: {
    conversationId: string;
    messageId: string;
    fromIdentityId: string;
    createdAt: string;
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

export interface ChatConversationMessageDeletedMessage extends ChatMessageBase {
  type: 'conversation_message_deleted';
  data: {
    conversationId: string;
    messageId: string;
    deletedBy: string;
    forEveryone: boolean;
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
  | ChatGroupInviteReceivedMessage
  | ChatGroupInviteAcceptedMessage
  | ChatConversationMessageDeletedMessage;

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

  constructor(config: ChatClientConfig, events: ChatClientEvents = {}) {
    this.config = {
      wsUrl: config.wsUrl,
      authToken: config.authToken ?? '',
      heartbeatInterval: config.heartbeatInterval ?? 15000,
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
    this.heartbeatTimer = setInterval(() => {
      if (this.send({ type: 'ping' })) {
        this.startPongTimeout();
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
