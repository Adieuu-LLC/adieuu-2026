/**
 * @module services/badge.service.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockAddEarnedBadge = mock(() => Promise.resolve(true)) as AnyMock;
const mockAddEarnedBadges = mock(() => Promise.resolve(true)) as AnyMock;
const mockHasEarnedBadge = mock(() => Promise.resolve(false)) as AnyMock;

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    addEarnedBadge: mockAddEarnedBadge,
    addEarnedBadges: mockAddEarnedBadges,
    hasEarnedBadge: mockHasEarnedBadge,
  }),
}));

const mockGetByIdentity = mock(() => Promise.resolve([])) as AnyMock;

mock.module('../repositories/achievement.repository', () => ({
  getAchievementRepository: () => ({
    getByIdentity: mockGetByIdentity,
  }),
}));

mock.module('../db', () => ({
  Collections: {
    IDENTITIES: 'identities',
    IDENTITY_ACHIEVEMENTS: 'identity_achievements',
  },
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  },
}));

import { awardOrderBadges, checkOverachieverBadge } from './badge.service';
import { ACHIEVEMENT_DEFINITIONS } from '../models/achievement-definitions';

afterAll(() => {
  mock.restore();
});

describe('badge.service', () => {
  beforeEach(() => {
    mockAddEarnedBadge.mockReset();
    mockAddEarnedBadges.mockReset();
    mockHasEarnedBadge.mockReset();
    mockGetByIdentity.mockReset();

    mockAddEarnedBadge.mockImplementation(() => Promise.resolve(true));
    mockAddEarnedBadges.mockImplementation(() => Promise.resolve(true));
    mockHasEarnedBadge.mockImplementation(() => Promise.resolve(false));
    mockGetByIdentity.mockImplementation(() => Promise.resolve([]));
  });

  describe('awardOrderBadges', () => {
    test('awards both top100 and top1000 when creationOrder <= 100', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id, 42);

      expect(mockAddEarnedBadges).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadges).toHaveBeenCalledWith(id, ['top1000', 'top100']);
    });

    test('awards only top1000 when 100 < creationOrder <= 1000', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id, 500);

      expect(mockAddEarnedBadges).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadges).toHaveBeenCalledWith(id, ['top1000']);
    });

    test('short-circuits when creationOrder > 1000', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id, 5000);

      expect(mockAddEarnedBadges).not.toHaveBeenCalled();
    });

    test('handles boundary creationOrder = 100 exactly', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id, 100);

      expect(mockAddEarnedBadges).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadges).toHaveBeenCalledWith(id, ['top1000', 'top100']);
    });

    test('handles boundary creationOrder = 1000 exactly', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id, 1000);

      expect(mockAddEarnedBadges).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadges).toHaveBeenCalledWith(id, ['top1000']);
    });

    test('accepts string identity id', async () => {
      const id = new ObjectId();
      await awardOrderBadges(id.toHexString(), 1);

      expect(mockAddEarnedBadges).toHaveBeenCalledTimes(1);
    });

    test('swallows errors gracefully', async () => {
      mockAddEarnedBadges.mockImplementation(() => Promise.reject(new Error('db down')));
      await awardOrderBadges(new ObjectId(), 50);
      expect(mockAddEarnedBadges).toHaveBeenCalled();
    });
  });

  describe('checkOverachieverBadge', () => {
    const nonEntitlementDefs = ACHIEVEMENT_DEFINITIONS.filter(
      (d) => d.trigger.type !== 'entitlement',
    );

    function makeEarnedDocs(ids: string[]) {
      return ids.map((id) => ({
        _id: new ObjectId(),
        identityId: new ObjectId(),
        achievementId: id,
        awardedAt: new Date(),
      }));
    }

    test('awards overachiever when all non-entitlement achievements are earned', async () => {
      const allIds = nonEntitlementDefs.map((d) => d.id);
      mockGetByIdentity.mockImplementation(() => Promise.resolve(makeEarnedDocs(allIds)));
      const id = new ObjectId();

      await checkOverachieverBadge(id);

      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'overachiever');
    });

    test('does not award overachiever when some achievements are missing', async () => {
      const partialIds = nonEntitlementDefs.slice(0, 5).map((d) => d.id);
      mockGetByIdentity.mockImplementation(() => Promise.resolve(makeEarnedDocs(partialIds)));
      const id = new ObjectId();

      await checkOverachieverBadge(id);

      expect(mockAddEarnedBadge).not.toHaveBeenCalled();
    });

    test('skips if identity already has the overachiever badge', async () => {
      mockHasEarnedBadge.mockImplementation(() => Promise.resolve(true));
      const id = new ObjectId();

      await checkOverachieverBadge(id);

      expect(mockGetByIdentity).not.toHaveBeenCalled();
      expect(mockAddEarnedBadge).not.toHaveBeenCalled();
    });

    test('accepts string identity id', async () => {
      const allIds = nonEntitlementDefs.map((d) => d.id);
      mockGetByIdentity.mockImplementation(() => Promise.resolve(makeEarnedDocs(allIds)));
      const id = new ObjectId();

      await checkOverachieverBadge(id.toHexString());

      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'overachiever');
    });

    test('swallows errors gracefully', async () => {
      mockHasEarnedBadge.mockImplementation(() => Promise.reject(new Error('db down')));
      await checkOverachieverBadge(new ObjectId());
      expect(mockAddEarnedBadge).not.toHaveBeenCalled();
    });
  });
});
