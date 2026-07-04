import {
  gifPayload,
  serializePayload,
  type GifAttachment,
} from '../../services/messagePayload';
import { getSenderDeviceIdForPayload } from '../../services/deviceInfo';
import type { ComposerSendFn } from './composerTypes';

export type KlipyShareFn = (params: {
  slug: string;
  type: GifAttachment['type'];
  searchTerm?: string;
}) => Promise<unknown>;

export type GifSendNowOptions = {
  gif: GifAttachment;
  onSend: ComposerSendFn;
  klipyShare: KlipyShareFn;
  forwardSecrecyEnabled?: boolean;
  replyToMessageId?: string;
  replyOnCancel?: () => void;
  ttlSeconds?: number;
  onSendSucceeded?: () => void;
  focusInput?: () => void;
};

export async function executeGifSendNow(options: GifSendNowOptions): Promise<void> {
  const {
    gif,
    onSend,
    klipyShare,
    forwardSecrecyEnabled,
    replyToMessageId,
    replyOnCancel,
    ttlSeconds,
    onSendSucceeded,
    focusInput,
  } = options;

  const payload = gifPayload(undefined, gif);
  const senderDeviceId = getSenderDeviceIdForPayload();
  if (senderDeviceId) payload.senderDeviceId = senderDeviceId;
  const plaintext = serializePayload(payload);

  await klipyShare({
    slug: gif.slug,
    type: gif.type,
    searchTerm: gif.searchTerm || undefined,
  });

  const sent = await onSend(plaintext, {
    ...(forwardSecrecyEnabled ? { useForwardSecrecy: forwardSecrecyEnabled } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
  });
  replyOnCancel?.();
  if (sent != null) {
    onSendSucceeded?.();
  }
  focusInput?.();
}

export function runGifSendNow(options: GifSendNowOptions): void {
  void executeGifSendNow(options).catch((err) => {
    console.error('[Composer] GIF send-now failed:', err);
  });
}
