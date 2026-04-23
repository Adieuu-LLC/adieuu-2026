import { describe, expect, it } from 'bun:test';
import {
  captureMessageContextStash,
  e2eAttachmentSupportsCopyImage,
  findE2eAttachment,
  findGifBySlug,
  suggestedFileNameForE2eAttachment,
} from './contextMenuMedia';
import type { GifAttachment, MediaAttachment } from '../services/messagePayload';

describe('suggestedFileNameForE2eAttachment', () => {
  it('uses fileName when set', () => {
    const a: MediaAttachment = {
      e2eMediaId: 'x',
      scanHash: 's',
      contentType: 'image/png',
      exifPreserved: false,
      encryptionKey: 'k',
      encryptionNonce: 'n',
      fileName: 'hello/world.png',
    };
    expect(suggestedFileNameForE2eAttachment(a)).toBe('hello_world.png');
  });

  it('falls back to id and content type', () => {
    const a: MediaAttachment = {
      e2eMediaId: 'abc12345',
      scanHash: 's',
      contentType: 'video/mp4',
      exifPreserved: false,
      encryptionKey: 'k',
      encryptionNonce: 'n',
    };
    expect(suggestedFileNameForE2eAttachment(a)).toMatch(/^attachment-abc12345.*\.mp4$/);
  });
});

describe('e2eAttachmentSupportsCopyImage', () => {
  it('is true for raster images', () => {
    const a: MediaAttachment = {
      e2eMediaId: 'x',
      scanHash: 's',
      contentType: 'image/jpeg',
      exifPreserved: false,
      encryptionKey: 'k',
      encryptionNonce: 'n',
    };
    expect(e2eAttachmentSupportsCopyImage(a)).toBe(true);
  });

  it('is false for svg', () => {
    const a: MediaAttachment = {
      e2eMediaId: 'x',
      scanHash: 's',
      contentType: 'image/svg+xml',
      exifPreserved: false,
      encryptionKey: 'k',
      encryptionNonce: 'n',
    };
    expect(e2eAttachmentSupportsCopyImage(a)).toBe(false);
  });
});

describe('findE2eAttachment / findGifBySlug', () => {
  it('resolves by id and slug', () => {
    const atts: MediaAttachment[] = [
      {
        e2eMediaId: 'm1',
        scanHash: 's',
        contentType: 'image/png',
        exifPreserved: false,
        encryptionKey: 'k',
        encryptionNonce: 'n',
      },
    ];
    expect(findE2eAttachment(atts, 'm1')?.e2eMediaId).toBe('m1');
    expect(findE2eAttachment(atts, 'nope')).toBeUndefined();
    const g: GifAttachment = {
      provider: 'klipy',
      type: 'gif',
      url: 'u',
      previewUrl: 'p',
      tinyUrl: 't',
      blurPreview: 'b',
      width: 1,
      height: 1,
      searchTerm: 's',
      slug: 'slug-1',
    };
    expect(findGifBySlug([g], 'slug-1')?.url).toBe('u');
  });
});

describe('captureMessageContextStash', () => {
  it('returns empty for null', () => {
    const s = captureMessageContextStash(null);
    expect(s.selection).toBe('');
    expect(s.linkHref).toBeNull();
    expect(s.e2eMediaId).toBeNull();
    expect(s.gifSlug).toBeNull();
  });
});
