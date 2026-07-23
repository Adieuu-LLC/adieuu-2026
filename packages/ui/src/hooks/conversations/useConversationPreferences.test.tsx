import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';

let fsDefault: boolean | null = null;
const saveConversationFsDefault = mock((_id: string, _v: boolean) => {});
mock.module('../../services/preKeyService', () => ({
  loadConversationFsDefault: () => fsDefault,
  saveConversationFsDefault,
}));

let gifVisibility = 'shown';
const saveConversationGifAnimateOnHoverOverride = mock(() => {});
mock.module('../useGifPreference', () => ({
  useGifPreference: () => [gifVisibility],
  useConversationGifHidden: () => [false, mock(() => {})],
  useEffectiveGifAnimateOnHoverOnly: () => false,
  loadGifAnimateOnHoverOnlyIdentity: () => false,
  saveConversationGifAnimateOnHoverOverride,
}));

const { useConversationPreferences } = await import('./useConversationPreferences');

describe('useConversationPreferences', () => {
  beforeEach(() => {
    fsDefault = null;
    gifVisibility = 'shown';
    saveConversationFsDefault.mockClear();
    saveConversationGifAnimateOnHoverOverride.mockClear();
  });

  test('falls back to the global FS config when no conversation override exists', async () => {
    fsDefault = null;
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: true }),
    );
    expect(result.current.useFs).toBe(true);
    expect(result.current.convFsOverride).toBe(null);
  });

  test('honours a per-conversation FS override', async () => {
    fsDefault = false;
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: true }),
    );
    expect(result.current.useFs).toBe(false);
    expect(result.current.convFsOverride).toBe(false);
  });

  test('toggling the conversation FS default persists and updates state', async () => {
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: false }),
    );
    await act(async () => {
      result.current.handleConvFsToggle(true);
    });
    expect(saveConversationFsDefault).toHaveBeenCalledWith('c1', true);
    expect(result.current.useFs).toBe(true);
    expect(result.current.convFsOverride).toBe(true);
  });

  test('handleToggleFs flips the ephemeral value', async () => {
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: false }),
    );
    await act(async () => {
      result.current.handleToggleFs();
    });
    expect(result.current.useFs).toBe(true);
  });

  test('reflects a globally disabled GIF preference', async () => {
    gifVisibility = 'disabled';
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: false }),
    );
    expect(result.current.gifsGloballyDisabled).toBe(true);
  });

  test('animate-on-hover toggle persists the override', async () => {
    const { result } = await renderHook(() =>
      useConversationPreferences({ conversationId: 'c1', identityId: 'me', fsConfigEnabled: false }),
    );
    await act(async () => {
      result.current.handleGifAnimateOnHoverConversationToggle(true);
    });
    expect(saveConversationGifAnimateOnHoverOverride).toHaveBeenCalledWith('c1', true, false);
  });
});
