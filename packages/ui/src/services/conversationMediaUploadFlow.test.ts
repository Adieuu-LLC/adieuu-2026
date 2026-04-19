import { describe, expect, mock, test } from 'bun:test';

const getImageDimensionsMock = mock(async () => ({ width: 100, height: 100 }));
const generateThumbnailMock = mock(async () => new Blob(['thumb'], { type: 'image/jpeg' }));

mock.module('../utils/imageProcessing', () => ({
  getImageDimensions: getImageDimensionsMock,
  generateThumbnail: generateThumbnailMock,
}));

mock.module('../utils/videoProcessing', () => ({
  getVideoDimensions: getImageDimensionsMock,
  generateVideoFrameThumbnail: generateThumbnailMock,
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

  test('returns after completes without polling moderation status', async () => {
    const sequence: string[] = [];
    const originalFetch = globalThis.fetch;
    const getE2EMediaStatus = mock(async () => {
      sequence.push('unexpected_status_poll');
      return { success: true, data: { status: 'available', moderationStatus: 'passed' } };
    });

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      })
    ) as typeof fetch;

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
        getE2EMediaStatus,
      },
    };

    const onUploadsComplete = mock(() => {
      sequence.push('onUploadsComplete');
    });

    try {
      const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
      const result = await flow.uploadMediaFile(api as never, file, new Blob(['enc']), {
        onUploadsComplete,
      });
      expect(result.e2eMediaId).toBe('mid');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(onUploadsComplete).toHaveBeenCalledTimes(1);
    expect(getE2EMediaStatus).not.toHaveBeenCalled();
    expect(sequence).toEqual(['completeE2E', 'completeScan', 'onUploadsComplete']);
  });

  test('uploadE2EMediaOnly finalises E2E only and does not upload scan copy', async () => {
    const sequence: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: true, status: 200 })
    ) as typeof fetch;

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
        requestScanUpload: async () => {
          sequence.push('unexpected_requestScan');
          return { success: false, error: { message: 'no' } };
        },
        completeE2EUpload: async () => {
          sequence.push('completeE2E');
          return { success: true };
        },
        completeScanUpload: async () => {
          sequence.push('unexpected_completeScan');
          return { success: true };
        },
      },
    };

    try {
      const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
      const r = await flow.uploadE2EMediaOnly(api as never, file, new Blob(['enc']), {
        onUploadsComplete: () => sequence.push('onUploadsComplete'),
      });
      expect(r.e2eMediaId).toBe('mid');
      expect(r.scanThumbnail).toBeInstanceOf(Blob);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(sequence).toEqual(['completeE2E', 'onUploadsComplete']);
  });
});
