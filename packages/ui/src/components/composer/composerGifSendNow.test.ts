import { describe, expect, mock, test, beforeEach } from 'bun:test';
import { executeGifSendNow, runGifSendNow } from './composerGifSendNow';
import { parsePayload, type GifAttachment } from '../../services/messagePayload';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

describe('executeGifSendNow', () => {
  test('shares with Klipy, sends gif-only payload, and focuses input', async () => {
    const klipyShare = mock(async () => ({ success: true, data: { ok: true } }));
    const onSend = mock(async () => 'msg-1');
    const onSendSucceeded = mock(() => {});
    const focusInput = mock(() => {});

    await executeGifSendNow({
      gif: sampleGif,
      onSend,
      klipyShare,
      onSendSucceeded,
      focusInput,
    });

    expect(klipyShare).toHaveBeenCalledWith({
      slug: 'hello-662',
      type: 'gif',
      searchTerm: 'hello',
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    const [plaintext, options] = onSend.mock.calls[0]!;
    const parsed = parsePayload(plaintext);
    expect(parsed.text).toBe('');
    expect(parsed.gifAttachments?.[0]?.slug).toBe('hello-662');
    expect(parsed.senderDeviceId).toBeTruthy();
    expect(options).toEqual({});
    expect(onSendSucceeded).toHaveBeenCalledTimes(1);
    expect(focusInput).toHaveBeenCalledTimes(1);
  });

  test('passes reply, ttl, and forward secrecy options to onSend', async () => {
    const onSend = mock(async () => null);
    const replyOnCancel = mock(() => {});

    await executeGifSendNow({
      gif: sampleGif,
      onSend,
      klipyShare: async () => ({}),
      forwardSecrecyEnabled: true,
      replyToMessageId: 'reply-42',
      replyOnCancel,
      ttlSeconds: 3600,
    });

    expect(onSend).toHaveBeenCalledWith(expect.any(String), {
      useForwardSecrecy: true,
      replyToMessageId: 'reply-42',
      expiresInSeconds: 3600,
    });
    expect(replyOnCancel).toHaveBeenCalledTimes(1);
  });

  test('omits empty searchTerm from Klipy share params', async () => {
    const klipyShare = mock(async () => ({}));
    const gifNoTerm = { ...sampleGif, searchTerm: '' };

    await executeGifSendNow({
      gif: gifNoTerm,
      onSend: async () => null,
      klipyShare,
    });

    expect(klipyShare).toHaveBeenCalledWith({
      slug: 'hello-662',
      type: 'gif',
      searchTerm: undefined,
    });
  });

  test('does not call onSendSucceeded when onSend resolves null', async () => {
    const onSendSucceeded = mock(() => {});

    await executeGifSendNow({
      gif: sampleGif,
      onSend: async () => null,
      klipyShare: async () => ({}),
      onSendSucceeded,
    });

    expect(onSendSucceeded).not.toHaveBeenCalled();
  });
});

describe('runGifSendNow', () => {
  test('swallows onSend rejection without unhandled rejection', async () => {
    const consoleError = console.error;
    const errorSpy = mock(() => {});
    console.error = errorSpy;

    try {
      runGifSendNow({
        gif: sampleGif,
        onSend: async () => {
          throw new Error('send failed');
        },
        klipyShare: async () => ({}),
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]?.[1])).toContain('send failed');
    } finally {
      console.error = consoleError;
    }
  });

  test('swallows klipyShare rejection without unhandled rejection', async () => {
    const consoleError = console.error;
    const errorSpy = mock(() => {});
    console.error = errorSpy;
    const onSend = mock(async () => 'msg-1');

    try {
      runGifSendNow({
        gif: sampleGif,
        onSend,
        klipyShare: async () => {
          throw new Error('share failed');
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(errorSpy).toHaveBeenCalled();
      expect(onSend).not.toHaveBeenCalled();
    } finally {
      console.error = consoleError;
    }
  });
});
