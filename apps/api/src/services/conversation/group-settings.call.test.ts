/**
 * @module services/conversation/group-settings.call.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockPublishToParticipants = mock(() => Promise.resolve());

const mockConversationRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  updateCallSettings: mock(() => Promise.resolve(null)) as AnyMock,
};

const convId = new ObjectId('507f1f77bcf86cd799439011');
const adminId = new ObjectId('64a1b2c3d4e5f60718293a4b');
const memberId = new ObjectId('64a1b2c3d4e5f60718293a4c');
const now = new Date('2026-05-29T12:00:00.000Z');

function makeGroupConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: convId,
    type: 'group',
    participants: [adminId, memberId],
    admins: [adminId],
    createdBy: adminId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDmConversation() {
  return {
    _id: convId,
    type: 'dm',
    participants: [adminId, memberId],
    createdBy: adminId,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadUpdateCallSettings() {
  mock.restore();
  mock.module('../../repositories/conversation.repository', () => ({
    getConversationRepository: () => mockConversationRepo,
  }));
  mock.module('./redis-events', () => ({
    publishToParticipants: mockPublishToParticipants,
    publishConversationEvent: mock(() => Promise.resolve()),
  }));
  // Bun keeps mocked modules in cache after mock.restore(); bust cache to load the real module.
  return (await import(`./group-settings.ts?call-settings-test=${Date.now()}`)).updateCallSettings;
}

describe('updateCallSettings', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConversationRepo.findById.mockReset();
    mockConversationRepo.updateCallSettings.mockReset();
    mockPublishToParticipants.mockReset();
    mockConversationRepo.findById.mockResolvedValue(null);
    mockConversationRepo.updateCallSettings.mockResolvedValue(null);
  });

  test('returns CONVERSATION_NOT_FOUND when conversation missing', async () => {
    const updateCallSettings = await loadUpdateCallSettings();
    const r = await updateCallSettings(convId, adminId, { audioCallsDisabled: true });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('CONVERSATION_NOT_FOUND');
  });

  test('returns NOT_PARTICIPANT for non-member', async () => {
    const outsider = new ObjectId('64a1b2c3d4e5f60718293a4d');
    mockConversationRepo.findById.mockImplementation(() => Promise.resolve(makeGroupConversation()));
    const updateCallSettings = await loadUpdateCallSettings();
    const r = await updateCallSettings(convId, outsider, { audioCallsDisabled: true });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_PARTICIPANT');
  });

  test('returns NOT_ADMIN for non-admin group member', async () => {
    mockConversationRepo.findById.mockImplementation(() => Promise.resolve(makeGroupConversation()));
    const updateCallSettings = await loadUpdateCallSettings();
    const r = await updateCallSettings(convId, memberId, { videoCallsDisabled: true });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_ADMIN');
  });

  test('group admin can update call settings and publishes event', async () => {
    const updatedDoc = {
      ...makeGroupConversation(),
      videoCallsDisabled: true,
    };
    mockConversationRepo.findById.mockImplementation(() => Promise.resolve(makeGroupConversation()));
    mockConversationRepo.updateCallSettings.mockImplementation(() => Promise.resolve(updatedDoc));

    const updateCallSettings = await loadUpdateCallSettings();
    const r = await updateCallSettings(convId, adminId, { videoCallsDisabled: true });

    expect(r.success).toBe(true);
    expect(mockConversationRepo.updateCallSettings).toHaveBeenCalledWith(convId, {
      videoCallsDisabled: true,
    });
    expect(mockPublishToParticipants).toHaveBeenCalled();
  });

  test('DM participant can update call settings without admin role', async () => {
    const updatedDoc = {
      ...makeDmConversation(),
      screenshareDisabled: true,
    };
    mockConversationRepo.findById.mockImplementation(() => Promise.resolve(makeDmConversation()));
    mockConversationRepo.updateCallSettings.mockImplementation(() => Promise.resolve(updatedDoc));

    const updateCallSettings = await loadUpdateCallSettings();
    const r = await updateCallSettings(convId, memberId, { screenshareDisabled: true });

    expect(r.success).toBe(true);
    expect(r.conversation).toBeDefined();
  });
});
