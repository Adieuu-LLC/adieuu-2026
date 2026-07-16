import { describe, expect, it } from 'bun:test';
import type { PublicSpaceMessage } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import { displayMessageToChannel, spaceMessageToChannel } from './channelMessage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDisplayMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    fromIdentityId: 'id-sender',
    cryptoProfile: 'default',
    clientMessageId: 'client-1',
    deleted: false,
    createdAt: '2024-06-15T12:00:00.000Z',
    revisionCount: 0,
    ...overrides,
  };
}

function makeSpaceMessage(overrides: Partial<PublicSpaceMessage> = {}): PublicSpaceMessage {
  return {
    id: 'smsg-1',
    spaceId: 'space-1',
    channelId: 'ch-1',
    fromIdentityId: 'id-sender',
    content: 'hello world',
    clientMessageId: 'client-s1',
    createdAt: '2024-06-15T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// displayMessageToChannel
// ---------------------------------------------------------------------------

describe('displayMessageToChannel', () => {
  it('maps basic identity fields', () => {
    const msg = makeDisplayMessage();
    const ch = displayMessageToChannel(msg);

    expect(ch.id).toBe('msg-1');
    expect(ch.channelId).toBe('conv-1');
    expect(ch.fromIdentityId).toBe('id-sender');
    expect(ch.createdAt).toBe('2024-06-15T12:00:00.000Z');
  });

  it('parses decryptedContent through parsePayload for plain text', () => {
    const msg = makeDisplayMessage({ decryptedContent: 'hello there' });
    const ch = displayMessageToChannel(msg);
    expect(ch.body).toBe('hello there');
  });

  it('parses structured JSON payload and extracts text', () => {
    const payload = JSON.stringify({
      version: 1,
      text: 'structured text',
      senderDeviceId: 'dev-1',
    });
    const msg = makeDisplayMessage({ decryptedContent: payload });
    const ch = displayMessageToChannel(msg);
    expect(ch.body).toBe('structured text');
  });

  it('handles empty decryptedContent', () => {
    const msg = makeDisplayMessage({ decryptedContent: undefined });
    const ch = displayMessageToChannel(msg);
    expect(ch.body).toBe('');
    expect(ch.attachments).toEqual([]);
    expect(ch.mentions).toEqual([]);
  });

  it('preserves deleted flag', () => {
    const msg = makeDisplayMessage({ deleted: true });
    const ch = displayMessageToChannel(msg);
    expect(ch.deleted).toBe(true);
  });

  it('preserves reply metadata', () => {
    const msg = makeDisplayMessage({ replyToMessageId: 'parent-1' });
    const ch = displayMessageToChannel(msg);
    expect(ch.replyToMessageId).toBe('parent-1');
  });

  it('preserves edit metadata', () => {
    const msg = makeDisplayMessage({
      revisionCount: 3,
      lastEditedAt: '2024-06-15T13:00:00.000Z',
    });
    const ch = displayMessageToChannel(msg);
    expect(ch.revisionCount).toBe(3);
    expect(ch.lastEditedAt).toBe('2024-06-15T13:00:00.000Z');
  });

  it('preserves message type and system event', () => {
    const msg = makeDisplayMessage({
      messageType: 'system',
      systemEvent: { type: 'member_joined', identityId: 'id-new' },
    });
    const ch = displayMessageToChannel(msg);
    expect(ch.messageType).toBe('system');
    expect(ch.systemEvent).toEqual({ type: 'member_joined', identityId: 'id-new' });
  });

  it('preserves expiry and moderation fields', () => {
    const msg = makeDisplayMessage({
      expiresAt: '2024-06-16T12:00:00.000Z',
      moderationEnabled: true,
      e2eMediaIds: ['media-1', 'media-2'],
    });
    const ch = displayMessageToChannel(msg);
    expect(ch.expiresAt).toBe('2024-06-16T12:00:00.000Z');
    expect(ch.moderationEnabled).toBe(true);
    expect(ch.e2eMediaIds).toEqual(['media-1', 'media-2']);
  });

  it('maps E2EE trust metadata', () => {
    const msg = makeDisplayMessage({
      signatureVerified: true,
      forwardSecrecy: true,
      fsDowngraded: false,
    });
    const ch = displayMessageToChannel(msg);
    expect(ch.signatureVerified).toBe(true);
    expect(ch.forwardSecrecy).toBe(true);
    expect(ch.fsDowngraded).toBe(false);
  });

  it('extracts senderDeviceId from structured payload', () => {
    const payload = JSON.stringify({
      version: 1,
      text: 'hello',
      senderDeviceId: 'device-abc',
    });
    const msg = makeDisplayMessage({ decryptedContent: payload });
    const ch = displayMessageToChannel(msg);
    expect(ch.senderDeviceId).toBe('device-abc');
  });

  it('preserves decryptionError string', () => {
    const msg = makeDisplayMessage({
      decryptionError: 'Unable to decrypt: missing session key',
    });
    const ch = displayMessageToChannel(msg);
    expect(ch.decryptionError).toBe('Unable to decrypt: missing session key');
  });

  it('leaves decryptionError undefined when absent', () => {
    const msg = makeDisplayMessage({ decryptionError: undefined });
    const ch = displayMessageToChannel(msg);
    expect(ch.decryptionError).toBeUndefined();
  });

  it('retains source reference', () => {
    const msg = makeDisplayMessage();
    const ch = displayMessageToChannel(msg);
    expect(ch._sourceConversation).toBe(msg);
    expect(ch._sourceSpace).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// spaceMessageToChannel
// ---------------------------------------------------------------------------

describe('spaceMessageToChannel', () => {
  it('maps basic identity fields', () => {
    const msg = makeSpaceMessage();
    const ch = spaceMessageToChannel(msg, 'hello world');

    expect(ch.id).toBe('smsg-1');
    expect(ch.channelId).toBe('ch-1');
    expect(ch.fromIdentityId).toBe('id-sender');
    expect(ch.createdAt).toBe('2024-06-15T12:00:00.000Z');
  });

  it('uses the provided decryptedBody for body text', () => {
    const msg = makeSpaceMessage({ content: 'raw cipher' });
    const ch = spaceMessageToChannel(msg, 'decrypted text');
    expect(ch.body).toBe('decrypted text');
  });

  it('parses structured JSON payload from decryptedBody', () => {
    const payload = JSON.stringify({
      version: 1,
      text: 'structured space text',
      senderDeviceId: 'dev-2',
    });
    const ch = spaceMessageToChannel(makeSpaceMessage(), payload);
    expect(ch.body).toBe('structured space text');
  });

  it('handles empty decryptedBody', () => {
    const ch = spaceMessageToChannel(makeSpaceMessage(), '');
    expect(ch.body).toBe('');
    expect(ch.attachments).toEqual([]);
    expect(ch.gifAttachments).toEqual([]);
  });

  it('defaults deleted to false', () => {
    const ch = spaceMessageToChannel(makeSpaceMessage(), 'text');
    expect(ch.deleted).toBe(false);
  });

  it('defaults revisionCount to 0', () => {
    const ch = spaceMessageToChannel(makeSpaceMessage(), 'text');
    expect(ch.revisionCount).toBe(0);
  });

  it('has no reply, edit, or E2EE fields by default', () => {
    const ch = spaceMessageToChannel(makeSpaceMessage(), 'text');
    expect(ch.replyToMessageId).toBeUndefined();
    expect(ch.lastEditedAt).toBeUndefined();
    expect(ch.signatureVerified).toBeUndefined();
    expect(ch.forwardSecrecy).toBeUndefined();
    expect(ch.decryptionError).toBeUndefined();
  });

  it('retains source reference', () => {
    const msg = makeSpaceMessage();
    const ch = spaceMessageToChannel(msg, 'text');
    expect(ch._sourceSpace).toBe(msg);
    expect(ch._sourceConversation).toBeUndefined();
  });

  it('produces empty arrays for parsed payload fields on plain text', () => {
    const ch = spaceMessageToChannel(makeSpaceMessage(), 'plain text');
    expect(ch.mentions).toEqual([]);
    expect(ch.pageTags).toEqual([]);
    expect(ch.gifAttachments).toEqual([]);
    expect(ch.customEmojis).toEqual({});
  });
});
