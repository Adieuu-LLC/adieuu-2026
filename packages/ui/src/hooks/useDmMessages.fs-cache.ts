import type { DecryptedMessageContent } from '../services/dmMessageService';
import type { SerializedWrappedKey } from '@adieuu/shared';

interface FsCacheLookupInput {
  isFsWrapped: boolean;
  messageId: string | undefined;
  conversationId: string;
  wrappingKey: Uint8Array;
  getFsMessageContentFn: (
    messageId: string,
    conversationId: string,
    wrappingKey: Uint8Array
  ) => Promise<DecryptedMessageContent | null>;
}

export async function maybeGetFsCachedMessage(
  input: FsCacheLookupInput
): Promise<DecryptedMessageContent | null> {
  if (!input.isFsWrapped || !input.messageId) return null;
  return input.getFsMessageContentFn(
    input.messageId,
    input.conversationId,
    input.wrappingKey
  );
}

interface FsPersistInput {
  isFsWrapped: boolean;
  messageId: string | undefined;
  conversationId: string;
  decrypted: DecryptedMessageContent;
  wrappingKey: Uint8Array;
  targetWrappedKey: SerializedWrappedKey | undefined;
  identityId: string;
  storeFsMessageContentFn: (
    messageId: string,
    conversationId: string,
    content: DecryptedMessageContent,
    wrappingKey: Uint8Array
  ) => Promise<void>;
  deleteOneTimePreKeyFn: (keyId: string, identityId: string) => Promise<void>;
  logWarn?: (message: string, err: unknown) => void;
}

export async function persistFsMessageAndMaybeDeleteOtpk(input: FsPersistInput): Promise<void> {
  if (!input.isFsWrapped || !input.messageId) return;

  try {
    await input.storeFsMessageContentFn(
      input.messageId,
      input.conversationId,
      input.decrypted,
      input.wrappingKey
    );
  } catch (err) {
    input.logWarn?.('[DM] Failed to persist local FS message cache; skipping OTPK deletion', err);
    return;
  }

  try {
    if (input.targetWrappedKey?.preKeyType === 'otpk' && input.targetWrappedKey.oneTimePreKeyId) {
      await input.deleteOneTimePreKeyFn(
        input.targetWrappedKey.oneTimePreKeyId,
        input.identityId
      );
    }
  } catch (err) {
    input.logWarn?.('[DM] Failed to delete consumed OTPK from local storage', err);
  }
}

