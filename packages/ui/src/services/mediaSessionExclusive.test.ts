import { afterEach, describe, expect, test } from 'bun:test';
import {
  registerConversationCallLeave,
  registerVoiceChannelLeave,
  clearOtherMediaSession,
} from './mediaSessionExclusive';

afterEach(() => {
  registerConversationCallLeave(null);
  registerVoiceChannelLeave(null);
});

describe('mediaSessionExclusive', () => {
  test('starting a conversation call leaves the voice channel', async () => {
    let leftVoice = false;
    let leftConversation = false;
    registerVoiceChannelLeave(async () => {
      leftVoice = true;
    });
    registerConversationCallLeave(async () => {
      leftConversation = true;
    });

    await clearOtherMediaSession('conversation');
    expect(leftVoice).toBe(true);
    expect(leftConversation).toBe(false);
  });

  test('starting a voice channel leaves the conversation call', async () => {
    let leftVoice = false;
    let leftConversation = false;
    registerVoiceChannelLeave(async () => {
      leftVoice = true;
    });
    registerConversationCallLeave(async () => {
      leftConversation = true;
    });

    await clearOtherMediaSession('voice');
    expect(leftConversation).toBe(true);
    expect(leftVoice).toBe(false);
  });

  test('is a no-op when the other leave handler is not registered', async () => {
    await expect(clearOtherMediaSession('conversation')).resolves.toBeUndefined();
    await expect(clearOtherMediaSession('voice')).resolves.toBeUndefined();
  });
});
