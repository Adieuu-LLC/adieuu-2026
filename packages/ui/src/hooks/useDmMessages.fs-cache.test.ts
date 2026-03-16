import { describe, expect, mock, test } from 'bun:test';
import type { DecryptedMessageContent } from '../services/dmMessageService';
import {
  maybeGetFsCachedMessage,
  persistFsMessageAndMaybeDeleteOtpk,
} from './useDmMessages.fs-cache';

describe('useDmMessages fs-cache helpers', () => {
  test('maybeGetFsCachedMessage returns null when message is not FS wrapped', async () => {
    const getFsMessageContentFn = mock(async () => ({
      text: 'cached',
      fromIdentityId: 'identity-1',
      version: 1,
    }));
    const result = await maybeGetFsCachedMessage({
      isFsWrapped: false,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wrappingKey: new Uint8Array(32),
      getFsMessageContentFn,
    });
    expect(result).toBeNull();
    expect(getFsMessageContentFn).not.toHaveBeenCalled();
  });

  test('maybeGetFsCachedMessage checks cache before decryption path', async () => {
    const cached: DecryptedMessageContent = {
      text: 'cached-text',
      fromIdentityId: 'identity-1',
      version: 1,
    };
    const getFsMessageContentFn = mock(async () => cached);

    const result = await maybeGetFsCachedMessage({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wrappingKey: new Uint8Array(32),
      getFsMessageContentFn,
    });

    expect(result).toEqual(cached);
    expect(getFsMessageContentFn).toHaveBeenCalledWith(
      'msg-1',
      'conv-1',
      expect.any(Uint8Array)
    );
  });

  test('persistFsMessageAndMaybeDeleteOtpk deletes OTPK only after successful persist', async () => {
    const storeFsMessageContentFn = mock(async () => {});
    const deleteOneTimePreKeyFn = mock(async () => {});

    await persistFsMessageAndMaybeDeleteOtpk({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      decrypted: {
        text: 'decrypted',
        fromIdentityId: 'identity-1',
        version: 1,
      },
      wrappingKey: new Uint8Array(32),
      targetWrappedKey: {
        preKeyType: 'otpk',
        oneTimePreKeyId: 'otpk-1',
      } as never,
      identityId: 'identity-1',
      storeFsMessageContentFn,
      deleteOneTimePreKeyFn,
    });

    expect(storeFsMessageContentFn).toHaveBeenCalledTimes(1);
    expect(deleteOneTimePreKeyFn).toHaveBeenCalledWith('otpk-1', 'identity-1');
  });

  test('persistFsMessageAndMaybeDeleteOtpk skips OTPK delete when persist fails', async () => {
    const storeFsMessageContentFn = mock(async () => {
      throw new Error('persist failed');
    });
    const deleteOneTimePreKeyFn = mock(async () => {});
    const logWarn = mock((_message: string, _err: unknown) => {});

    await persistFsMessageAndMaybeDeleteOtpk({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      decrypted: {
        text: 'decrypted',
        fromIdentityId: 'identity-1',
        version: 1,
      },
      wrappingKey: new Uint8Array(32),
      targetWrappedKey: {
        preKeyType: 'otpk',
        oneTimePreKeyId: 'otpk-1',
      } as never,
      identityId: 'identity-1',
      storeFsMessageContentFn,
      deleteOneTimePreKeyFn,
      logWarn,
    });

    expect(storeFsMessageContentFn).toHaveBeenCalledTimes(1);
    expect(deleteOneTimePreKeyFn).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  test('persistFsMessageAndMaybeDeleteOtpk logs OTPK deletion failure separately from storage', async () => {
    const storeFsMessageContentFn = mock(async () => {});
    const deleteOneTimePreKeyFn = mock(async () => {
      throw new Error('OTPK deletion failed');
    });
    const logWarn = mock((_message: string, _err: unknown) => {});

    await persistFsMessageAndMaybeDeleteOtpk({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      decrypted: {
        text: 'decrypted',
        fromIdentityId: 'identity-1',
        version: 1,
      },
      wrappingKey: new Uint8Array(32),
      targetWrappedKey: {
        preKeyType: 'otpk',
        oneTimePreKeyId: 'otpk-1',
      } as never,
      identityId: 'identity-1',
      storeFsMessageContentFn,
      deleteOneTimePreKeyFn,
      logWarn,
    });

    expect(storeFsMessageContentFn).toHaveBeenCalledTimes(1);
    expect(deleteOneTimePreKeyFn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(
      '[DM] Failed to delete consumed OTPK from local storage',
      expect.any(Error)
    );
  });

  test('maybeGetFsCachedMessage serves cached content when keys are gone', async () => {
    const cached: DecryptedMessageContent = {
      text: 'previously decrypted',
      fromIdentityId: 'identity-1',
      version: 1,
    };
    const getFsMessageContentFn = mock(async () => cached);

    // When pre-key private keys are gone, the decrypt path would fail.
    // The cache lookup runs first and returns the previously-decrypted content,
    // bypassing decryption entirely.
    const result = await maybeGetFsCachedMessage({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wrappingKey: new Uint8Array(32),
      getFsMessageContentFn,
    });

    expect(result).toEqual(cached);
    expect(result!.text).toBe('previously decrypted');
  });

  test('maybeGetFsCachedMessage returns null when cache is empty (keys gone, no cache)', async () => {
    const getFsMessageContentFn = mock(async () => null);

    // If the cache is also empty (e.g., cache was cleared), there's no fallback.
    const result = await maybeGetFsCachedMessage({
      isFsWrapped: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wrappingKey: new Uint8Array(32),
      getFsMessageContentFn,
    });

    expect(result).toBeNull();
  });
});

