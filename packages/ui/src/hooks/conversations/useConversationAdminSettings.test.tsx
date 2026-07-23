import { describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';
import { useConversationAdminSettings } from './useConversationAdminSettings';

function makeParams(overrides?: Partial<Parameters<typeof useConversationAdminSettings>[0]>) {
  return {
    conversationId: 'c1',
    updateGifsDisabled: mock(async () => true),
    updateGifContentFilter: mock(async () => true),
    updateCustomEmojisDisabled: mock(async () => true),
    updateMessageSearchCachePolicy: mock(async () => true),
    updateAllowSkipModeration: mock(async () => true),
    updateCallSettings: mock(async () => true),
    ...overrides,
  };
}

describe('useConversationAdminSettings', () => {
  test('each toggle forwards (id, value) to its mutation', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useConversationAdminSettings(params));

    await act(async () => {
      await result.current.handleGifsDisabledByAdminToggle(true);
      await result.current.handleGifContentFilterChange('off' as never);
      await result.current.handleCustomEmojisDisabledByAdminToggle(true);
      await result.current.handleMessageSearchCachePolicyToggle(true);
      await result.current.handleAllowSkipModerationToggle(true);
      await result.current.handleAudioCallsDisabledToggle(true);
      await result.current.handleVideoCallsDisabledToggle(false);
      await result.current.handleScreenshareDisabledToggle(true);
    });

    expect(params.updateGifsDisabled).toHaveBeenCalledWith('c1', true);
    expect(params.updateGifContentFilter).toHaveBeenCalledWith('c1', 'off');
    expect(params.updateCustomEmojisDisabled).toHaveBeenCalledWith('c1', true);
    expect(params.updateMessageSearchCachePolicy).toHaveBeenCalledWith('c1', true);
    expect(params.updateAllowSkipModeration).toHaveBeenCalledWith('c1', true);
    expect(params.updateCallSettings).toHaveBeenCalledWith('c1', { audioCallsDisabled: true });
    expect(params.updateCallSettings).toHaveBeenCalledWith('c1', { videoCallsDisabled: false });
    expect(params.updateCallSettings).toHaveBeenCalledWith('c1', { screenshareDisabled: true });
  });

  test('no-ops when conversationId is undefined', async () => {
    const params = makeParams({ conversationId: undefined });
    const { result } = await renderHook(() => useConversationAdminSettings(params));

    await act(async () => {
      await result.current.handleGifsDisabledByAdminToggle(true);
      await result.current.handleAudioCallsDisabledToggle(true);
    });

    expect(params.updateGifsDisabled).not.toHaveBeenCalled();
    expect(params.updateCallSettings).not.toHaveBeenCalled();
  });
});
