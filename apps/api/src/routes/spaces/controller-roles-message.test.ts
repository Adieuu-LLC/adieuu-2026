/**
 * Focused controller tests for getMessageCtrl and Space role handlers.
 * Keeps role/message coverage out of the large controller.test.ts suite.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';
import type { RouteContext } from '../../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const svc = {
  getSpaceMessage: mock(async () => ({ success: true, message: { id: 'msg1' } })) as AnyMock,
  createSpaceRole: mock(async () => ({ success: true, role: { id: 'r1' } })) as AnyMock,
  updateSpaceRole: mock(async () => ({ success: true, role: { id: 'r1' } })) as AnyMock,
  deleteSpaceRole: mock(async () => ({ success: true })) as AnyMock,
  setMemberRoles: mock(async () => ({ success: true, member: { id: 'm1' } })) as AnyMock,
  listRoleMembers: mock(async () => ({ success: true, members: [], cursor: null })) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../services/space.service', () => svc);

import * as lifecycleC from './controller';
import * as memberC from './member-controller';
import * as inviteC from './invite-controller';
import * as mc from './message-controller';

const c = { ...lifecycleC, ...memberC, ...inviteC };

const HEX = new ObjectId().toHexString();
const ROLE = new ObjectId().toHexString();
const CHID = new ObjectId().toHexString();
const MSGID = new ObjectId().toHexString();
const TARGET = new ObjectId().toHexString();

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

describe('getMessageCtrl', () => {
  beforeEach(() => {
    svc.getSpaceMessage.mockClear();
    svc.getSpaceMessage.mockResolvedValue({ success: true, message: { id: 'msg1' } });
  });

  test('returns unauthorized without a session', async () => {
    expect(
      await mc.getMessageCtrl(
        makeCtx({ session: false, params: { id: HEX, channelId: CHID, msgId: MSGID } }),
      ),
    ).toEqual({ kind: 'unauthorized' });
  });

  test('rejects invalid ids', async () => {
    const r = await mc.getMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: 'bad', msgId: MSGID } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid id.' });
    expect(svc.getSpaceMessage).not.toHaveBeenCalled();
  });

  test('returns the message on success', async () => {
    const r = await mc.getMessageCtrl(
      makeCtx({ params: { id: HEX, channelId: CHID, msgId: MSGID } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { id: 'msg1' } });
    expect(svc.getSpaceMessage).toHaveBeenCalled();
  });
});

describe('role controllers', () => {
  beforeEach(() => {
    for (const fn of Object.values(svc)) (fn as AnyMock).mockClear();
    svc.createSpaceRole.mockResolvedValue({ success: true, role: { id: 'r1' } });
    svc.updateSpaceRole.mockResolvedValue({ success: true, role: { id: 'r1' } });
    svc.deleteSpaceRole.mockResolvedValue({ success: true });
    svc.setMemberRoles.mockResolvedValue({ success: true, member: { id: 'm1' } });
    svc.listRoleMembers.mockResolvedValue({ success: true, members: [], cursor: null });
  });

  test('createRoleCtrl rejects malformed body', async () => {
    const r = await c.createRoleCtrl(
      makeCtx({ params: { id: HEX }, body: { color: 'not-a-hex' } }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
    expect(svc.createSpaceRole).not.toHaveBeenCalled();
  });

  test('createRoleCtrl returns the created role', async () => {
    const r = await c.createRoleCtrl(
      makeCtx({
        params: { id: HEX },
        body: { name: 'Mods', color: '#112233', permissions: ['viewChannels'] },
      }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { role: { id: 'r1' } } });
    expect(svc.createSpaceRole).toHaveBeenCalled();
  });

  test('updateRoleCtrl rejects invalid role id', async () => {
    const r = await c.updateRoleCtrl(
      makeCtx({ params: { id: HEX, roleId: 'bad' }, body: { name: 'X' } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid id.' });
    expect(svc.updateSpaceRole).not.toHaveBeenCalled();
  });

  test('updateRoleCtrl returns the updated role', async () => {
    const r = await c.updateRoleCtrl(
      makeCtx({ params: { id: HEX, roleId: ROLE }, body: { name: 'Renamed' } }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { role: { id: 'r1' } } });
    expect(svc.updateSpaceRole).toHaveBeenCalled();
  });

  test('deleteRoleCtrl returns ok on success', async () => {
    const r = await c.deleteRoleCtrl(makeCtx({ params: { id: HEX, roleId: ROLE } }));
    expect(r).toMatchObject({ kind: 'ok' });
    expect(svc.deleteSpaceRole).toHaveBeenCalled();
  });

  test('listRoleMembersCtrl returns the list shape', async () => {
    const r = await c.listRoleMembersCtrl(makeCtx({ params: { id: HEX, roleId: ROLE } }));
    expect(r).toMatchObject({ kind: 'ok', data: { members: [], cursor: null } });
    expect(svc.listRoleMembers).toHaveBeenCalled();
  });

  test('setMemberRolesCtrl rejects malformed body', async () => {
    const r = await c.setMemberRolesCtrl(
      makeCtx({ params: { id: HEX, identityId: TARGET }, body: {} }),
    );
    expect(r).toEqual({ kind: 'validation_failed' });
    expect(svc.setMemberRoles).not.toHaveBeenCalled();
  });

  test('setMemberRolesCtrl returns the member on success', async () => {
    const r = await c.setMemberRolesCtrl(
      makeCtx({
        params: { id: HEX, identityId: TARGET },
        body: { roleIds: [ROLE] },
      }),
    );
    expect(r).toMatchObject({ kind: 'ok', data: { member: { id: 'm1' } } });
    expect(svc.setMemberRoles).toHaveBeenCalled();
  });
});
