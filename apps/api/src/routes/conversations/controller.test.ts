/**
 * @module routes/conversations/controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_PEER = '507f1f77bcf86cd799439012';

const mockCreateConversation = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockGetConversation = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockListConversations = mock(() =>
  Promise.resolve({ conversations: [], cursor: null }),
);
const mockAcceptGroupInvite = mock(() =>
  Promise.resolve({ success: true, invite: { id: VALID_ID } }),
);
const mockDeclineGroupInvite = mock(() =>
  Promise.resolve({ success: true, invite: { id: VALID_ID } }),
);
const mockListGroupInvites = mock(() =>
  Promise.resolve({ invites: [], cursor: null }),
);
const mockGetGroupInvitePreview = mock(() =>
  Promise.resolve({ success: true, preview: {} }),
);
const mockPromoteToAdmin = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockTerminateGroup = mock(() => Promise.resolve({ success: true }));
const mockGetFormerMembers = mock(() =>
  Promise.resolve({ success: true, formerMembers: [] }),
);
const mockUpdateMemberSettings = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockUpdateGifsDisabled = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockUpdateGifContentFilter = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockUpdateCustomEmojisDisabled = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockUpdateDisallowPersistentMessageSearchCache = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockListPendingInvitesForConversation = mock(() =>
  Promise.resolve({ success: true, invites: [] }),
);
const mockRevokeGroupInvite = mock(() =>
  Promise.resolve({ success: true, invite: { id: VALID_ID } }),
);
const mockPinMessage = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockUnpinMessage = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockAddGroupMember = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockRemoveGroupMember = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);
const mockLeaveConversation = mock(() => Promise.resolve({ success: true }));
const mockUpdateGroupName = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
);

mock.module('../../services/conversation.service', () => ({
  createConversation: mockCreateConversation,
  getConversation: mockGetConversation,
  listConversations: mockListConversations,
  acceptGroupInvite: mockAcceptGroupInvite,
  declineGroupInvite: mockDeclineGroupInvite,
  listGroupInvites: mockListGroupInvites,
  getGroupInvitePreview: mockGetGroupInvitePreview,
  promoteToAdmin: mockPromoteToAdmin,
  terminateGroup: mockTerminateGroup,
  getFormerMembers: mockGetFormerMembers,
  updateMemberSettings: mockUpdateMemberSettings,
  updateGifsDisabled: mockUpdateGifsDisabled,
  updateGifContentFilter: mockUpdateGifContentFilter,
  updateCustomEmojisDisabled: mockUpdateCustomEmojisDisabled,
  updateDisallowPersistentMessageSearchCache: mockUpdateDisallowPersistentMessageSearchCache,
  listPendingInvitesForConversation: mockListPendingInvitesForConversation,
  revokeGroupInvite: mockRevokeGroupInvite,
  pinMessage: mockPinMessage,
  unpinMessage: mockUnpinMessage,
  addGroupMember: mockAddGroupMember,
  removeGroupMember: mockRemoveGroupMember,
  leaveConversation: mockLeaveConversation,
  updateGroupName: mockUpdateGroupName,
}));

const mockFindForIdentity = mock(() => Promise.resolve([]));
const mockUpsert = mock(() =>
  Promise.resolve({
    _id: new ObjectId(),
    identityId: ROUTE_TEST_IDENTITY_ID,
    conversationId: new ObjectId(VALID_ID),
    archived: false,
    favorited: false,
    keepArchived: false,
    updatedAt: new Date(),
  }),
);

mock.module('../../repositories/conversation-preferences.repository', () => ({
  getConversationPreferencesRepository: mock(() => ({
    findForIdentity: mockFindForIdentity,
    upsert: mockUpsert,
  })),
}));

const mockCountByConversation = mock(() => Promise.resolve(3));

mock.module('../../repositories/message.repository', () => ({
  getMessageRepository: mock(() => ({
    countByConversation: mockCountByConversation,
  })),
}));

const mockSetMessageCount = mock(() => Promise.resolve());

mock.module('../../repositories/conversation.repository', () => ({
  getConversationRepository: mock(() => ({
    setMessageCount: mockSetMessageCount,
  })),
}));

import {
  createConversationCtrl,
  listConversationsCtrl,
  listConversationPreferencesCtrl,
  patchConversationPreferencesCtrl,
  getGroupInvitePreviewCtrl,
  getConversationCtrl,
  pinMessageCtrl,
  leaveConversationCtrl,
  promoteToAdminCtrl,
  terminateConversationCtrl,
  addGroupMemberCtrl,
  patchGifsDisabledCtrl,
  patchGifContentFilterCtrl,
} from './controller';

function baseCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  const url = new URL('http://localhost/test');
  return {
    request: new Request(url.href),
    url,
    params: {},
    query: new URLSearchParams(),
    requestId: 'rid',
    locale: 'en',
    errors: {} as RouteContext['errors'],
    identitySession: null,
    ...overrides,
  } as RouteContext;
}

describe('conversation controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCreateConversation.mockClear();
    mockGetConversation.mockClear();
    mockListConversations.mockClear();
    mockCountByConversation.mockClear();
    mockSetMessageCount.mockClear();
    mockFindForIdentity.mockClear();
    mockUpsert.mockClear();
    mockPinMessage.mockClear();
    mockLeaveConversation.mockClear();
    mockCreateConversation.mockImplementation(() =>
      Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
    );
    mockGetConversation.mockImplementation(() =>
      Promise.resolve({ success: true, conversation: { id: VALID_ID } }),
    );
    mockListConversations.mockImplementation(() =>
      Promise.resolve({ conversations: [], cursor: null }),
    );
    mockGetGroupInvitePreview.mockImplementation(() =>
      Promise.resolve({ success: true, preview: {} }),
    );
    mockCountByConversation.mockImplementation(() => Promise.resolve(3));
    mockFindForIdentity.mockImplementation(() => Promise.resolve([]));
    mockUpsert.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        identityId: ROUTE_TEST_IDENTITY_ID,
        conversationId: new ObjectId(VALID_ID),
        archived: false,
        favorited: false,
        keepArchived: false,
        updatedAt: new Date(),
      }),
    );
  });

  test('createConversationCtrl unauthorized', async () => {
    const r = await createConversationCtrl(baseCtx({ body: {} }));
    expect(r).toEqual({ kind: 'unauthorized' });
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  test('createConversationCtrl validation_failed', async () => {
    const r = await createConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        body: { type: 'dm', participants: [] },
      }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('createConversationCtrl passes sanitized participant ids to service', async () => {
    const r = await createConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        body: { type: 'dm', participants: [VALID_PEER] },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockCreateConversation).toHaveBeenCalledWith(
      ROUTE_TEST_IDENTITY_ID,
      'dm',
      [VALID_PEER],
      undefined,
      undefined,
      undefined,
    );
  });

  test('createConversationCtrl maps NOT_FRIENDS', async () => {
    mockCreateConversation.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'NOT_FRIENDS' as const,
        error: 'nope',
      } as never),
    );
    const r = await createConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        body: { type: 'dm', participants: [VALID_PEER] },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'nope' });
  });

  test('listConversationsCtrl success', async () => {
    const r = await listConversationsCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        query: new URLSearchParams({ limit: '10' }),
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockListConversations).toHaveBeenCalledWith(
      ROUTE_TEST_IDENTITY_ID,
      10,
      undefined,
    );
  });

  test('listConversationPreferencesCtrl', async () => {
    const r = await listConversationPreferencesCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockFindForIdentity).toHaveBeenCalledWith(ROUTE_TEST_IDENTITY_ID);
  });

  test('patchConversationPreferencesCtrl invalid conversation id', async () => {
    const r = await patchConversationPreferencesCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: 'bad' },
        body: { archived: true },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid conversation ID.' });
  });

  test('getGroupInvitePreviewCtrl not_found', async () => {
    mockGetGroupInvitePreview.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'INVITE_NOT_FOUND' as const,
      } as never),
    );
    const r = await getGroupInvitePreviewCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
      }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Invite not found.' });
  });

  test('getConversationCtrl lazy-backfills messageCount when absent', async () => {
    const r = await getConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
      }),
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.data).toEqual(
        expect.objectContaining({
          messageCount: 3,
        }),
      );
    }
    expect(mockCountByConversation).toHaveBeenCalledWith(new ObjectId(VALID_ID));
    expect(mockSetMessageCount).toHaveBeenCalledWith(new ObjectId(VALID_ID), 3);
  });

  test('getConversationCtrl skips backfill when messageCount already set', async () => {
    mockGetConversation.mockImplementationOnce(() =>
      Promise.resolve({ success: true, conversation: { id: VALID_ID, messageCount: 42 } }),
    );
    const r = await getConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
      }),
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.data).toEqual(
        expect.objectContaining({
          messageCount: 42,
        }),
      );
    }
    expect(mockCountByConversation).not.toHaveBeenCalled();
    expect(mockSetMessageCount).not.toHaveBeenCalled();
  });

  test('pinMessageCtrl rejects invalid body messageId', async () => {
    const r = await pinMessageCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { messageId: 'zzzzzzzzzzzzzzzzzzzzzzzz' },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid message ID.' });
    expect(mockPinMessage).not.toHaveBeenCalled();
  });

  test('leaveConversationCtrl rejects invalid transferAdminTo', async () => {
    const r = await leaveConversationCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { transferAdminTo: 'zzzzzzzzzzzzzzzzzzzzzzzz' },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid identity ID.' });
  });

  test('promoteToAdminCtrl validation_failed', async () => {
    const r = await promoteToAdminCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: {},
      }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('terminateConversationCtrl unauthorized', async () => {
    const r = await terminateConversationCtrl(baseCtx({ params: { id: VALID_ID } }));
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('addGroupMemberCtrl not_found group', async () => {
    mockAddGroupMember.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'CONVERSATION_NOT_FOUND' as const,
      } as never),
    );
    const r = await addGroupMemberCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { identityId: VALID_PEER },
      }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Group conversation not found.' });
  });

  test('patchGifsDisabledCtrl unauthorized', async () => {
    const r = await patchGifsDisabledCtrl(
      baseCtx({
        params: { id: VALID_ID },
        body: { gifsDisabled: true },
      }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('patchGifContentFilterCtrl unauthorized', async () => {
    const r = await patchGifContentFilterCtrl(
      baseCtx({
        params: { id: VALID_ID },
        body: { gifContentFilter: 'medium' },
      }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('patchGifContentFilterCtrl invalid filter value', async () => {
    const r = await patchGifContentFilterCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { gifContentFilter: 'invalid' },
      }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('patchGifContentFilterCtrl success', async () => {
    const r = await patchGifContentFilterCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { gifContentFilter: 'high' },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockUpdateGifContentFilter).toHaveBeenCalledWith(
      VALID_ID,
      ROUTE_TEST_IDENTITY_ID,
      'high',
    );
  });

  test('patchGifContentFilterCtrl not_found', async () => {
    mockUpdateGifContentFilter.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'CONVERSATION_NOT_FOUND' as const,
      } as never),
    );
    const r = await patchGifContentFilterCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { gifContentFilter: 'low' },
      }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Conversation not found.' });
  });

  test('patchGifContentFilterCtrl not_admin', async () => {
    mockUpdateGifContentFilter.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'NOT_ADMIN' as const,
      } as never),
    );
    const r = await patchGifContentFilterCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_ID },
        body: { gifContentFilter: 'medium' },
      }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
  });
});
