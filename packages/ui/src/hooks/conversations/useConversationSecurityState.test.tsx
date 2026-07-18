import { describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';
import { useConversationSecurityState } from './useConversationSecurityState';
import type { DecryptedConversation } from './types';

function makeConversation(id: string, participants: string[]): DecryptedConversation {
  return {
    id,
    type: 'group',
    participants,
    admins: [],
    unreadCount: 0,
    hasUnread: false,
  } as DecryptedConversation;
}

/** Stable identity API so the peer-key effect deps don't change every render. */
function makeIdentityApi() {
  return {
    getPublicKeys: mock(async (pid: string) => ({ success: true, data: { identityId: pid } })),
  } as unknown as Parameters<typeof useConversationSecurityState>[0]['identityApi'];
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useConversationSecurityState', () => {
  test('loads peer public keys for each participant', async () => {
    const identityApi = makeIdentityApi();
    const conversation = makeConversation('c1', ['p1', 'p2']);
    const { result } = await renderHook(() =>
      useConversationSecurityState({ conversationId: 'c1', conversation, identityApi }),
    );
    await flush();
    expect(Object.keys(result.current.peerPublicKeysById).sort()).toEqual(['p1', 'p2']);
  });

  test('handleDeviceTrustMismatch records ids without duplicates', async () => {
    const identityApi = makeIdentityApi();
    const conversation = makeConversation('c1', []);
    const { result } = await renderHook(() =>
      useConversationSecurityState({ conversationId: 'c1', conversation, identityApi }),
    );
    await act(async () => {
      result.current.handleDeviceTrustMismatch('p1');
      result.current.handleDeviceTrustMismatch('p1');
      result.current.handleDeviceTrustMismatch('p2');
    });
    expect(result.current.keyChangeAlertIdentityIds).toEqual(['p1', 'p2']);
  });

  test('bumpVerificationRevision increments and openMemberSecurity sets the modal', async () => {
    const identityApi = makeIdentityApi();
    const conversation = makeConversation('c1', []);
    const { result } = await renderHook(() =>
      useConversationSecurityState({ conversationId: 'c1', conversation, identityApi }),
    );
    await act(async () => {
      result.current.bumpVerificationRevision();
      result.current.openMemberSecurity('p9', 'Nine');
    });
    expect(result.current.verificationRevision).toBe(1);
    expect(result.current.memberSecurityModal).toEqual({ id: 'p9', label: 'Nine' });
  });

  test('clears the key-change alert when switching conversations', async () => {
    const identityApi = makeIdentityApi();
    const conversationC1 = makeConversation('c1', ['p1']);
    const conversationC2 = makeConversation('c2', ['p1']);
    const { result, rerender } = await renderHook(
      (props: { conversationId: string; conversation: DecryptedConversation }) =>
        useConversationSecurityState({
          conversationId: props.conversationId,
          conversation: props.conversation,
          identityApi,
        }),
      { initialProps: { conversationId: 'c1', conversation: conversationC1 } },
    );
    await flush();
    await act(async () => {
      result.current.handleDeviceTrustMismatch('p1');
    });
    expect(result.current.keyChangeAlertIdentityIds).toEqual(['p1']);

    await rerender({ conversationId: 'c2', conversation: conversationC2 });
    expect(result.current.keyChangeAlertIdentityIds).toEqual([]);
  });
});
