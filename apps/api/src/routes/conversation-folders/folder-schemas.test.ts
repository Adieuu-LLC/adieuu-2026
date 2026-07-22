import { describe, expect, it } from 'bun:test';
import { CreateFolderSchema, AddSpaceToFolderSchema } from './folder-schemas';

const oid = '507f1f77bcf86cd799439011';
const oid2 = '507f1f77bcf86cd799439012';

describe('CreateFolderSchema', () => {
  it('accepts conversation-only folders', () => {
    const result = CreateFolderSchema.safeParse({
      name: 'Work',
      conversationIds: [oid],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spaceIds).toEqual([]);
      expect(result.data.conversationIds).toEqual([oid]);
    }
  });

  it('accepts space-only folders', () => {
    const result = CreateFolderSchema.safeParse({
      name: 'Communities',
      spaceIds: [oid],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversationIds).toEqual([]);
      expect(result.data.spaceIds).toEqual([oid]);
    }
  });

  it('accepts mixed folders', () => {
    const result = CreateFolderSchema.safeParse({
      name: 'Mixed',
      conversationIds: [oid],
      spaceIds: [oid2],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty membership', () => {
    const result = CreateFolderSchema.safeParse({
      name: 'Empty',
      conversationIds: [],
      spaceIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('AddSpaceToFolderSchema', () => {
  it('requires a valid space id', () => {
    expect(AddSpaceToFolderSchema.safeParse({ spaceId: oid }).success).toBe(true);
    expect(AddSpaceToFolderSchema.safeParse({ spaceId: 'bad' }).success).toBe(false);
  });
});
