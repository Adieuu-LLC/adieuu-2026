/**
 * @module services/badge.service.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockAddEarnedBadge = mock(() => Promise.resolve(true)) as AnyMock;
const mockHasEarnedBadge = mock(() => Promise.resolve(false)) as AnyMock;

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    addEarnedBadge: mockAddEarnedBadge,
    hasEarnedBadge: mockHasEarnedBadge,
  }),
}));

const mockGetByIdentity = mock(() => Promise.resolve([])) as AnyMock;

mock.module('../repositories/achievement.repository', () => ({
  getAchievementRepository: () => ({
    getByIdentity: mockGetByIdentity,
  }),
}));

const mockCountDocuments = mock(() => Promise.resolve(50)) as AnyMock;

mock.module('../db', () => ({
  getCollection: () => ({
    countDocuments: mockCountDocuments,
  }),
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
    mockHasEarnedBadge.mockReset();
    mockGetByIdentity.mockReset();
    mockCountDocuments.mockReset();

    mockAddEarnedBadge.mockImplementation(() => Promise.resolve(true));
    mockHasEarnedBadge.mockImplementation(() => Promise.resolve(false));
    mockGetByIdentity.mockImplementation(() => Promise.resolve([]));
    mockCountDocuments.mockImplementation(() => Promise.resolve(50));
  });

  describe('awardOrderBadges', () => {
    test('awards both top100 and top1000 when count <= 100', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(42));
      const id = new ObjectId();
      await awardOrderBadges(id);

      expect(mockAddEarnedBadge).toHaveBeenCalledTimes(2);
      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top1000');
      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top100');
    });

    test('awards only top1000 when 100 < count <= 1000', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(500));
      const id = new ObjectId();
      await awardOrderBadges(id);

      expect(mockAddEarnedBadge).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top1000');
    });

    test('awards nothing when count > 1000', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(5000));
      const id = new ObjectId();
      await awardOrderBadges(id);

      expect(mockAddEarnedBadge).not.toHaveBeenCalled();
    });

    test('handles boundary count = 100 exactly', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(100));
      const id = new ObjectId();
      await awardOrderBadges(id);

      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top100');
      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top1000');
    });

    test('handles boundary count = 1000 exactly', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(1000));
      const id = new ObjectId();
      await awardOrderBadges(id);

      expect(mockAddEarnedBadge).toHaveBeenCalledTimes(1);
      expect(mockAddEarnedBadge).toHaveBeenCalledWith(id, 'top1000');
    });

    test('accepts string identity id', async () => {
      mockCountDocuments.mockImplementation(() => Promise.resolve(1));
      const id = new ObjectId();
      await awardOrderBadges(id.toHexString());

      expect(mockAddEarnedBadge).toHaveBeenCalledTimes(2);
    });

    test('swallows errors gracefully', async () => {
      mockCountDocuments.mockImplementation(() => Promise.reject(new Error('db down')));
      await awardOrderBadges(new ObjectId());
      expect(mockAddEarnedBadge).not.toHaveBeenCalled();
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
