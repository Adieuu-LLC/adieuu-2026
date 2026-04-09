import { describe, expect, test } from 'bun:test';
import {
  parsePayload,
  serializePayload,
  textPayload,
  mediaPayload,
  type MentionEntity,
  type MessagePayload,
} from './messagePayload';

describe('serializePayload', () => {
  test('text-only without mentions uses plain string optimisation', () => {
    const result = serializePayload(textPayload('hello'));
    expect(result).toBe('hello');
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
});
