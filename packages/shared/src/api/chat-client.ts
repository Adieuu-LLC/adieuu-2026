/**
 * WebSocket Chat Client for Adieuu
 *
 * Handles real-time communication with the chat service.
 * Authenticates using identity session cookies.
 */

export type {
  ChatMessageType,
  ChatMessageBase,
  ChatPingMessage,
  ChatPongMessage,
  ChatErrorMessage,
  ChatAckMessage,
  ChatFriendRequestReceivedMessage,
  ChatFriendRequestAcceptedMessage,
  ChatFriendRemovedMessage,
  ChatConversationCreatedMessage,
  ChatConversationUpdatedMessage,
  ChatGroupTerminatedMessage,
  ChatConversationMessageMessage,
  ChatConversationMessageEditedMessage,
  ChatGroupInviteReceivedMessage,
  ChatGroupInviteAcceptedMessage,
  ChatGroupInviteRevokedMessage,
  ChatConversationMessageDeletedMessage,
  ChatReactionAddedMessage,
  ChatReactionRemovedMessage,
  ChatNotificationCreatedMessage,
  ChatIdentityProfileUpdatedMessage,
  ChatCallMediaOptions,
  ChatCallInitiatedMessage,
  ChatCallParticipantJoinedMessage,
  ChatCallParticipantLeftMessage,
  ChatCallEndedMessage,
  ChatCallMediaStateChangedMessage,
  ChatSpaceCreatedMessage,
  ChatSpaceUpdatedMessage,
  ChatSpaceDeletedMessage,
  ChatSpaceMessageMessage,
  ChatSpaceMemberJoinedMessage,
  ChatSpaceMemberLeftMessage,
  ChatSpaceInviteReceivedMessage,
  ChatSpaceInviteAcceptedMessage,
  ChatSpaceInviteRevokedMessage,
  ChatSpaceMessageEditedMessage,
  ChatSpaceMessageDeletedMessage,
  ChatSpaceReactionAddedMessage,
  ChatSpaceReactionRemovedMessage,
  ChatSpacePinsUpdatedMessage,
  ChatIncomingMessage,
  ChatOutgoingMessage,
} from './chat-message-types';

import type { ChatIncomingMessage, ChatOutgoingMessage } from './chat-message-types';

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
  /** Fired when a pong is received and round-trip time is computed. */
  onHeartbeatRtt?: (rttMs: number) => void;
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
  private lastPingSentAt: number | null = null;
  private lastHeartbeatRttMs: number | null = null;

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
   * Round-trip time of the most recent successful chat heartbeat (ms), or null if none yet.
   */
  getLastHeartbeatRttMs(): number | null {
    return this.lastHeartbeatRttMs;
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
        if (this.lastPingSentAt !== null) {
          const rttMs = Math.max(0, Math.round(performance.now() - this.lastPingSentAt));
          this.lastPingSentAt = null;
          this.lastHeartbeatRttMs = rttMs;
          this.events.onHeartbeatRtt?.(rttMs);
        }
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

    this.sendHeartbeatPing();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeatPing();
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
        this.sendHeartbeatPing();
      }

      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeatPing();
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

  // -- Heartbeat ping --------------------------------------------------------

  private sendHeartbeatPing(): void {
    if (this.send({ type: 'ping' })) {
      this.lastPingSentAt = performance.now();
      this.startPongTimeout();
    }
  }

  // -- Pong timeout ----------------------------------------------------------

  private startPongTimeout(): void {
    this.clearPongTimeout();
    this.pongTimeoutTimer = setTimeout(() => {
      this.lastPingSentAt = null;
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
