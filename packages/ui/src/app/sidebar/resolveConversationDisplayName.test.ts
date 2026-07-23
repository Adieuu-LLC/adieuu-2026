import { describe, expect, test } from 'bun:test';
import type { DecryptedConversation } from '../../hooks/useConversations';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';

function conv(overrides: Partial<DecryptedConversation> = {}): DecryptedConversation {
  return {
    id: 'c1',
    type: 'dm',
    participants: ['self', 'other'],
    admins: [],
    unreadCount: 0,
    hasUnread: false,
    ...overrides,
  } as DecryptedConversation;
}

describe('resolveConversationDisplayName', () => {
  test('group uses decryptedName', () => {
    expect(
      resolveConversationDisplayName(
        conv({ type: 'group', decryptedName: 'Project Team' }),
        'self',
        {},
      ),
    ).toBe('Project Team');
  });

  test('group falls back to Group when name missing', () => {
    expect(
      resolveConversationDisplayName(conv({ type: 'group', decryptedName: undefined }), 'self', {}),
    ).toBe('Group');
  });

  test('DM prefers decryptedName', () => {
    expect(
      resolveConversationDisplayName(
        conv({ decryptedName: '  Alice  ', participants: ['self', 'alice'] }),
        'self',
        { alice: { displayName: 'Ignored' } },
      ),
    ).toBe('Alice');
  });

  test('DM without name joins other participant display names', () => {
    expect(
      resolveConversationDisplayName(
        conv({
          decryptedName: undefined,
          participants: ['self', 'a', 'b'],
        }),
        'self',
        {
          a: { displayName: 'Ada' },
          b: { username: 'bob' },
        },
      ),
    ).toBe('Ada, bob');
  });

  test('DM without profiles falls back to participant ids', () => {
    expect(
      resolveConversationDisplayName(
        conv({ decryptedName: undefined, participants: ['self', 'id-x'] }),
        'self',
        {},
      ),
    ).toBe('id-x');
  });
});
