import { describe, expect, test } from 'bun:test';
import {
  parsePayload,
  serializePayload,
  textPayload,
  gifPayload,
  isValidGifAttachment,
  buildCustomEmojiPayloadMap,
  parseCustomEmojiComposerSnapshot,
  type MessagePayload,
  type GifAttachment,
} from './messagePayload';

describe('serializePayload', () => {
  test('text-only without mentions uses plain string optimisation', () => {
    const result = serializePayload(textPayload('hello'));
    expect(result).toBe('hello');
  });

  test('senderDeviceId forces JSON for plain text', () => {
    const payload: MessagePayload = { version: 1, text: 'hello', senderDeviceId: 'device-abc' };
    const result = serializePayload(payload);
    expect(result.startsWith('{')).toBe(true);
    const parsed = parsePayload(result);
    expect(parsed.text).toBe('hello');
    expect(parsed.senderDeviceId).toBe('device-abc');
    expect(parsed.isStructured).toBe(true);
  });

  test('customEmojis map forces JSON even without senderDeviceId', () => {
    const payload: MessagePayload = {
      version: 1,
      text: ':wave:',
      customEmojis: {
        wave: { id: '1', url: 'https://cdn/w.webp', name: 'wave', animated: false },
      },
    };
    const result = serializePayload(payload);
    expect(result.startsWith('{')).toBe(true);
    const parsed = parsePayload(result);
    expect(parsed.isStructured).toBe(true);
    expect(parsed.customEmojis.wave?.url).toBe('https://cdn/w.webp');
  });

  test('empty text without mentions returns empty string', () => {
    const result = serializePayload({ version: 1 });
    expect(result).toBe('');
  });

  test('text with mentions forces JSON serialisation', () => {
    const payload: MessagePayload = {
      version: 1,
      text: 'Hey @Alice',
      mentions: [{ id: 'abc123456789012345678901', offset: 4, length: 6 }],
    };
    const result = serializePayload(payload);
    expect(result.startsWith('{')).toBe(true);
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe(1);
    expect(parsed.text).toBe('Hey @Alice');
    expect(parsed.mentions).toEqual([{ id: 'abc123456789012345678901', offset: 4, length: 6 }]);
  });

  test('text with attachments and mentions includes both in JSON', () => {
    const payload: MessagePayload = {
      version: 1,
      text: 'Hey @Bob look',
      attachments: [
        {
          e2eMediaId: 'media-1',
          scanHash: 'hash',
          contentType: 'image/png',
          exifPreserved: false,
          encryptionKey: 'key',
          encryptionNonce: 'nonce',
        },
      ],
      mentions: [{ id: 'def123456789012345678901', offset: 4, length: 4 }],
    };
    const result = serializePayload(payload);
    const parsed = JSON.parse(result);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.mentions).toHaveLength(1);
  });

  test('empty mentions array uses plain string optimisation', () => {
    const payload: MessagePayload = {
      version: 1,
      text: 'no mentions here',
      mentions: [],
    };
    const result = serializePayload(payload);
    expect(result).toBe('no mentions here');
  });
});

describe('parsePayload', () => {
  test('structured payload with customEmojis parses map', () => {
    const json = JSON.stringify({
      version: 1,
      text: ':a:',
      customEmojis: {
        a: { id: 'id1', url: 'https://x', name: 'A', animated: false },
      },
    });
    const result = parsePayload(json);
    expect(result.customEmojis.a).toEqual({
      id: 'id1',
      url: 'https://x',
      name: 'A',
      animated: false,
    });
  });

  test('invalid custom emoji entries are filtered', () => {
    const json = JSON.stringify({
      version: 1,
      text: ':x:',
      customEmojis: {
        good: { id: '1', url: 'u', name: 'n', animated: false },
        bad1: { id: '1', url: 'u', name: 'n' },
        bad2: 'nope',
      },
    });
    const result = parsePayload(json);
    expect(Object.keys(result.customEmojis)).toEqual(['good']);
  });

  test('legacy plain text returns empty mentions', () => {
    const result = parsePayload('hello world');
    expect(result.text).toBe('hello world');
    expect(result.mentions).toEqual([]);
    expect(result.isStructured).toBe(false);
  });

  test('structured payload without mentions returns empty mentions', () => {
    const json = JSON.stringify({ version: 1, text: 'structured' });
    const result = parsePayload(json);
    expect(result.text).toBe('structured');
    expect(result.mentions).toEqual([]);
    expect(result.isStructured).toBe(true);
  });

  test('structured payload with valid mentions parses them', () => {
    const json = JSON.stringify({
      version: 1,
      text: 'Hey @Alice and @Bob',
      mentions: [
        { id: 'aaa111222333444555666777', offset: 4, length: 6 },
        { id: 'bbb111222333444555666777', offset: 15, length: 4 },
      ],
    });
    const result = parsePayload(json);
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0]).toEqual({ id: 'aaa111222333444555666777', offset: 4, length: 6 });
    expect(result.mentions[1]).toEqual({ id: 'bbb111222333444555666777', offset: 15, length: 4 });
  });

  test('invalid mention entries are filtered out', () => {
    const json = JSON.stringify({
      version: 1,
      text: 'Hey @Alice',
      mentions: [
        { id: 'valid000000000000000001', offset: 4, length: 6 },
        { id: 123, offset: 0, length: 3 },
        { offset: 0, length: 3 },
        { id: 'valid000000000000000002', offset: -1, length: 3 },
        { id: 'valid000000000000000003', offset: 0, length: 0 },
        null,
        'not an object',
      ],
    });
    const result = parsePayload(json);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]!.id).toBe('valid000000000000000001');
  });

  test('mentions field that is not an array defaults to empty', () => {
    const json = JSON.stringify({
      version: 1,
      text: 'Hey @Alice',
      mentions: 'not an array',
    });
    const result = parsePayload(json);
    expect(result.mentions).toEqual([]);
  });

  test('round-trip preserves text and mentions', () => {
    const original: MessagePayload = {
      version: 1,
      text: 'Hey @Alice and @Bob!',
      mentions: [
        { id: 'aaa111222333444555666777', offset: 4, length: 6 },
        { id: 'bbb111222333444555666777', offset: 15, length: 4 },
      ],
    };
    const serialised = serializePayload(original);
    const parsed = parsePayload(serialised);
    expect(parsed.text).toBe(original.text);
    expect(parsed.mentions).toEqual(original.mentions);
    expect(parsed.isStructured).toBe(true);
  });

  test('round-trip with attachments and mentions', () => {
    const original: MessagePayload = {
      version: 1,
      text: 'Check this @Carol',
      attachments: [
        {
          e2eMediaId: 'media-1',
          scanHash: 'hash',
          contentType: 'image/jpeg',
          exifPreserved: true,
          encryptionKey: 'k',
          encryptionNonce: 'n',
        },
      ],
      mentions: [{ id: 'ccc111222333444555666777', offset: 11, length: 6 }],
    };
    const serialised = serializePayload(original);
    const parsed = parsePayload(serialised);
    expect(parsed.text).toBe(original.text);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.mentions).toEqual(original.mentions);
  });

  test('structured payload with gifAttachments parses them', () => {
    const gif: GifAttachment = {
      provider: 'klipy',
      type: 'gif',
      url: 'https://static.klipy.com/hd.webp',
      previewUrl: 'https://static.klipy.com/sm.webp',
      tinyUrl: 'https://static.klipy.com/xs.webp',
      blurPreview: 'data:image/jpeg;base64,abc',
      width: 498,
      height: 300,
      searchTerm: 'cats',
      slug: 'cats-123',
    };
    const json = JSON.stringify({ version: 1, text: 'look!', gifAttachments: [gif] });
    const result = parsePayload(json);
    expect(result.gifAttachments).toHaveLength(1);
    expect(result.gifAttachments[0]!.slug).toBe('cats-123');
    expect(result.isStructured).toBe(true);
  });

  test('invalid gifAttachments are filtered out', () => {
    const json = JSON.stringify({
      version: 1,
      text: '',
      gifAttachments: [
        { provider: 'klipy', type: 'gif' },
        'not an object',
        null,
      ],
    });
    const result = parsePayload(json);
    expect(result.gifAttachments).toHaveLength(0);
  });

  test('legacy plaintext has empty gifAttachments', () => {
    const result = parsePayload('just text');
    expect(result.gifAttachments).toEqual([]);
  });
});

describe('buildCustomEmojiPayloadMap', () => {
  const list = [
    { id: 'e1', shortcode: 'gandalf', cdnUrl: 'https://cdn/g.webp', name: 'G', animated: false },
  ] as const;

  test('collects shortcodes present in text', () => {
    const m = buildCustomEmojiPayloadMap('hi :gandalf: there', list, false);
    expect(m?.gandalf).toEqual({
      id: 'e1',
      url: 'https://cdn/g.webp',
      name: 'G',
      animated: false,
    });
  });

  test('returns undefined when disabled', () => {
    expect(buildCustomEmojiPayloadMap(':gandalf:', list, true)).toBeUndefined();
  });

  test('returns undefined when list empty', () => {
    expect(buildCustomEmojiPayloadMap(':gandalf:', [], false)).toBeUndefined();
  });
});

describe('parseCustomEmojiComposerSnapshot', () => {
  test('parses valid JSON array', () => {
    const j = JSON.stringify([
      { id: '1', shortcode: 'a', cdnUrl: 'u', name: 'n', animated: true },
    ]);
    expect(parseCustomEmojiComposerSnapshot(j)).toEqual([
      { id: '1', shortcode: 'a', cdnUrl: 'u', name: 'n', animated: true },
    ]);
  });

  test('filters invalid entries and returns undefined for empty', () => {
    expect(parseCustomEmojiComposerSnapshot('[{"id":1}]')).toBeUndefined();
    expect(parseCustomEmojiComposerSnapshot('[]')).toBeUndefined();
    expect(parseCustomEmojiComposerSnapshot(undefined)).toBeUndefined();
  });
});

describe('gifPayload', () => {
  const sampleGif: GifAttachment = {
    provider: 'klipy',
    type: 'gif',
    url: 'https://static.klipy.com/hd.webp',
    previewUrl: 'https://static.klipy.com/sm.webp',
    tinyUrl: 'https://static.klipy.com/xs.webp',
    blurPreview: '',
    width: 498,
    height: 280,
    searchTerm: 'hello',
    slug: 'hello-662',
  };

  test('serialises to JSON (not plain string)', () => {
    const payload = gifPayload('hey', sampleGif);
    const result = serializePayload(payload);
    expect(result.startsWith('{')).toBe(true);
    const parsed = JSON.parse(result);
    expect(parsed.gifAttachments).toHaveLength(1);
  });

  test('round-trips correctly', () => {
    const payload = gifPayload('look at this', sampleGif);
    const serialised = serializePayload(payload);
    const parsed = parsePayload(serialised);
    expect(parsed.text).toBe('look at this');
    expect(parsed.gifAttachments).toHaveLength(1);
    expect(parsed.gifAttachments[0]!.slug).toBe('hello-662');
  });

  test('round-trip preserves customEmojis on caption', () => {
    const payload = gifPayload(':wave:', sampleGif);
    payload.customEmojis = {
      wave: { id: '1', url: 'https://cdn/w.webp', name: 'wave', animated: false },
    };
    const serialised = serializePayload(payload);
    const parsed = parsePayload(serialised);
    expect(parsed.text).toBe(':wave:');
    expect(parsed.customEmojis.wave?.url).toBe('https://cdn/w.webp');
  });
});

describe('file attachment (non-visual) payloads', () => {
  test('round-trip for file attachment without width/height', () => {
    const original: MessagePayload = {
      version: 1,
      text: 'Here is the document',
      attachments: [
        {
          e2eMediaId: 'media-pdf-1',
          scanHash: 'hash-pdf',
          contentType: 'application/pdf',
          fileName: 'report.pdf',
          sizeBytes: 1024000,
          exifPreserved: false,
          encryptionKey: 'key-pdf',
          encryptionNonce: 'nonce-pdf',
        },
      ],
    };
    const serialised = serializePayload(original);
    const parsed = parsePayload(serialised);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]!.contentType).toBe('application/pdf');
    expect(parsed.attachments[0]!.fileName).toBe('report.pdf');
    expect(parsed.attachments[0]!.width).toBeUndefined();
    expect(parsed.attachments[0]!.height).toBeUndefined();
    expect(parsed.attachments[0]!.sizeBytes).toBe(1024000);
  });

  test('mixed visual and file attachments round-trip', () => {
    const original: MessagePayload = {
      version: 1,
      text: 'Photos and docs',
      attachments: [
        {
          e2eMediaId: 'media-img',
          scanHash: 'hash-img',
          contentType: 'image/jpeg',
          width: 1920,
          height: 1080,
          exifPreserved: true,
          encryptionKey: 'k1',
          encryptionNonce: 'n1',
        },
        {
          e2eMediaId: 'media-zip',
          scanHash: 'hash-zip',
          contentType: 'application/zip',
          fileName: 'archive.zip',
          sizeBytes: 5000000,
          exifPreserved: false,
          encryptionKey: 'k2',
          encryptionNonce: 'n2',
        },
      ],
    };
    const serialised = serializePayload(original);
    const parsed = parsePayload(serialised);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]!.contentType).toBe('image/jpeg');
    expect(parsed.attachments[0]!.width).toBe(1920);
    expect(parsed.attachments[1]!.contentType).toBe('application/zip');
    expect(parsed.attachments[1]!.width).toBeUndefined();
  });
});

describe('isValidGifAttachment', () => {
  test('accepts valid GifAttachment', () => {
    expect(isValidGifAttachment({
      provider: 'klipy',
      type: 'gif',
      url: 'u',
      previewUrl: 'p',
      tinyUrl: 't',
      blurPreview: 'b',
      width: 100,
      height: 100,
      searchTerm: 's',
      slug: 'sl',
    })).toBe(true);
  });

  test('rejects missing fields', () => {
    expect(isValidGifAttachment({ provider: 'klipy', type: 'gif' })).toBe(false);
    expect(isValidGifAttachment(null)).toBe(false);
    expect(isValidGifAttachment({})).toBe(false);
  });

  test('rejects wrong provider', () => {
    expect(isValidGifAttachment({
      provider: 'giphy',
      type: 'gif',
      url: 'u',
      previewUrl: 'p',
      tinyUrl: 't',
      blurPreview: 'b',
      width: 100,
      height: 100,
      searchTerm: 's',
      slug: 'sl',
    })).toBe(false);
  });

  test('accepts optional posterUrl', () => {
    expect(isValidGifAttachment({
      provider: 'klipy',
      type: 'gif',
      url: 'u',
      posterUrl: 'https://static.klipy.com/hd.jpg',
      previewUrl: 'p',
      tinyUrl: 't',
      blurPreview: 'b',
      width: 100,
      height: 100,
      searchTerm: 's',
      slug: 'sl',
    })).toBe(true);
  });

  test('rejects non-string posterUrl', () => {
    expect(isValidGifAttachment({
      provider: 'klipy',
      type: 'gif',
      url: 'u',
      posterUrl: 123 as unknown as string,
      previewUrl: 'p',
      tinyUrl: 't',
      blurPreview: 'b',
      width: 100,
      height: 100,
      searchTerm: 's',
      slug: 'sl',
    })).toBe(false);
  });
});
