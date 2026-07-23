import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';
import '../../test/react-i18next-mock';
import type { DecryptedConversation } from './types';

const toast = { success: mock(() => {}), error: mock(() => {}) };
mock.module('../../components/Toast', () => ({ useToast: () => toast }));

let sessionState: { activeSession: { conversationId: string } | null } = { activeSession: null };
mock.module('../useCallSession', () => ({ useCallSession: () => sessionState }));

const refetch = mock(() => {});
let callState: { activeCall: { id: string } | null; isInCall: boolean; participants: unknown[]; refetch: () => void };
mock.module('../useCall', () => ({ useCall: () => callState }));

let forceEndResult = { success: true };
const forceEndCall = mock(async () => forceEndResult);
mock.module('../../services/callService', () => ({ forceEndCall }));

const { useConversationCallState } = await import('./useConversationCallState');

function conv(overrides?: Partial<DecryptedConversation>): DecryptedConversation {
  return { id: 'c1', type: 'dm', participants: [], admins: [], unreadCount: 0, hasUnread: false, ...overrides } as DecryptedConversation;
}

const params = () => ({ conversationId: 'c1', conversation: conv(), apiClient: {} as never });

describe('useConversationCallState', () => {
  beforeEach(() => {
    sessionState = { activeSession: null };
    callState = { activeCall: null, isInCall: false, participants: [], refetch };
    forceEndResult = { success: true };
    toast.success.mockClear();
    toast.error.mockClear();
    refetch.mockClear();
    forceEndCall.mockClear();
  });

  test('audioAllowed reflects the conversation setting', async () => {
    const { result } = await renderHook(() =>
      useConversationCallState({ conversationId: 'c1', conversation: conv({ audioCallsDisabled: true }), apiClient: {} as never }),
    );
    expect(result.current.audioAllowed).toBe(false);
  });

  test('hasActiveCallToJoin when a call exists and we are not in it', async () => {
    callState = { activeCall: { id: 'call1' }, isInCall: false, participants: [], refetch };
    const { result } = await renderHook(() => useConversationCallState(params()));
    expect(result.current.hasActiveCallToJoin).toBe(true);
    expect(result.current.isGhostParticipant).toBe(false);
    expect(result.current.showCallBanner).toBe(true);
  });

  test('ghost participant when server says in-call but no local session', async () => {
    callState = { activeCall: { id: 'call1' }, isInCall: true, participants: [], refetch };
    const { result } = await renderHook(() => useConversationCallState(params()));
    expect(result.current.isGhostParticipant).toBe(true);
    expect(result.current.hasActiveCallToJoin).toBe(false);
  });

  test('in-call flags track the active session conversation', async () => {
    sessionState = { activeSession: { conversationId: 'other' } };
    const { result } = await renderHook(() => useConversationCallState(params()));
    expect(result.current.isInCallElsewhere).toBe(true);
    expect(result.current.isInCallHere).toBe(false);
  });

  test('force end returns false and toasts when there is no active call', async () => {
    const { result } = await renderHook(() => useConversationCallState(params()));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleForceEndCall();
    });
    expect(outcome).toBe(false);
    expect(forceEndCall).not.toHaveBeenCalled();
  });

  test('force end succeeds, toasts, and refetches', async () => {
    callState = { activeCall: { id: 'call1' }, isInCall: false, participants: [], refetch };
    const { result } = await renderHook(() => useConversationCallState(params()));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleForceEndCall();
    });
    expect(outcome).toBe(true);
    expect(toast.success).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  test('force end failure surfaces an error toast', async () => {
    callState = { activeCall: { id: 'call1' }, isInCall: false, participants: [], refetch };
    forceEndResult = { success: false };
    const { result } = await renderHook(() => useConversationCallState(params()));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleForceEndCall();
    });
    expect(outcome).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
});
