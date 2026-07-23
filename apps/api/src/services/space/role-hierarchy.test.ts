/**
 * Unit tests for role-position hierarchy helpers.
 *
 * @module services/space/role-hierarchy.test
 */

import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { actorOutranksMember, canActOnRolePosition, topRolePosition } from './role-hierarchy';

describe('space/role-hierarchy', () => {
  describe('topRolePosition', () => {
    test('returns the lowest position among held roles', () => {
      const a = new ObjectId();
      const b = new ObjectId();
      const roles = [
        { _id: a, position: 10 },
        { _id: b, position: 3 },
        { _id: new ObjectId(), position: 0 },
      ];
      expect(topRolePosition([a, b], roles)).toBe(3);
    });

    test('returns null when the member holds no known roles', () => {
      expect(topRolePosition([new ObjectId()], [{ _id: new ObjectId(), position: 1 }])).toBeNull();
      expect(topRolePosition([], [{ _id: new ObjectId(), position: 1 }])).toBeNull();
    });

    test('treats a missing position as 0 (highest rank)', () => {
      const a = new ObjectId();
      expect(topRolePosition([a], [{ _id: a }])).toBe(0);
    });
  });

  describe('canActOnRolePosition', () => {
    test('allows only roles strictly below the actor', () => {
      expect(canActOnRolePosition(5, 6)).toBe(true);
      expect(canActOnRolePosition(5, 5)).toBe(false);
      expect(canActOnRolePosition(5, 4)).toBe(false);
    });

    test('denies everything when the actor has no ranked roles', () => {
      expect(canActOnRolePosition(null, 1000)).toBe(false);
    });
  });

  describe('actorOutranksMember', () => {
    test('requires strictly higher rank', () => {
      expect(actorOutranksMember(1, 10)).toBe(true);
      expect(actorOutranksMember(10, 10)).toBe(false);
      expect(actorOutranksMember(10, 1)).toBe(false);
    });

    test('unranked targets are outranked; unranked actors never outrank', () => {
      expect(actorOutranksMember(5, null)).toBe(true);
      expect(actorOutranksMember(null, 5)).toBe(false);
      expect(actorOutranksMember(null, null)).toBe(false);
    });
  });
});
