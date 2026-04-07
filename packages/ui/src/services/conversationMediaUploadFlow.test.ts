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
});
