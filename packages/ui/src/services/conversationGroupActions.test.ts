import { describe, expect, mock, test } from 'bun:test';
import * as actions from './conversationGroupActions';

function createApi() {
  return {
    conversations: {
      addMember: mock(async () => ({ success: true })),
      removeMember: mock(async () => ({ success: true })),
      leave: mock(async () => ({ success: true })),
      promoteToAdmin: mock(async () => ({ success: true })),
      terminateGroup: mock(async () => ({ success: true })),
      updateName: mock(async () => ({ success: true })),
      updateMemberSettings: mock(async () => ({ success: true })),
    },
  };
}

describe('conversationGroupActions', () => {
  test('calls add member API and returns success', async () => {
    const api = createApi();
    const ok = await actions.addMemberAction(api as never, 'conv-1', 'id-1');
    expect(ok).toBe(true);
    expect(api.conversations.addMember).toHaveBeenCalledWith('conv-1', 'id-1');
  });

  test('returns false when leave API throws', async () => {
    const api = createApi();
    api.conversations.leave = mock(async () => {
      throw new Error('boom');
    });
    const ok = await actions.leaveGroupAction(api as never, 'conv-1');
    expect(ok).toBe(false);
  });

  test('encrypts and updates group name', async () => {
    const api = createApi();
    const result = await actions.renameGroupAction(api as never, 'conv-1', 'New Name');
    expect(result.ok).toBe(true);
    expect(api.conversations.updateName).toHaveBeenCalledWith(
      'conv-1',
      expect.any(String),
      expect.any(String)
    );
  });

  test('encrypts and updates member settings', async () => {
    const api = createApi();
    const result = await actions.updateMemberSettingsAction(
      api as never,
      'conv-1',
      { 'id-1': { isMuted: true } } as never
    );
    expect(result.ok).toBe(true);
    expect(api.conversations.updateMemberSettings).toHaveBeenCalledWith(
      'conv-1',
      expect.any(String),
      expect.any(String)
    );
  });
});
