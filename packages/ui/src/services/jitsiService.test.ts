/**
 * @module services/jitsiService.test
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CONNECTION_ESTABLISHED = 'connection.connectionEstablished';
const CONNECTION_FAILED = 'connection.connectionFailed';
const CONFERENCE_JOINED = 'conference.conferenceJoined';
const CONFERENCE_FAILED = 'conference.conferenceFailed';

const connectionListeners = new Map<string, AnyMock[]>();

function addListener(map: Map<string, AnyMock[]>, event: string, handler: AnyMock) {
  const list = map.get(event) ?? [];
  list.push(handler);
  map.set(event, list);
}

function removeListener(map: Map<string, AnyMock[]>, event: string, handler: AnyMock) {
  const list = map.get(event);
  if (!list) return;
  map.set(
    event,
    list.filter((h) => h !== handler)
  );
}

function fireListeners(map: Map<string, AnyMock[]>, event: string) {
  for (const handler of map.get(event) ?? []) {
    handler();
  }
}

function createMockConference() {
  const listeners = new Map<string, AnyMock[]>();

  return {
    join: mock(() => {
      fireListeners(listeners, CONFERENCE_JOINED);
    }),
    leave: mock(async () => {}),
    addTrack: mock(async () => {}),
    removeTrack: mock(async () => {}),
    setE2EEKey: mock(() => {}),
    addEventListener: mock((event: string, handler: AnyMock) => {
      addListener(listeners, event, handler);
    }),
    removeEventListener: mock((event: string, handler: AnyMock) => {
      removeListener(listeners, event, handler);
    }),
  };
}

const mockConnection = {
  connect: mock(() => {
    fireListeners(connectionListeners, CONNECTION_ESTABLISHED);
  }),
  disconnect: mock(() => {}),
  initJitsiConference: mock(() => createMockConference()),
  addEventListener: mock((event: string, handler: AnyMock) => {
    addListener(connectionListeners, event, handler);
  }),
  removeEventListener: mock((event: string, handler: AnyMock) => {
    removeListener(connectionListeners, event, handler);
  }),
};

let JitsiService: typeof import('./jitsiService').JitsiService;

describe('JitsiService', () => {
  beforeAll(async () => {
    const win = new Window();
    globalThis.window = win as unknown as Window & typeof globalThis;
    globalThis.document = win.document;

    mock.module('lib-jitsi-meet', () => ({
      default: {
        init: mock(() => {}),
        setLogLevel: mock(() => {}),
        JitsiConnection: mock(function JitsiConnection() {
          return mockConnection;
        }),
        createLocalTracks: mock(async () => []),
        events: {
          connection: {
            CONNECTION_ESTABLISHED,
            CONNECTION_FAILED,
          },
          conference: {
            CONFERENCE_JOINED,
            CONFERENCE_LEFT: 'conference.conferenceLeft',
            CONFERENCE_FAILED,
            TRACK_ADDED: 'conference.trackAdded',
            TRACK_REMOVED: 'conference.trackRemoved',
            USER_JOINED: 'conference.userJoined',
            USER_LEFT: 'conference.userLeft',
          },
        },
      },
    }));

    ({ JitsiService } = await import('./jitsiService'));
  });

  afterAll(() => {
    mock.restore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document;
  });

  beforeEach(() => {
    connectionListeners.clear();
    mockConnection.connect.mockClear();
    mockConnection.disconnect.mockClear();
    mockConnection.initJitsiConference.mockClear();
    mockConnection.connect.mockImplementation(() => {
      fireListeners(connectionListeners, CONNECTION_ESTABLISHED);
    });
  });

  test('connect joins conference on established connection', async () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });

    await service.connect('room-abc', 'jwt-token');

    expect(mockConnection.connect).toHaveBeenCalled();
    expect(mockConnection.initJitsiConference).toHaveBeenCalled();
  });

  test('disconnect allows subsequent connect', async () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });

    await service.connect('room-abc', 'jwt-token');
    await service.disconnect();
    await service.connect('room-abc', 'jwt-token-2');

    expect(mockConnection.connect).toHaveBeenCalledTimes(2);
  });

  test('disconnect preserves event handler registration for reconnect', async () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });
    const events: string[] = [];
    service.on((event) => {
      if (event.type === 'conference_joined') events.push(event.type);
    });

    await service.connect('room-abc', 'jwt-token');
    await service.disconnect();
    events.length = 0;
    await service.connect('room-abc', 'jwt-token-2');

    expect(events).toEqual(['conference_joined']);
  });

  test('dispose clears handlers so reconnect does not notify', async () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });
    const events: string[] = [];
    service.on((event) => {
      if (event.type === 'conference_joined') events.push(event.type);
    });

    await service.connect('room-abc', 'jwt-token');
    expect(events).toEqual(['conference_joined']);

    await service.dispose();
    events.length = 0;
    await service.connect('room-abc', 'jwt-token-2');

    expect(events).toEqual([]);
  });

  test('dispose prevents further connect attempts', async () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });

    await service.connect('room-abc', 'jwt-token');
    await service.dispose();
    await service.connect('room-abc', 'jwt-token-2');

    expect(mockConnection.connect).toHaveBeenCalledTimes(1);
  });

  test('setE2EEKey throws before conference join', () => {
    const service = new JitsiService({
      serverHost: 'jitsi.example.com',
      serviceUrl: 'wss://jitsi.example.com/xmpp-websocket',
    });

    expect(() => service.setE2EEKey(new Uint8Array(32))).toThrow(
      'Cannot set E2EE key before joining a conference'
    );
  });
});
