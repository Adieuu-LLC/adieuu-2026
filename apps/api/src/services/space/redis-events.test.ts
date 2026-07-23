/**
 * Unit tests for the Space Redis pub/sub publisher.
 *
 * @module services/space/redis-events.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

let connected = true;
const publishMock = mock(async () => 3) as AnyMock;

mock.module('../../config', () => ({
  config: { redis: { keyPrefix: 'adieuu:' } },
}));

mock.module('../../db', () => ({
  isRedisConnected: () => connected,
  getRedis: () => ({ publish: publishMock }),
  RedisKeys: {
    spaceChannel: (id: string) => `space:${id}`,
    identityChannel: (id: string) => `identity:${id}`,
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

import { publishSpaceEvent, publishSpaceEventToIdentity } from './redis-events';

describe('space/redis-events', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    connected = true;
    publishMock.mockClear();
    publishMock.mockResolvedValue(3);
  });

  test('publishSpaceEvent broadcasts on the prefixed space channel', async () => {
    await publishSpaceEvent('abc', { type: 'space_message', data: { x: 1 } });
    expect(publishMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishMock.mock.calls[0]!;
    expect(channel).toBe('adieuu:space:abc');
    expect(JSON.parse(payload)).toEqual({ type: 'space_message', data: { x: 1 } });
  });

  test('publishSpaceEventToIdentity targets the prefixed identity channel', async () => {
    await publishSpaceEventToIdentity('id1', { type: 'space_invite_received' });
    const [channel] = publishMock.mock.calls[0]!;
    expect(channel).toBe('adieuu:identity:id1');
  });

  test('embeds the audience allow-list in the envelope for restricted events', async () => {
    await publishSpaceEvent(
      'abc',
      { type: 'space_message', data: { x: 1 } },
      { audienceIdentityIds: ['idA', 'idB'] },
    );
    const [, payload] = publishMock.mock.calls[0]!;
    expect(JSON.parse(payload)).toEqual({
      type: 'space_message',
      data: { x: 1 },
      audienceIdentityIds: ['idA', 'idB'],
    });
  });

  test('embeds an empty audience (deliver to no one) rather than dropping it', async () => {
    await publishSpaceEvent(
      'abc',
      { type: 'space_message' },
      { audienceIdentityIds: [] },
    );
    const [, payload] = publishMock.mock.calls[0]!;
    expect(JSON.parse(payload).audienceIdentityIds).toEqual([]);
  });

  test('omits audience metadata for space-wide broadcasts', async () => {
    await publishSpaceEvent('abc', { type: 'space_updated' }, { audienceIdentityIds: null });
    const [, payload] = publishMock.mock.calls[0]!;
    expect(JSON.parse(payload)).toEqual({ type: 'space_updated' });
  });

  test('embeds the exclusion list when provided', async () => {
    await publishSpaceEvent(
      'abc',
      { type: 'space_channel_layout_updated' },
      { excludeIdentityIds: ['idC'] },
    );
    const [, payload] = publishMock.mock.calls[0]!;
    expect(JSON.parse(payload).excludeIdentityIds).toEqual(['idC']);
  });

  test('no-ops (does not throw or publish) when Redis is disconnected', async () => {
    connected = false;
    await publishSpaceEvent('abc', { type: 'space_updated' });
    expect(publishMock).not.toHaveBeenCalled();
  });

  test('swallows publish errors so the request still succeeds', async () => {
    publishMock.mockRejectedValueOnce(new Error('boom'));
    await expect(publishSpaceEvent('abc', { type: 'space_message' })).resolves.toBeUndefined();
  });
});
