import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ChatClient, createChatClient } from './chat-client';
import type { ChatMessageType } from './chat-message-types';

type WsHandler = ((ev?: unknown) => void) | null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: WsHandler = null;
  onclose: WsHandler = null;
  onerror: WsHandler = null;
  onmessage: WsHandler = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  /** Simulate a successful open. */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  /** Deliver an inbound text frame. */
  deliver(data: string): void {
    this.onmessage?.({ data });
  }
}

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket;
});

function lastSocket(): MockWebSocket {
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  if (!ws) throw new Error('No WebSocket created');
  return ws;
}

describe('ChatClient', () => {
  test('connect transitions connecting → connected', () => {
    const states: string[] = [];
    const client = new ChatClient(
      {
        wsUrl: 'ws://example.test/chat',
        heartbeatInterval: 60_000,
        pongTimeout: 60_000,
        connectTimeout: 60_000,
        maxReconnectAttempts: 0,
      },
      { onStateChange: (s) => states.push(s) },
    );

    client.connect();
    expect(client.getState()).toBe('connecting');
    expect(client.isConnected()).toBe(false);

    lastSocket().open();
    expect(client.getState()).toBe('connected');
    expect(client.isConnected()).toBe(true);
    expect(states).toEqual(['connecting', 'connected']);

    client.disconnect();
  });

  test('appends authToken as query param', () => {
    const client = new ChatClient({
      wsUrl: 'ws://example.test/chat',
      authToken: 'tok-123',
      heartbeatInterval: 60_000,
      pongTimeout: 60_000,
      connectTimeout: 60_000,
      maxReconnectAttempts: 0,
    });
    client.connect();
    expect(lastSocket().url).toBe('ws://example.test/chat?token=tok-123');
    client.disconnect();
  });

  test('appends authToken with & when URL already has a query', () => {
    const client = new ChatClient({
      wsUrl: 'ws://example.test/chat?v=1',
      authToken: 'abc',
      heartbeatInterval: 60_000,
      pongTimeout: 60_000,
      connectTimeout: 60_000,
      maxReconnectAttempts: 0,
    });
    client.connect();
    expect(lastSocket().url).toBe('ws://example.test/chat?v=1&token=abc');
    client.disconnect();
  });

  test('send returns false when disconnected and true when connected', () => {
    const client = new ChatClient({
      wsUrl: 'ws://example.test/chat',
      heartbeatInterval: 60_000,
      pongTimeout: 60_000,
      connectTimeout: 60_000,
      maxReconnectAttempts: 0,
    });

    expect(client.send({ type: 'ping' })).toBe(false);

    client.connect();
    lastSocket().open();
    // Heartbeat already sent one ping on open; clear for assertion clarity.
    lastSocket().sent = [];
    expect(client.send({ type: 'ping' })).toBe(true);
    expect(lastSocket().sent).toEqual([JSON.stringify({ type: 'ping' })]);

    client.disconnect();
  });

  test('pong updates heartbeat RTT', () => {
    const onHeartbeatRtt = mock((_rttMs: number) => {});
    const client = new ChatClient(
      {
        wsUrl: 'ws://example.test/chat',
        heartbeatInterval: 60_000,
        pongTimeout: 60_000,
        connectTimeout: 60_000,
        maxReconnectAttempts: 0,
      },
      { onHeartbeatRtt },
    );

    client.connect();
    lastSocket().open();
    // Immediate heartbeat ping was sent on open.
    expect(lastSocket().sent.some((s) => s.includes('"ping"'))).toBe(true);

    lastSocket().deliver(JSON.stringify({ type: 'pong' }));
    expect(onHeartbeatRtt).toHaveBeenCalled();
    expect(client.getLastHeartbeatRttMs()).not.toBeNull();
    expect(client.getLastHeartbeatRttMs()!).toBeGreaterThanOrEqual(0);

    client.disconnect();
  });

  test('non-JSON message invokes onError', () => {
    const onError = mock((_err: Error) => {});
    const client = new ChatClient(
      {
        wsUrl: 'ws://example.test/chat',
        heartbeatInterval: 60_000,
        pongTimeout: 60_000,
        connectTimeout: 60_000,
        maxReconnectAttempts: 0,
      },
      { onError },
    );

    client.connect();
    lastSocket().open();
    lastSocket().deliver('not-json{');

    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0]![0] as Error;
    expect(err.message).toContain('Failed to parse message');

    client.disconnect();
  });

  test('intentional disconnect leaves client disconnected without reconnect', async () => {
    const states: string[] = [];
    const client = new ChatClient(
      {
        wsUrl: 'ws://example.test/chat',
        heartbeatInterval: 60_000,
        pongTimeout: 60_000,
        connectTimeout: 60_000,
        reconnectDelay: 10,
        maxReconnectAttempts: 3,
      },
      { onStateChange: (s) => states.push(s) },
    );

    client.connect();
    lastSocket().open();
    const socketsBefore = MockWebSocket.instances.length;

    client.disconnect();
    expect(client.getState()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);

    await new Promise((r) => setTimeout(r, 30));
    expect(MockWebSocket.instances.length).toBe(socketsBefore);
    expect(states.at(-1)).toBe('disconnected');
  });

  test('createChatClient returns a ChatClient instance', () => {
    const client = createChatClient({
      wsUrl: 'ws://example.test/chat',
      maxReconnectAttempts: 0,
    });
    expect(client).toBeInstanceOf(ChatClient);
    expect(client.getState()).toBe('disconnected');
  });
});

describe('chat message types', () => {
  test('ChatMessageType includes space event discriminants', () => {
    const spaceEvents = [
      'space_created',
      'space_updated',
      'space_deleted',
      'space_channel_created',
      'space_channel_updated',
      'space_message',
      'space_member_joined',
      'space_member_left',
      'space_invite_received',
      'space_invite_accepted',
      'space_invite_revoked',
      'space_message_edited',
      'space_message_deleted',
      'space_reaction_added',
      'space_reaction_removed',
      'space_pins_updated',
    ] as const satisfies readonly ChatMessageType[];

    expect(spaceEvents).toHaveLength(16);
    expect(spaceEvents).toContain('space_pins_updated');
    expect(spaceEvents).toContain('space_created');
  });

  test('ChatMessageType includes core protocol and conversation discriminants', () => {
    const coreEvents = [
      'ping',
      'pong',
      'ack',
      'error',
      'friend_request_received',
      'conversation_created',
      'conversation_message',
      'reaction_added',
      'call_initiated',
      'notification_created',
    ] as const satisfies readonly ChatMessageType[];

    expect(coreEvents).toContain('conversation_message');
    expect(coreEvents).toContain('call_initiated');
  });
});
