import { describe, expect, mock, test } from 'bun:test';
import { PLATFORM_ROLES } from '../constants/platform-permissions';

const mockGet = mock(async (_key?: string) => null as string | null);
const mockSet = mock(async () => 'OK');
const mockAssignTicket = mock(async () => ({ success: true, data: undefined }));
const mockCreateNotification = mock(async () => ({ success: true }));
const mockFindByAnyPlatformRole = mock(async () => [] as Array<{ _id: string; platformRoles?: string[] }>);
const mockFindByPlatformRole = mock(async () => [] as Array<{ _id: string; platformRoles?: string[] }>);

mock.module('../db', () => ({
  getRedis: () => ({ get: mockGet, set: mockSet }),
  isRedisConnected: () => true,
  RedisKeys: {
    chatOnline: (id: string) => `chat:online:${id}`,
    chatLastSeen: (id: string) => `chat:lastseen:${id}`,
    supportTicketAssignRoundRobinSupportAgent: () => 'support:ticket:assign:round_robin:support_agent',
    supportTicketAssignRoundRobinFallback: () => 'support:ticket:assign:round_robin:fallback',
  },
}));

mock.module('./support-ticket.service', () => ({
  assignTicket: mockAssignTicket,
}));

mock.module('./notification.service', () => ({
  createNotification: mockCreateNotification,
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByAnyPlatformRole: mockFindByAnyPlatformRole,
    findByPlatformRole: mockFindByPlatformRole,
  }),
}));

const {
  classifyStaffPool,
  pickRoundRobinAssignee,
  autoAssignNewTicket,
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
      if (_key?.includes('support_agent')) return 'b';
      return null;
    });

    const picked = await pickRoundRobinAssignee(['b', 'a', 'c'], 'support_agent');
    expect(picked).toBe('c');
    expect(mockSet).toHaveBeenCalled();
  });

  test('autoAssignNewTicket assigns recently active support agent first', async () => {
    mockFindByAnyPlatformRole.mockImplementationOnce(async () => [
      { _id: 'agent-1', platformRoles: [PLATFORM_ROLES.SUPPORT_AGENT] },
      { _id: 'mod-1', platformRoles: [PLATFORM_ROLES.MODERATOR] },
    ]);
    mockGet.mockImplementation(async (_key?: string) => {
      if (_key?.endsWith('agent-1')) return '1';
      return null;
    });

    await autoAssignNewTicket({
      _id: { toHexString: () => 'ticket-oid' },
      ticketId: 'T-test1234',
      title: 'Need help',
    } as never);

    expect(mockAssignTicket).toHaveBeenCalledWith(
      'system',
      'ticket-oid',
      'agent-1',
      expect.objectContaining({ actorType: 'system', notifyAssignee: true }),
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  test('autoAssignNewTicket falls back to moderator when no support agents are active', async () => {
    mockAssignTicket.mockClear();
    mockCreateNotification.mockClear();
    mockFindByAnyPlatformRole.mockImplementationOnce(async () => [
      { _id: 'agent-1', platformRoles: [PLATFORM_ROLES.SUPPORT_AGENT] },
      { _id: 'mod-1', platformRoles: [PLATFORM_ROLES.MODERATOR] },
    ]);
    mockGet.mockImplementation(async (_key?: string) => {
      if (_key?.endsWith('mod-1')) return '1';
      return null;
    });

    await autoAssignNewTicket({
      _id: { toHexString: () => 'ticket-oid' },
      ticketId: 'T-test1234',
      title: 'Need help',
    } as never);

    expect(mockAssignTicket).toHaveBeenCalledWith(
      'system',
      'ticket-oid',
      'mod-1',
      expect.objectContaining({ actorType: 'system' }),
    );
  });

  test('autoAssignNewTicket notifies admins when nobody is recently active', async () => {
    mockAssignTicket.mockClear();
    mockCreateNotification.mockClear();
    mockFindByAnyPlatformRole.mockImplementationOnce(async () => [
      { _id: 'agent-1', platformRoles: [PLATFORM_ROLES.SUPPORT_AGENT] },
    ]);
    mockFindByPlatformRole.mockImplementationOnce(async () => [
      { _id: 'admin-1', platformRoles: [PLATFORM_ROLES.ADMIN] },
    ]);
    mockGet.mockImplementation(async () => null);

    await autoAssignNewTicket({
      _id: { toHexString: () => 'ticket-oid' },
      ticketId: 'T-test1234',
      title: 'Need help',
    } as never);

    expect(mockAssignTicket).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      'admin-1',
      'support_ticket_new_unassigned',
      expect.objectContaining({ ticketId: 'T-test1234', ticketObjectId: 'ticket-oid' }),
    );
  });
});
