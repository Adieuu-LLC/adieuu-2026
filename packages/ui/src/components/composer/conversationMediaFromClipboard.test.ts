import { describe, expect, test } from 'bun:test';
import {
  normalizeMimeType,
  sniffConversationMediaMime,
  resolveConversationMediaFile,
} from './conversationMediaFromClipboard';

describe('normalizeMimeType', () => {
  test('maps legacy aliases', () => {
    expect(normalizeMimeType('image/X-PNG')).toBe('image/png');
    expect(normalizeMimeType('image/jpg')).toBe('image/jpeg');
    expect(normalizeMimeType('image/pjpeg')).toBe('image/jpeg');
  });

  test('passes through accepted types', () => {
    expect(normalizeMimeType('image/webp')).toBe('image/webp');
    expect(normalizeMimeType('video/mp4')).toBe('video/mp4');
  });
});

describe('sniffConversationMediaMime', () => {
  test('detects PNG signature', () => {
    const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffConversationMediaMime(head)).toBe('image/png');
  });

  test('detects JPEG signature', () => {
    const head = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffConversationMediaMime(head)).toBe('image/jpeg');
  });

  test('detects WebP', () => {
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46], 0);
    head.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffConversationMediaMime(head)).toBe('image/webp');
  });

  test('detects MP4 via ftyp', () => {
    const head = new Uint8Array(12);
    head.set([0, 0, 0, 0], 0);
    head.set([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 4);
    expect(sniffConversationMediaMime(head)).toBe('video/mp4');
  });

  test('returns null for unknown', () => {
    expect(sniffConversationMediaMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe('resolveConversationMediaFile', () => {
  test('accepts empty type when bytes are PNG', async () => {
    const pngSig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
    const file = new File([pngSig], 'blob', { type: '' });
    const out = await resolveConversationMediaFile(file);
    expect(out).not.toBeNull();
    expect(out!.file.type).toBe('image/png');
  });

  test('accepts non-media bytes with octet-stream as file attachment', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'x.bin', { type: 'application/octet-stream' });
    const out = await resolveConversationMediaFile(file);
    expect(out).not.toBeNull();
    expect(out!.file.name).toBe('x.bin');
    expect(out!.file.type).toBe('application/octet-stream');
  });
});
