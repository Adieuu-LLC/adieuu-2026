import { describe, expect, mock, test } from 'bun:test';
import { PLATFORM_ROLES } from '../constants/platform-permissions';

const mockGet = mock(async (_key?: string) => null as string | null);
const mockSet = mock(async () => 'OK');
let redisConnected = true;

mock.module('../db', () => ({
  getRedis: () => ({ get: mockGet, set: mockSet }),
  isRedisConnected: () => redisConnected,
  RedisKeys: {
    chatOnline: (id: string) => `chat:online:${id}`,
    chatLastSeen: (id: string) => `chat:lastseen:${id}`,
    supportTicketAssignRoundRobinSupportAgent: () => 'support:ticket:assign:round_robin:support_agent',
    supportTicketAssignRoundRobinFallback: () => 'support:ticket:assign:round_robin:fallback',
  },
}));

const {
  classifyStaffPool,
  isIdentityRecentlyActive,
  pickRoundRobinAssignee,
} = await import('./support-ticket-assignment.service');

describe('support-ticket-assignment.service', () => {
  test('classifyStaffPool prefers support_agent over moderator/admin', () => {
    expect(
      classifyStaffPool({
        platformRoles: [PLATFORM_ROLES.SUPPORT_AGENT, PLATFORM_ROLES.ADMIN],
      }),
    ).toBe('support_agent');
    expect(classifyStaffPool({ platformRoles: [PLATFORM_ROLES.MODERATOR] })).toBe('fallback');
    expect(classifyStaffPool({ platformRoles: [PLATFORM_ROLES.ADMIN] })).toBe('fallback');
    expect(classifyStaffPool({ platformRoles: [] })).toBeNull();
  });

  test('pickRoundRobinAssignee rotates through sorted staff ids', async () => {
    mockGet.mockImplementation(async (_key?: string) => {
      if (_key?.includes('round_robin:support_agent')) return 'b';
      return null;
    });

    const picked = await pickRoundRobinAssignee(['b', 'a', 'c'], 'support_agent');
    expect(picked).toBe('c');
    expect(mockSet).toHaveBeenCalled();
  });

  test('pickRoundRobinAssignee advances in-memory cursor when Redis is unavailable', async () => {
    redisConnected = false;
    try {
      const first = await pickRoundRobinAssignee(['a', 'b', 'c'], 'fallback');
      const second = await pickRoundRobinAssignee(['a', 'b', 'c'], 'fallback');
      const third = await pickRoundRobinAssignee(['a', 'b', 'c'], 'fallback');
      const fourth = await pickRoundRobinAssignee(['a', 'b', 'c'], 'fallback');

      expect(first).toBe('a');
      expect(second).toBe('b');
      expect(third).toBe('c');
      expect(fourth).toBe('a');
    } finally {
      redisConnected = true;
    }
  });

  test('isIdentityRecentlyActive returns true when online key exists', async () => {
    mockGet.mockImplementationOnce(async () => '1');
    await expect(isIdentityRecentlyActive('agent-1')).resolves.toBe(true);
  });

  test('isIdentityRecentlyActive returns true for recent lastSeen', async () => {
    mockGet
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => new Date(Date.now() - 60_000).toISOString());
    await expect(isIdentityRecentlyActive('agent-1')).resolves.toBe(true);
  });

  test('isIdentityRecentlyActive returns false when stale', async () => {
    mockGet
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => new Date(Date.now() - 20 * 60_000).toISOString());
    await expect(isIdentityRecentlyActive('agent-1')).resolves.toBe(false);
  });
});
