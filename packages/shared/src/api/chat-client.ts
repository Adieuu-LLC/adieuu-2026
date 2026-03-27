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
  | 'friend_removed';

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

export type ChatIncomingMessage =
  | ChatPongMessage
  | ChatErrorMessage
  | ChatAckMessage
  | ChatFriendRequestReceivedMessage
  | ChatFriendRequestAcceptedMessage
  | ChatFriendRemovedMessage;

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
  private reconnectAttempts = 0;
  private intentionalClose = false;

  constructor(config: ChatClientConfig, events: ChatClientEvents = {}) {
    this.config = {
      wsUrl: config.wsUrl,
      authToken: config.authToken ?? '',
      heartbeatInterval: config.heartbeatInterval ?? 15000,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
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

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
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
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
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
      this.send({ type: 'ping' });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

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
