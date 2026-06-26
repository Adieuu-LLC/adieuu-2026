import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as videoModerationFramesReal from '../utils/videoModerationFrames';

const getImageDimensionsAndThumbnailJpegMock = mock(async () => ({
  width: 100,
  height: 100,
  thumbnail: new Blob(['thumb'], { type: 'image/jpeg' }),
}));

mock.module('../utils/imageProcessing', () => ({
  getImageDimensionsAndThumbnailJpeg: getImageDimensionsAndThumbnailJpegMock,
}));

mock.module('../utils/videoProcessing', () => ({
  getVideoDimensionsAndScanThumbnail: mock(async () => ({
    width: 100,
    height: 100,
    durationSeconds: 12,
    thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  })),
  probeVideoPlayableInBrowser: mock(async () => true),
}));

let transcodeCallCount = 0;
mock.module('../utils/videoTranscode', () => ({
  transcodeVideoToMp4: mock(async (f: File) => {
    transcodeCallCount += 1;
    return f;
  }),
  preloadFfmpegCore: mock(() => Promise.resolve()),
}));

const buildVideoModerationScanPayloadsMock = mock(
  async (): Promise<{ body: Blob; contentType: 'image/jpeg' }[]> => [
    { body: new Blob(['grid'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
  ]
);

mock.module('../utils/videoModerationFrames', () => ({
  ...videoModerationFramesReal,
  buildVideoModerationScanPayloads: buildVideoModerationScanPayloadsMock,
}));

const flow = await import('./conversationMediaUploadFlow');

describe('conversationMediaUploadFlow', () => {
  beforeEach(() => {
    transcodeCallCount = 0;
    buildVideoModerationScanPayloadsMock.mockImplementation(async () => [
      { body: new Blob(['grid'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
    ]);
  });

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
          data: { scanMediaId: 'scan1', uploadUrl: 'https://media.adieuu.com', uploadFields: { key: 'uploads/conv_scan/test/scan1.jpg', 'Content-Type': 'image/jpeg' } },
        }),
        completeE2EUpload: async () => {
          sequence.push('completeE2E');
          return { success: true };
        },
        completeScanUpload: async () => {
          sequence.push('completeScan');
          return { success: true };
        },
        sealConvScanSession: async (params: {
          manifest?: { version: number; parts?: unknown[] };
        }) => {
          sequence.push('sealScan');
          expect(params.manifest?.version).toBe(1);
          expect(params.manifest?.parts?.length).toBe(1);
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
    expect(sequence).toEqual(['completeE2E', 'completeScan', 'sealScan', 'onUploadsComplete']);
  });

  test('uploadModerationScanCopy uploads multiple parts then seals', async () => {
    const sequence: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: true, status: 200 })
    ) as typeof fetch;

    let scanSeq = 0;
    const api = {
      e2eUploads: {
        requestScanUpload: async () => {
          sequence.push('requestScan');
          scanSeq += 1;
          return {
            success: true,
            data: { scanMediaId: `scan-${scanSeq}`, uploadUrl: 'https://media.adieuu.com', uploadFields: { key: `uploads/conv_scan/test/scan-${scanSeq}.jpg`, 'Content-Type': 'image/jpeg' } },
          };
        },
        completeScanUpload: async () => {
          sequence.push('completeScan');
          return { success: true };
        },
        sealConvScanSession: async (params: {
          scanMediaIds?: string[];
          manifest?: { version: number; parts?: unknown[] };
        }) => {
          sequence.push('sealScan');
          expect(params.scanMediaIds).toEqual(['scan-1', 'scan-2']);
          expect(params.manifest?.version).toBe(1);
          expect(params.manifest?.parts?.length).toBe(2);
          return { success: true };
        },
      },
    };

    try {
      await flow.uploadModerationScanCopy(
        api as never,
        'a'.repeat(64),
        [
          { body: new Blob(['a'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
          { body: new Blob(['b'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
        ]
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(sequence).toEqual([
      'requestScan',
      'completeScan',
      'requestScan',
      'completeScan',
      'sealScan',
    ]);
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
      expect(r.moderationScan.contentType).toBe('image/jpeg');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(sequence).toEqual(['completeE2E', 'onUploadsComplete']);
  });

  test('uploadE2EMediaOnly passes array moderationScan when video yields multiple scan parts', async () => {
    buildVideoModerationScanPayloadsMock.mockImplementation(async () => [
      { body: new Blob(['a'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
      { body: new Blob(['b'], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
    ]);
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
        completeE2EUpload: async () => ({ success: true }),
      },
    };

    try {
      const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      const r = await flow.uploadE2EMediaOnly(api as never, file, new Blob(['enc']));
      expect(Array.isArray(r.moderationScan)).toBe(true);
      expect((r.moderationScan as { body: Blob }[]).length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uploadE2EMediaOnly with alreadyPrepared does not transcode again', async () => {
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
        completeE2EUpload: async () => ({ success: true }),
      },
    };

    try {
      const raw = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      const prepared = await flow.prepareConversationMediaFileForUpload(raw, {
        sendMp4WithoutReencode: true,
      });
      expect(transcodeCallCount).toBe(0);
      await flow.uploadE2EMediaOnly(api as never, prepared, new Blob(['enc']), { alreadyPrepared: true });
      expect(transcodeCallCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uploadE2EMediaOnly wraps video moderation scan errors', async () => {
    buildVideoModerationScanPayloadsMock.mockImplementationOnce(async () => {
      throw new Error('seek failed');
    });
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
        completeE2EUpload: async () => ({ success: true }),
      },
    };

    try {
      const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      await expect(flow.uploadE2EMediaOnly(api as never, file, new Blob(['enc']))).rejects.toThrow(
        /Could not build video frames/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uploadE2EMediaOnly uses JPEG grid for video moderation scan', async () => {
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
        completeE2EUpload: async () => ({ success: true }),
      },
    };

    try {
      const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      const r = await flow.uploadE2EMediaOnly(api as never, file, new Blob(['enc']));
      expect(r.moderationScan.contentType).toBe('image/jpeg');
      expect(r.moderationScan.body.type).toBe('image/jpeg');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
