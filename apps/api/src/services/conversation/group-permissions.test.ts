import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { ConversationDocument } from '../../models/conversation';
import { isGroupAdmin, canManageConversationPins } from './group-permissions';

function baseConv(overrides: Partial<ConversationDocument>): ConversationDocument {
  const id = () => new ObjectId();
  return {
    _id: id(),
    type: 'group',
    participants: [id(), id()],
    createdBy: id(),
    admins: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('isGroupAdmin', () => {
  test('when admins array is non-empty, membership in admins determines admin', () => {
    const adminId = new ObjectId();
    const otherId = new ObjectId();
    const conv = baseConv({
      createdBy: otherId,
      admins: [adminId],
    });
    expect(isGroupAdmin(conv, adminId)).toBe(true);
    expect(isGroupAdmin(conv, otherId)).toBe(false);
  });

  test('when admins array is empty, falls back to createdBy', () => {
    const creatorId = new ObjectId();
    const conv = baseConv({
      createdBy: creatorId,
      admins: [],
    });
    expect(isGroupAdmin(conv, creatorId)).toBe(true);
    expect(isGroupAdmin(conv, new ObjectId())).toBe(false);
  });
});

describe('canManageConversationPins', () => {
  test('DM: both participants can manage', () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const conv = baseConv({
      type: 'dm',
      participants: [a, b],
      createdBy: a,
      admins: [],
    });
    expect(canManageConversationPins(conv, a)).toBe(true);
    expect(canManageConversationPins(conv, b)).toBe(true);
  });

  test('group: only admins', () => {
    const adminId = new ObjectId();
    const memberId = new ObjectId();
    const conv = baseConv({
      participants: [adminId, memberId],
      createdBy: adminId,
      admins: [adminId],
    });
    expect(canManageConversationPins(conv, adminId)).toBe(true);
    expect(canManageConversationPins(conv, memberId)).toBe(false);
  });

  test('non-participant cannot manage', () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const conv = baseConv({
      type: 'dm',
      participants: [a, b],
      createdBy: a,
      admins: [],
    });
    expect(canManageConversationPins(conv, new ObjectId())).toBe(false);
  });
});
