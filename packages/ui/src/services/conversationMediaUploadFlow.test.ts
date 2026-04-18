import { describe, expect, mock, test } from 'bun:test';

const getImageDimensionsMock = mock(async () => ({ width: 100, height: 100 }));
const generateThumbnailMock = mock(async () => new Blob(['thumb'], { type: 'image/jpeg' }));

mock.module('../utils/imageProcessing', () => ({
  getImageDimensions: getImageDimensionsMock,
  generateThumbnail: generateThumbnailMock,
}));

const flow = await import('./conversationMediaUploadFlow');

describe('conversationMediaUploadFlow', () => {
  test('throws when e2e upload preparation fails', async () => {
    const api = {
      e2eUploads: {
        requestE2EUpload: async () => ({ success: false, error: { message: 'nope' } }),
      },
    };
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    await expect(
      flow.uploadMediaFile(api as never, file, new Blob(['enc']))
    ).rejects.toThrow('nope');
  });

  test('calls onUploadsComplete after completes and before status becomes available', async () => {
    const sequence: string[] = [];
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: TimerHandler) => {
      if (typeof fn === 'function') queueMicrotask(fn as () => void);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      })
    ) as typeof fetch;

    let pollCount = 0;
    const api = {
      e2eUploads: {
        requestE2EUpload: async () => ({
          success: true,
          data: {
            e2eMediaId: 'mid',
            uploadUrl: 'https://e2e.example/put',
            scanHash: 'a'.repeat(64),
          },
        }),
        requestScanUpload: async () => ({
          success: true,
          data: { scanMediaId: 'scan1', uploadUrl: 'https://scan.example/put' },
        }),
        completeE2EUpload: async () => {
          sequence.push('completeE2E');
          return { success: true };
        },
        completeScanUpload: async () => {
          sequence.push('completeScan');
          return { success: true };
        },
        getE2EMediaStatus: async () => {
          pollCount += 1;
          sequence.push(`poll${pollCount}`);
          if (pollCount >= 2) {
            return {
              success: true,
              data: { status: 'available', moderationStatus: 'passed' },
            };
          }
          return {
            success: true,
            data: { status: 'gated', moderationStatus: 'pending' },
          };
        },
      },
    };

    const onUploadsComplete = mock(() => {
      sequence.push('onUploadsComplete');
    });

    try {
      const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
      await flow.uploadMediaFile(api as never, file, new Blob(['enc']), {
        onUploadsComplete,
      });
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }

    expect(onUploadsComplete).toHaveBeenCalledTimes(1);
    const idxComplete = sequence.indexOf('onUploadsComplete');
    const idxPoll1 = sequence.indexOf('poll1');
    expect(idxComplete).toBeLessThan(idxPoll1);
    expect(sequence).toEqual([
      'completeE2E',
      'completeScan',
      'onUploadsComplete',
      'poll1',
      'poll2',
    ]);
  });
});
