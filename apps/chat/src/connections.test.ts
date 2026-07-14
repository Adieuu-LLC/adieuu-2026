import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubscribe = vi.fn(async (_channel: string) => {});
const mockUnsubscribe = vi.fn(async (_channel: string) => {});
const onHandlers: Record<string, (channel: string, message: string) => void> = {};

const subscriber = {
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  on: (event: string, handler: (channel: string, message: string) => void) => {
    onHandlers[event] = handler;
  },
  status: 'ready',
};

const publisher = {
  setex: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  set: vi.fn(async () => {}),
};

let redisConnected = true;

vi.mock('./db/redis', () => ({
  getSubscriber: () => subscriber,
  getPublisher: () => publisher,
  isRedisConnected: () => redisConnected,
}));

vi.mock('./config', () => ({
  config: {
    redis: { keyPrefix: 'adieuu:' },
    presence: { heartbeatTtlSeconds: 30 },
  },
}));

vi.mock('./utils/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  initializeMessageHandler,
  registerConnection,
  unregisterConnection,
  getConnectionsForSpace,
  getConnectionsForIdentity,
} from './connections';

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeSocket() {
  return { send: vi.fn(() => 1) } as any;
}

/** Delivers a Redis message through the captured pub/sub message handler. */
function deliver(unprefixedChannel: string, event: object) {
  onHandlers.message?.(`adieuu:${unprefixedChannel}`, JSON.stringify(event));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('chat connections - space fan-out', () => {
  beforeEach(() => {
    redisConnected = true;
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    initializeMessageHandler();
  });

  it('subscribes a connection to its identity and space channels', async () => {
    const ws = makeSocket();
    await registerConnection('id-1', ws, ['space-A', 'space-B']);

    const subscribed = mockSubscribe.mock.calls.map((c) => c[0]);
    expect(subscribed).toContain('adieuu:identity:id-1');
    expect(subscribed).toContain('adieuu:space:space-A');
    expect(subscribed).toContain('adieuu:space:space-B');
    expect(getConnectionsForSpace('space-A')?.has(ws)).toBe(true);

    await unregisterConnection('id-1', ws, ['space-A', 'space-B']);
  });

  it('delivers a space broadcast to members but not to non-members', async () => {
    const member = makeSocket();
    const other = makeSocket();
    await registerConnection('member', member, ['space-1']);
    await registerConnection('outsider', other, ['space-2']);

    deliver('space:space-1', { type: 'space_message', data: { message: { id: 'm1' } } });

    expect(member.send).toHaveBeenCalledTimes(1);
    expect(other.send).not.toHaveBeenCalled();

    await unregisterConnection('member', member, ['space-1']);
    await unregisterConnection('outsider', other, ['space-2']);
  });

  it('fans a space broadcast out to every member socket', async () => {
    const a = makeSocket();
    const b = makeSocket();
    await registerConnection('a', a, ['space-x']);
    await registerConnection('b', b, ['space-x']);

    deliver('space:space-x', { type: 'space_member_joined', data: {} });

    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledTimes(1);

    await unregisterConnection('a', a, ['space-x']);
    await unregisterConnection('b', b, ['space-x']);
  });

  it('stops delivering space events after a member leaves (unregister)', async () => {
    const ws = makeSocket();
    await registerConnection('leaver', ws, ['space-9']);
    await unregisterConnection('leaver', ws, ['space-9']);

    expect(getConnectionsForSpace('space-9')).toBeUndefined();
    // Last socket gone -> the space channel is unsubscribed.
    expect(mockUnsubscribe).toHaveBeenCalledWith('adieuu:space:space-9');

    deliver('space:space-9', { type: 'space_message', data: {} });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('keeps the space subscription while another socket remains', async () => {
    const a = makeSocket();
    const b = makeSocket();
    await registerConnection('a', a, ['space-shared']);
    await registerConnection('b', b, ['space-shared']);

    await unregisterConnection('a', a, ['space-shared']);

    // b still present -> no unsubscribe yet, and b still receives events.
    expect(mockUnsubscribe).not.toHaveBeenCalledWith('adieuu:space:space-shared');
    deliver('space:space-shared', { type: 'space_message', data: {} });
    expect(b.send).toHaveBeenCalledTimes(1);

    await unregisterConnection('b', b, ['space-shared']);
  });

  it('still routes identity-channel events (invites) to the identity', async () => {
    const ws = makeSocket();
    await registerConnection('invitee', ws, []);

    deliver('identity:invitee', { type: 'space_invite_received', data: {} });
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(getConnectionsForIdentity('invitee')?.has(ws)).toBe(true);

    await unregisterConnection('invitee', ws, []);
  });
});
