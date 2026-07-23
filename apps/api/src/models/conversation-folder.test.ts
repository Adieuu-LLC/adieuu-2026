import { describe, expect, it } from 'bun:test';
import { ObjectId } from 'mongodb';
import { toPublicConversationFolder, type ConversationFolderDocument } from './conversation-folder';

describe('toPublicConversationFolder', () => {
  it('maps spaceIds and defaults missing arrays', () => {
    const doc = {
      _id: new ObjectId(),
      identityId: new ObjectId(),
      name: 'Folder',
      iconType: 'dynamic' as const,
      conversationIds: [new ObjectId()],
      favorited: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ConversationFolderDocument;

    // Legacy docs may omit spaceIds
    delete (doc as { spaceIds?: ObjectId[] }).spaceIds;

    const pub = toPublicConversationFolder(doc);
    expect(pub.spaceIds).toEqual([]);
    expect(pub.conversationIds).toHaveLength(1);
  });
});
