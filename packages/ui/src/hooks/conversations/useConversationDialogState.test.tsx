import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderHook, act, installDom } from '../../test/renderHook';
import type { DecryptedConversation } from './types';

const isDomainTrusted = mock((_domain: string) => false);
mock.module('../../hooks/useExternalLinkPreferences', () => ({ isDomainTrusted }));

const { useConversationDialogState } = await import('./useConversationDialogState');

function makeConversation(overrides?: Partial<DecryptedConversation>): DecryptedConversation {
  return {
    id: 'c1',
    type: 'group',
    participants: ['me', 'other'],
    admins: ['me'],
    unreadCount: 0,
    hasUnread: false,
    ...overrides,
  } as DecryptedConversation;
}

function makeParams(overrides?: Partial<Parameters<typeof useConversationDialogState>[0]>) {
  return {
    conversationId: 'c1',
    conversation: makeConversation(),
    identityId: 'me',
    navigate: mock(() => {}),
    memberSettings: {},
    leaveGroup: mock(async () => true),
    terminateGroup: mock(async () => true),
    promoteToAdmin: mock(async () => true),
    removeMember: mock(async () => true),
    renameGroup: mock(async () => true),
    updateMemberSettings: mock(async () => true),
    ...overrides,
  };
}

describe('useConversationDialogState', () => {
  beforeEach(() => {
    isDomainTrusted.mockReset();
    isDomainTrusted.mockReturnValue(false);
  });

  test('sole admin with other members opens the admin-transfer dialog', async () => {
    const { result } = await renderHook(() => useConversationDialogState(makeParams()));
    await act(async () => {
      result.current.handleLeaveClick();
    });
    expect(result.current.adminTransferOpen).toBe(true);
    expect(result.current.leaveConfirmOpen).toBe(false);
  });

  test('non-admin opens the plain leave-confirm dialog', async () => {
    const params = makeParams({ conversation: makeConversation({ admins: ['other'] }) });
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      result.current.handleLeaveClick();
    });
    expect(result.current.leaveConfirmOpen).toBe(true);
    expect(result.current.adminTransferOpen).toBe(false);
  });

  test('leave confirm navigates home on success', async () => {
    const params = makeParams({ leaveGroup: mock(async () => true) });
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      await result.current.handleLeaveConfirm();
    });
    expect(params.leaveGroup).toHaveBeenCalledWith('c1');
    expect(params.navigate).toHaveBeenCalledWith('/');
    expect(result.current.leaveConfirmOpen).toBe(false);
  });

  test('delete does not navigate when termination fails', async () => {
    const params = makeParams({ terminateGroup: mock(async () => false) });
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      await result.current.handleDeleteGroup();
    });
    expect(params.navigate).not.toHaveBeenCalled();
    expect(result.current.deleteGroupOpen).toBe(false);
  });

  test('saveMemberEdit merges nickname and color, then closes the editor', async () => {
    const params = makeParams({ memberSettings: { keep: { nickname: 'k' } } });
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      result.current.setEditingMemberId('other');
    });
    await act(async () => {
      await result.current.saveMemberEdit('other', ' Bob ', '#fff');
    });
    expect(params.updateMemberSettings).toHaveBeenCalledWith('c1', {
      keep: { nickname: 'k' },
      other: { nickname: 'Bob', color: '#fff' },
    });
    expect(result.current.editingMemberId).toBe(null);
  });

  test('saveMemberEdit removes the entry when cleared', async () => {
    const params = makeParams({ memberSettings: { other: { nickname: 'x' } } });
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      await result.current.saveMemberEdit('other', '   ', undefined);
    });
    expect(params.updateMemberSettings).toHaveBeenCalledWith('c1', {});
  });

  test('rename is a no-op for blank input', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      result.current.setRenameValue('   ');
    });
    await act(async () => {
      await result.current.handleRename();
    });
    expect(params.renameGroup).not.toHaveBeenCalled();
  });

  test('link click opens trusted domains and defers untrusted ones', async () => {
    installDom();
    const openSpy = mock(() => null);
    (globalThis as unknown as { window: { open: unknown } }).window.open = openSpy;

    isDomainTrusted.mockReturnValue(true);
    const params = makeParams();
    const { result } = await renderHook(() => useConversationDialogState(params));
    await act(async () => {
      result.current.handleLinkClick('https://trusted.example/x');
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(result.current.pendingLinkHref).toBe(null);

    isDomainTrusted.mockReturnValue(false);
    await act(async () => {
      result.current.handleLinkClick('https://danger.example/y');
    });
    expect(result.current.pendingLinkHref).toBe('https://danger.example/y');
  });
});
