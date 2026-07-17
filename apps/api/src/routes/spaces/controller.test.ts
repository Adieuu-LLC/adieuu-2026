/**
 * Space route controller tests.
 *
 * Controllers are tested directly (input validation + service error mapping)
 * with a mocked Space service, plus a small routes-level smoke suite that
 * exercises auth (401), success (200), not-found (404), and literal-vs-`:id`
 * route ordering through the real router.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type { RouteContext } from '../../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const svc = {
  createSpace: mock(async () => ({ success: true, space: { id: 's1' } })) as AnyMock,
  getSpaceBySlug: mock(async () => ({ success: true, space: { id: 's1' } })) as AnyMock,
  getSpaceById: mock(async () => ({ success: true, space: { id: 's1' } })) as AnyMock,
  updateSpace: mock(async () => ({ success: true, space: { id: 's1' } })) as AnyMock,
  listMySpaces: mock(async () => ({ spaces: [], cursor: null })) as AnyMock,
  discoverSpaces: mock(async () => ({ spaces: [], cursor: null })) as AnyMock,
  isSlugAvailable: mock(async () => true) as AnyMock,
  joinSpace: mock(async () => ({ success: true, member: { id: 'm1' } })) as AnyMock,
  leaveSpace: mock(async () => ({ success: true })) as AnyMock,
  removeSpaceMember: mock(async () => ({ success: true })) as AnyMock,
  listSpaceMembers: mock(async () => ({ success: true, members: [], cursor: null })) as AnyMock,
  listSpaceRoles: mock(async () => ({ success: true, roles: [] })) as AnyMock,
  createSpaceInvite: mock(async () => ({ success: true, invite: { id: 'i1' } })) as AnyMock,
  acceptSpaceInvite: mock(async () => ({ success: true, invite: { id: 'i1' } })) as AnyMock,
  declineSpaceInvite: mock(async () => ({ success: true, invite: { id: 'i1' } })) as AnyMock,
  revokeSpaceInvite: mock(async () => ({ success: true, invite: { id: 'i1' } })) as AnyMock,
  listSpaceInvitesForIdentity: mock(async () => ({ success: true, invites: [], cursor: null })) as AnyMock,
  listPendingInvitesForSpace: mock(async () => ({ success: true, invites: [] })) as AnyMock,
  listSpaceChannels: mock(async () => ({ success: true, channels: [] })) as AnyMock,
  sendSpaceMessage: mock(async () => ({ success: true, message: { id: 'msg1' } })) as AnyMock,
  getSpaceMessages: mock(async () => ({ success: true, messages: [], cursor: null })) as AnyMock,
  editSpaceMessage: mock(async () => ({ success: true, message: { id: 'msg1' } })) as AnyMock,
  deleteSpaceMessage: mock(async () => ({ success: true })) as AnyMock,
  modDeleteSpaceMessage: mock(async () => ({ success: true })) as AnyMock,
  getSpaceMessagesAround: mock(async () => ({ success: true, messages: [], cursor: null })) as AnyMock,
  addSpaceReaction: mock(async () => ({ success: true, reaction: { id: 'r1' } })) as AnyMock,
  removeSpaceReaction: mock(async () => ({ success: true })) as AnyMock,
  getSpaceReactions: mock(async () => ({ success: true, reactions: [] })) as AnyMock,
  pinSpaceMessage: mock(async () => ({ success: true })) as AnyMock,
  unpinSpaceMessage: mock(async () => ({ success: true })) as AnyMock,
  getSpacePinnedMessages: mock(async () => ({ success: true, messages: [], cursor: null })) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../services/space.service', () => svc);

import * as c from './controller';
import * as mc from './message-controller';
import { spaceRoutes } from './index';

const HEX = new ObjectId().toHexString();

function makeCtx(opts: {
  session?: boolean;
  body?: unknown;
  params?: Record<string, string>;
  query?: string;
} = {}): RouteContext {
  const session =
    opts.session === false
      ? null
      : {
          identity: { _id: ROUTE_TEST_IDENTITY_ID },
          sessionId: 'test',
          maxVideoDurationSeconds: 300,
          subscriptions: ['access'],
          entitlements: [],
          isLifetime: false,
        };
  return {
    request: new Request('http://localhost/'),
    url: new URL('http://localhost/'),
    params: opts.params ?? {},
    query: new URLSearchParams(opts.query ?? ''),
    requestId: 'req',
    body: opts.body,
    locale: 'en',
    errors: {} as never,
    identitySession: session as never,
  } as RouteContext;
}

describe('space controllers - auth', () => {
  beforeEach(() => {
    for (const fn of Object.values(svc)) (fn as AnyMock).mockClear();
  });

  test('every controller returns unauthorized without a session', async () => {
    expect(await c.createSpaceCtrl(makeCtx({ session: false }))).toEqual({ kind: 'unauthorized' });
    expect(await c.listMySpacesCtrl(makeCtx({ session: false }))).toEqual({ kind: 'unauthorized' });
    expect(await c.discoverSpacesCtrl(makeCtx({ session: false }))).toEqual({ kind: 'unauthorized' });
    expect(await c.getSpaceCtrl(makeCtx({ session: false }))).toEqual({ kind: 'unauthorized' });
    expect(await mc.sendMessageCtrl(makeCtx({ session: false }))).toEqual({ kind: 'unauthorized' });
  });
});

describe('createSpaceCtrl', () => {
  beforeEach(() => {
    svc.createSpace.mockClear();
    svc.createSpace.mockResolvedValue({ success: true, space: { id: 's1' } });
  });

  test('validation_failed on malformed body', async () => {
    const r = await c.createSpaceCtrl(makeCtx({ body: { slug: 'x' } }));
    expect(r).toEqual({ kind: 'validation_failed' });
    expect(svc.createSpace).not.toHaveBeenCalled();
  });

  test('maps TIER_REQUIRED to forbidden', async () => {
    svc.createSpace.mockResolvedValueOnce({
      success: false, errorCode: 'TIER_REQUIRED', error: 'pay up',
    });
    const r = await c.createSpaceCtrl(
      makeCtx({ body: { slug: 'my-space', name: 'My Space', visibility: 'public' } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'pay up' });
  });

  test('maps SLUG_TAKEN to a 409 conflict result', async () => {
    svc.createSpace.mockResolvedValueOnce({
      success: false, errorCode: 'SLUG_TAKEN', error: 'taken',
    });
    const r = await c.createSpaceCtrl(
      makeCtx({ body: { slug: 'my-space', name: 'My Space', visibility: 'public' } }),
    );
    expect(r).toEqual({ kind: 'conflict', code: 'SLUG_TAKEN', message: 'taken' });
  });

  test('returns ok with the created space and forwards billing', async () => {
    const r = await c.createSpaceCtrl(
      makeCtx({ body: { slug: 'my-space', name: 'My Space', visibility: 'listed' } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 's1' } });
    const [creator, params, billing] = svc.createSpace.mock.calls[0]!;
    expect(creator).toBe(ROUTE_TEST_IDENTITY_ID);
    expect(params).toMatchObject({ slug: 'my-space', name: 'My Space', visibility: 'listed' });
    expect(billing).toEqual({ subscriptions: ['access'], entitlements: [], isLifetime: false });
  });
});

describe('checkSlugAvailabilityCtrl', () => {
  beforeEach(() => {
    svc.isSlugAvailable.mockClear();
    svc.isSlugAvailable.mockResolvedValue(true);
  });

  test('returns available:false for an invalid slug without hitting the service', async () => {
    const r = await c.checkSlugAvailabilityCtrl(makeCtx({ params: { slug: 'A' } }));
    expect(r).toEqual({ kind: 'ok', data: { available: false } });
    expect(svc.isSlugAvailable).not.toHaveBeenCalled();
  });

  test('delegates to the service for a valid slug', async () => {
    const r = await c.checkSlugAvailabilityCtrl(makeCtx({ params: { slug: 'good-slug' } }));
    expect(r).toEqual({ kind: 'ok', data: { available: true } });
    expect(svc.isSlugAvailable).toHaveBeenCalledWith('good-slug');
  });
});

describe('getSpaceBySlugCtrl / getSpaceCtrl', () => {
  beforeEach(() => {
    svc.getSpaceBySlug.mockClear();
    svc.getSpaceById.mockClear();
    svc.getSpaceBySlug.mockResolvedValue({ success: true, space: { id: 's1' } });
    svc.getSpaceById.mockResolvedValue({ success: true, space: { id: 's1' } });
  });

  test('by-slug maps SPACE_NOT_FOUND to not_found', async () => {
    svc.getSpaceBySlug.mockResolvedValueOnce({
      success: false, errorCode: 'SPACE_NOT_FOUND', error: 'nope',
    });
    const r = await c.getSpaceBySlugCtrl(makeCtx({ params: { slug: 'ghost' } }));
    expect(r).toEqual({ kind: 'not_found', message: 'nope' });
  });

  test('by-id returns not_found for a malformed id', async () => {
    const r = await c.getSpaceCtrl(makeCtx({ params: { id: 'bad' } }));
    expect(r).toEqual({ kind: 'not_found', message: 'Space not found.' });
    expect(svc.getSpaceById).not.toHaveBeenCalled();
  });

  test('by-id returns ok', async () => {
    const r = await c.getSpaceCtrl(makeCtx({ params: { id: HEX } }));
    expect(r).toMatchObject({ kind: 'ok', data: { id: 's1' } });
  });
});

describe('updateSpaceCtrl', () => {
  beforeEach(() => {
    svc.updateSpace.mockClear();
    svc.updateSpace.mockResolvedValue({ success: true, space: { id: 's1' } });
  });

  test('validation_failed for an empty patch', async () => {
    const r = await c.updateSpaceCtrl(makeCtx({ params: { id: HEX }, body: {} }));
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('maps FORBIDDEN to forbidden', async () => {
    svc.updateSpace.mockResolvedValueOnce({ success: false, errorCode: 'FORBIDDEN', error: 'no' });
    const r = await c.updateSpaceCtrl(makeCtx({ params: { id: HEX }, body: { name: 'New' } }));
    expect(r).toEqual({ kind: 'forbidden', message: 'no' });
  });

  test('returns ok on success', async () => {
    const r = await c.updateSpaceCtrl(
      makeCtx({ params: { id: HEX }, body: { name: 'New', allowFreeMembers: true } }),
    );
    expect(r).toMatchObject({ kind: 'ok' });
    const [, , updates] = svc.updateSpace.mock.calls[0]!;
    expect(updates).toMatchObject({ name: 'New', allowFreeMembers: true });
  });
});

describe('membership controllers', () => {
  beforeEach(() => {
    svc.joinSpace.mockClear();
    svc.leaveSpace.mockClear();
    svc.removeSpaceMember.mockClear();
    svc.joinSpace.mockResolvedValue({ success: true, member: { id: 'm1' } });
    svc.leaveSpace.mockResolvedValue({ success: true });
    svc.removeSpaceMember.mockResolvedValue({ success: true });
  });

  test('join maps TIER_REQUIRED to forbidden', async () => {
    svc.joinSpace.mockResolvedValueOnce({ success: false, errorCode: 'TIER_REQUIRED', error: 'pay' });
    const r = await c.joinSpaceCtrl(makeCtx({ params: { id: HEX } }));
    expect(r).toEqual({ kind: 'forbidden', message: 'pay' });
  });

  test('join returns the membership', async () => {
    const r = await c.joinSpaceCtrl(makeCtx({ params: { id: HEX } }));
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'm1' } });
  });

  test('leave maps OWNER_CANNOT_LEAVE to forbidden', async () => {
    svc.leaveSpace.mockResolvedValueOnce({
      success: false, errorCode: 'OWNER_CANNOT_LEAVE', error: 'owner',
    });
    const r = await c.leaveSpaceCtrl(makeCtx({ params: { id: HEX } }));
    expect(r).toEqual({ kind: 'forbidden', message: 'owner' });
  });

  test('removeMember rejects an invalid target id', async () => {
    const r = await c.removeMemberCtrl(makeCtx({ params: { id: HEX, identityId: 'bad' } }));
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid id.' });
    expect(svc.removeSpaceMember).not.toHaveBeenCalled();
  });
});

describe('messaging controllers', () => {
  beforeEach(() => {
    svc.sendSpaceMessage.mockClear();
    svc.getSpaceMessages.mockClear();
    svc.sendSpaceMessage.mockResolvedValue({ success: true, message: { id: 'msg1' } });
    svc.getSpaceMessages.mockResolvedValue({ success: true, messages: [], cursor: null });
  });

  test('send validation_failed for a missing clientMessageId', async () => {
    const r = await mc.sendMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: HEX }, body: { content: 'hi' } }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
    expect(svc.sendSpaceMessage).not.toHaveBeenCalled();
  });

  test('send maps the E2EE cipher-guard to a 409 conflict', async () => {
    svc.sendSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'ENCRYPTION_NOT_SUPPORTED', error: 'encrypted',
    });
    const r = await mc.sendMessageCtrl(
      makeCtx({
        params: { id: HEX, channelId: HEX },
        body: { content: 'hi', clientMessageId: crypto.randomUUID() },
      }),
    );
    expect(r).toEqual({ kind: 'conflict', code: 'ENCRYPTION_NOT_SUPPORTED', message: 'encrypted' });
  });

  test('send returns the created message', async () => {
    const r = await mc.sendMessageCtrl(
      makeCtx({
        params: { id: HEX, channelId: HEX },
        body: { content: 'hi', clientMessageId: crypto.randomUUID() },
      }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'msg1' } });
  });

  test('getMessages returns the list shape', async () => {
    const r = await mc.getMessagesCtrl(makeCtx({ params: { id: HEX, channelId: HEX } }));
    expect(r).toMatchObject({ kind: 'ok', data: { messages: [], cursor: null } });
  });
});

describe('invite controllers', () => {
  beforeEach(() => {
    svc.acceptSpaceInvite.mockClear();
    svc.createSpaceInvite.mockClear();
    svc.acceptSpaceInvite.mockResolvedValue({ success: true, invite: { id: 'i1' } });
    svc.createSpaceInvite.mockResolvedValue({ success: true, invite: { id: 'i1' } });
  });

  test('accept maps NOT_AUTHORIZED to forbidden', async () => {
    svc.acceptSpaceInvite.mockResolvedValueOnce({
      success: false, errorCode: 'NOT_AUTHORIZED', error: 'not yours',
    });
    const r = await c.acceptInviteCtrl(makeCtx({ params: { inviteId: HEX } }));
    expect(r).toEqual({ kind: 'forbidden', message: 'not yours' });
  });

  test('create maps CANNOT_INVITE_SELF to bad_request', async () => {
    svc.createSpaceInvite.mockResolvedValueOnce({
      success: false, errorCode: 'CANNOT_INVITE_SELF', error: 'self',
    });
    const r = await c.createInviteCtrl(
      makeCtx({ params: { id: HEX }, body: { identityId: new ObjectId().toHexString() } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'self' });
  });

  test('create returns the invite on success', async () => {
    const r = await c.createInviteCtrl(
      makeCtx({ params: { id: HEX }, body: { identityId: new ObjectId().toHexString() } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'i1' } });
  });
});

// ---------------------------------------------------------------------------
// Message interaction controllers
// ---------------------------------------------------------------------------

const CHID = new ObjectId().toHexString();
const MSGID = new ObjectId().toHexString();

describe('editMessageCtrl', () => {
  beforeEach(() => {
    svc.editSpaceMessage.mockClear();
    svc.editSpaceMessage.mockResolvedValue({ success: true, message: { id: 'msg1' } });
  });

  test('returns unauthorized without a session', async () => {
    const r = await mc.editMessageCtrl(makeCtx({ session: false }));
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('returns bad_request for invalid id', async () => {
    const r = await mc.editMessageCtrl(
      makeCtx({ params: { id: 'bad', channelId: CHID, msgId: MSGID }, body: { content: 'hi' } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid id.' });
  });

  test('returns validation_failed for missing content', async () => {
    const r = await mc.editMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: {} }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('maps NOT_AUTHOR to forbidden', async () => {
    svc.editSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'NOT_AUTHOR', error: 'not yours',
    });
    const r = await mc.editMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: { content: 'hi' } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'not yours' });
  });

  test('maps MAX_EDITS_REACHED to bad_request', async () => {
    svc.editSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'MAX_EDITS_REACHED', error: 'max edits',
    });
    const r = await mc.editMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: { content: 'hi' } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'max edits' });
  });

  test('returns ok on success', async () => {
    const r = await mc.editMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: { content: 'hi' } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'msg1' } });
  });
});

describe('deleteMessageCtrl', () => {
  beforeEach(() => {
    svc.deleteSpaceMessage.mockClear();
    svc.deleteSpaceMessage.mockResolvedValue({ success: true });
  });

  test('returns unauthorized without a session', async () => {
    const r = await mc.deleteMessageCtrl(makeCtx({ session: false }));
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('maps NOT_AUTHOR to forbidden', async () => {
    svc.deleteSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'NOT_AUTHOR', error: 'not yours',
    });
    const r = await mc.deleteMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'not yours' });
  });

  test('returns ok on success', async () => {
    const r = await mc.deleteMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: undefined });
  });
});

describe('modDeleteMessageCtrl', () => {
  beforeEach(() => {
    svc.modDeleteSpaceMessage.mockClear();
    svc.modDeleteSpaceMessage.mockResolvedValue({ success: true });
  });

  test('maps FORBIDDEN to forbidden', async () => {
    svc.modDeleteSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'FORBIDDEN', error: 'not mod',
    });
    const r = await mc.modDeleteMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'not mod' });
  });

  test('returns ok on success', async () => {
    const r = await mc.modDeleteMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: undefined });
  });
});

describe('messagesAroundCtrl', () => {
  beforeEach(() => {
    svc.getSpaceMessagesAround.mockClear();
    svc.getSpaceMessagesAround.mockResolvedValue({ success: true, messages: [], cursor: null });
  });

  test('returns ok with messages list', async () => {
    const r = await mc.messagesAroundCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { messages: [], cursor: null } });
  });

  test('maps MESSAGE_NOT_FOUND to not_found', async () => {
    svc.getSpaceMessagesAround.mockResolvedValueOnce({
      success: false, errorCode: 'MESSAGE_NOT_FOUND', error: 'not found',
    });
    const r = await mc.messagesAroundCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'not found' });
  });
});

// ---------------------------------------------------------------------------
// Reaction controllers
// ---------------------------------------------------------------------------

describe('addReactionCtrl', () => {
  beforeEach(() => {
    svc.addSpaceReaction.mockClear();
    svc.addSpaceReaction.mockResolvedValue({ success: true, reaction: { id: 'r1' } });
  });

  test('returns unauthorized without a session', async () => {
    const r = await mc.addReactionCtrl(makeCtx({ session: false }));
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('returns validation_failed for missing emoji', async () => {
    const r = await mc.addReactionCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: {} }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('maps REACTION_EXISTS to conflict', async () => {
    svc.addSpaceReaction.mockResolvedValueOnce({
      success: false, errorCode: 'REACTION_EXISTS', error: 'already reacted',
    });
    const r = await mc.addReactionCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: { emoji: '👍' } }),
    );
    expect(r).toEqual({ kind: 'conflict', code: 'REACTION_EXISTS', message: 'already reacted' });
  });

  test('returns ok on success', async () => {
    const r = await mc.addReactionCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID }, body: { emoji: '👍' } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'r1' } });
  });
});

describe('removeReactionCtrl', () => {
  beforeEach(() => {
    svc.removeSpaceReaction.mockClear();
    svc.removeSpaceReaction.mockResolvedValue({ success: true });
  });

  test('maps REACTION_NOT_FOUND to not_found', async () => {
    svc.removeSpaceReaction.mockResolvedValueOnce({
      success: false, errorCode: 'REACTION_NOT_FOUND', error: 'not found',
    });
    const r = await mc.removeReactionCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID, reactionId: HEX } }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'not found' });
  });

  test('returns ok on success', async () => {
    const r = await mc.removeReactionCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID, reactionId: HEX } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: undefined });
  });
});

describe('getReactionsCtrl', () => {
  beforeEach(() => {
    svc.getSpaceReactions.mockClear();
    svc.getSpaceReactions.mockResolvedValue({ success: true, reactions: [] });
  });

  test('returns ok with reactions list', async () => {
    const r = await mc.getReactionsCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { reactions: [] } });
  });
});

// ---------------------------------------------------------------------------
// Pin controllers
// ---------------------------------------------------------------------------

describe('pinMessageCtrl', () => {
  beforeEach(() => {
    svc.pinSpaceMessage.mockClear();
    svc.pinSpaceMessage.mockResolvedValue({ success: true });
  });

  test('returns unauthorized without a session', async () => {
    const r = await mc.pinMessageCtrl(makeCtx({ session: false }));
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('returns validation_failed for missing messageId', async () => {
    const r = await mc.pinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID }, body: {} }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
  });

  test('maps ALREADY_PINNED to conflict', async () => {
    svc.pinSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'ALREADY_PINNED', error: 'already pinned',
    });
    const r = await mc.pinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID }, body: { messageId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'conflict', code: 'ALREADY_PINNED', message: 'already pinned' });
  });

  test('maps FORBIDDEN to forbidden', async () => {
    svc.pinSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'FORBIDDEN', error: 'mod required',
    });
    const r = await mc.pinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID }, body: { messageId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'mod required' });
  });

  test('returns ok on success', async () => {
    const r = await mc.pinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID }, body: { messageId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: undefined });
  });
});

describe('unpinMessageCtrl', () => {
  beforeEach(() => {
    svc.unpinSpaceMessage.mockClear();
    svc.unpinSpaceMessage.mockResolvedValue({ success: true });
  });

  test('maps PIN_NOT_FOUND to not_found', async () => {
    svc.unpinSpaceMessage.mockResolvedValueOnce({
      success: false, errorCode: 'PIN_NOT_FOUND', error: 'no pin',
    });
    const r = await mc.unpinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'no pin' });
  });

  test('returns ok on success', async () => {
    const r = await mc.unpinMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: undefined });
  });
});

describe('getPinnedMessagesCtrl', () => {
  beforeEach(() => {
    svc.getSpacePinnedMessages.mockClear();
    svc.getSpacePinnedMessages.mockResolvedValue({ success: true, messages: [], cursor: null });
  });

  test('returns ok with pinned messages', async () => {
    const r = await mc.getPinnedMessagesCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { messages: [], cursor: null } });
  });
});

// ---------------------------------------------------------------------------
// Routes smoke tests (through the real router + a test identity middleware)
// ---------------------------------------------------------------------------

spaceRoutes.use(testIdentityEnrichment(ROUTE_TEST_IDENTITY_ID));

function makeRequest(path: string, opts: { method?: string; cookies?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cookies) headers['Cookie'] = opts.cookies;
  return new Request(`http://localhost${path}`, { method: opts.method ?? 'GET', headers });
}

describe('spaces routes smoke', () => {
  beforeEach(() => {
    for (const fn of Object.values(svc)) (fn as AnyMock).mockClear();
    svc.listMySpaces.mockResolvedValue({ spaces: [], cursor: null });
    svc.discoverSpaces.mockResolvedValue({ spaces: [], cursor: null });
    svc.getSpaceById.mockResolvedValue({ success: true, space: { id: 's1' } });
  });

  test('GET /spaces returns 401 without a session', async () => {
    const res = await spaceRoutes.handler()(makeRequest('/spaces'));
    expect(res.status).toBe(401);
  });

  test('GET /spaces returns 200 with a session', async () => {
    const res = await spaceRoutes.handler()(
      makeRequest('/spaces', { cookies: 'adieuu_session=session' }),
    );
    expect(res.status).toBe(200);
    expect(svc.listMySpaces).toHaveBeenCalled();
  });

  test('GET /spaces/discover resolves to discover, not the :id route', async () => {
    const res = await spaceRoutes.handler()(
      makeRequest('/spaces/discover', { cookies: 'adieuu_session=session' }),
    );
    expect(res.status).toBe(200);
    expect(svc.discoverSpaces).toHaveBeenCalled();
    expect(svc.getSpaceById).not.toHaveBeenCalled();
  });

  test('unknown method/path returns 404', async () => {
    const res = await spaceRoutes.handler()(
      makeRequest('/spaces/nope/nope/nope', { cookies: 'adieuu_session=session' }),
    );
    expect(res.status).toBe(404);
  });
});

afterAll(() => mock.restore());
