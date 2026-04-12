import { describe, expect, test } from 'bun:test';
import type { FriendInfo } from '@adieuu/shared';
import {
  compareInviteMemberRows,
  inviteMemberRowState,
  mergeFriendInfosById,
} from './inviteMemberModalUtils';

function fi(id: string, name: string): FriendInfo {
  const epoch = new Date(0).toISOString();
  return {
    identity: {
      id,
      username: name.toLowerCase().replace(/\s/g, ''),
      displayName: name,
      createdAt: epoch,
      lastActiveAt: epoch,
      isDeleted: false,
    },
    friendsSince: epoch,
  };
}

describe('inviteMemberModalUtils', () => {
  test('mergeFriendInfosById keeps first occurrence', () => {
    const a = fi('1', 'Alice');
    const b = fi('1', 'Alice Other');
    const m = mergeFriendInfosById([[a], [b]]);
    expect(m).toHaveLength(1);
    expect(m[0]!.identity.displayName).toBe('Alice');
  });

  test('inviteMemberRowState prioritises member over invited', () => {
    const pid = 'p1';
    expect(
      inviteMemberRowState(pid, new Set([pid]), new Set([pid]))
    ).toBe('member');
  });

  test('inviteMemberRowState returns invited when pending only', () => {
    const pid = 'p1';
    expect(inviteMemberRowState(pid, new Set(), new Set([pid]))).toBe('invited');
  });

  test('compareInviteMemberRows sorts invited before member before inviteable', () => {
    const rows = [
      { identityId: 'a', state: 'inviteable' as const, displayName: 'Zed' },
      { identityId: 'b', state: 'invited' as const, displayName: 'Amy' },
      { identityId: 'c', state: 'member' as const, displayName: 'Bob' },
    ];
    rows.sort(compareInviteMemberRows);
    expect(rows.map((r) => r.identityId)).toEqual(['b', 'c', 'a']);
  });
});
