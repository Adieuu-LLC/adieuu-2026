import { describe, expect, mock, test } from 'bun:test';
import type { MutableRefObject } from 'react';
import { renderHook, act } from '../../test/renderHook';
import { useComposerEditHydration, type UseComposerEditHydrationParams } from './useComposerEditHydration';
import type { GifAttachment, MediaAttachment } from '../../services/messagePayload';
import type { TrackedMention, TrackedPageTag } from './composerTypes';

const sampleGif: GifAttachment = {
  provider: 'klipy',
  type: 'gif',
  url: 'u',
  previewUrl: 'p',
  tinyUrl: 't',
  blurPreview: '',
  width: 1,
  height: 1,
  searchTerm: 's',
  slug: 'slug-1',
};

const media: MediaAttachment = {
  e2eMediaId: 'media-1',
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
} as unknown as MediaAttachment;

function makeParams(overrides: Partial<UseComposerEditHydrationParams> = {}): UseComposerEditHydrationParams {
  const mentionEntriesRef: MutableRefObject<TrackedMention[]> = { current: [{ identityId: 'x', offset: 0, length: 1 }] };
  const pageTagEntriesRef: MutableRefObject<TrackedPageTag[]> = { current: [{ pageId: 'p', offset: 0, length: 1 }] };
  return {
    editContext: { messageId: 'm1', onCancel: mock(() => {}) },
    editingMessageKey: 'k1',
    editingInitialPlaintext: 'hello',
    editingInitialAttachments: undefined,
    setMessageText: mock(() => {}),
    mentionEntriesRef,
    pageTagEntriesRef,
    setAttachments: mock(() => {}),
    setPendingGif: mock(() => {}),
    inputRef: { current: null } as unknown as UseComposerEditHydrationParams['inputRef'],
    ...overrides,
  };
}

describe('useComposerEditHydration', () => {
  test('seeds text and clears tracked entities when entering edit mode', async () => {
    const params = makeParams();
    await renderHook(() => useComposerEditHydration(params));

    expect(params.setMessageText).toHaveBeenCalledWith('hello', 5);
    expect(params.mentionEntriesRef.current).toEqual([]);
    expect(params.pageTagEntriesRef.current).toEqual([]);
    expect(params.setAttachments).toHaveBeenCalledWith([]);
    expect(params.setPendingGif).toHaveBeenCalledWith(null);
  });

  test('loads existing attachments and gif from the edited message', async () => {
    const params = makeParams({
      editingInitialAttachments: { media: [media], gifs: [sampleGif] },
    });
    await renderHook(() => useComposerEditHydration(params));

    const attsArg = (params.setAttachments as ReturnType<typeof mock>).mock.calls[0]![0] as unknown as Array<{
      existingMediaId?: string;
      uploadStatus: string;
    }>;
    expect(attsArg).toHaveLength(1);
    expect(attsArg[0]!.existingMediaId).toBe('media-1');
    expect(attsArg[0]!.uploadStatus).toBe('done');
    expect(params.setPendingGif).toHaveBeenCalledWith(sampleGif);
  });

  test('does not re-seed while the editing key is unchanged', async () => {
    const params = makeParams();
    const { rerender } = await renderHook(
      (p: UseComposerEditHydrationParams) => useComposerEditHydration(p),
      { initialProps: params },
    );

    await rerender(params);

    expect((params.setMessageText as ReturnType<typeof mock>).mock.calls.length).toBe(1);
  });

  test('clears the composer when leaving edit mode', async () => {
    const enter = makeParams();
    const { rerender } = await renderHook(
      (p: UseComposerEditHydrationParams) => useComposerEditHydration(p),
      { initialProps: enter },
    );

    const leave = makeParams({ editContext: null, editingMessageKey: null });
    await act(async () => {
      await rerender(leave);
    });

    expect(leave.setMessageText).toHaveBeenCalledWith('', 0);
    expect(leave.setAttachments).toHaveBeenCalled();
  });
});
