import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentityDocument } from '../../models/identity';
import { DEFAULT_PRIVACY_SETTINGS } from '../../models/identity';
import type { PublicAchievementDefinition } from '../../models/achievement-definitions';
import type { RouteContext } from '../../router/types';

const mockPublicDef: PublicAchievementDefinition = {
  id: 'first_friend',
  name: 'achievements.firstFriend.name',
  description: 'achievements.firstFriend.description',
  icon: 'userPlus',
  category: 'social',
};

const mockGetAllDefinitions = mock(() => [mockPublicDef]);

const mockGetIdentityAchievements = mock(() =>
  Promise.resolve([
    {
      id: new ObjectId().toHexString(),
      achievementId: 'first_friend',
      awardedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      definition: mockPublicDef,
    },
  ]),
);

const mockGetAchievementHolderCount = mock(() => Promise.resolve(42));
const mockGetGlobalAchievementStats = mock(() =>
  Promise.resolve({ first_friend: 10, first_message: 3 }),
);
const mockCheckAndAward = mock(() => Promise.resolve());

mock.module('../../services/achievement.service', () => ({
  getAllDefinitions: mockGetAllDefinitions,
  getIdentityAchievements: mockGetIdentityAchievements,
  getAchievementHolderCount: mockGetAchievementHolderCount,
  getGlobalAchievementStats: mockGetGlobalAchievementStats,
  checkAndAward: mockCheckAndAward,
}));

const mockFindByIdentityId = mock((_id: string | ObjectId) => Promise.resolve<IdentityDocument | null>(null));
mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: mock(() => ({
    findByIdentityId: mockFindByIdentityId,
  })),
}));

const mockAreFriends = mock(() => Promise.resolve(false));
mock.module('../identity/profile.controller', () => ({
  areFriends: mockAreFriends,
}));

import {
  getDefinitionsResult,
  getMyAchievementsResult,
  getGlobalStatsResult,
  getAchievementStatsResult,
  claimAchievementResult,
  getIdentityAchievementsForTargetResult,
  respondIdentityAchievementsForTarget,
} from './controller';

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

function baseIdentity(overrides: Partial<IdentityDocument> = {}): IdentityDocument {
  const _id = new ObjectId();
  const now = new Date();
  return {
    _id,
    createdAt: now,
    updatedAt: now,
    ident: 'a'.repeat(64),
    hashVersion: 1,
    username: 'tester',
    displayName: 'Tester',
    lastActiveAt: now,
    privacySettings: { ...DEFAULT_PRIVACY_SETTINGS, achievements: 'public' },
    ...overrides,
  } as IdentityDocument;
}

describe('achievements controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockGetAllDefinitions.mockClear();
    mockGetIdentityAchievements.mockClear();
    mockGetAchievementHolderCount.mockClear();
    mockGetGlobalAchievementStats.mockClear();
    mockCheckAndAward.mockClear();
    mockFindByIdentityId.mockClear();
    mockAreFriends.mockClear();

    mockGetAllDefinitions.mockImplementation(() => [mockPublicDef]);
    mockGetIdentityAchievements.mockImplementation(() =>
      Promise.resolve([
        {
          id: new ObjectId().toHexString(),
          achievementId: 'first_friend',
          awardedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
          definition: mockPublicDef,
        },
      ]),
    );
    mockGetAchievementHolderCount.mockImplementation(() => Promise.resolve(42));
    mockGetGlobalAchievementStats.mockImplementation(() =>
      Promise.resolve({ first_friend: 10, first_message: 3 }),
    );
    mockCheckAndAward.mockImplementation(() => Promise.resolve());
    mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
    mockAreFriends.mockImplementation(() => Promise.resolve(false));
  });

  describe('getDefinitionsResult', () => {
    test('returns definitions from service', async () => {
      const result = await getDefinitionsResult();
      expect(result.ok).toBe(true);
      expect(result.definitions).toEqual([mockPublicDef]);
      expect(mockGetAllDefinitions).toHaveBeenCalled();
    });
  });

  describe('getMyAchievementsResult', () => {
    test('returns achievements for identity', async () => {
      const oid = new ObjectId();
      const result = await getMyAchievementsResult(oid);
      expect(result.ok).toBe(true);
      expect(result.achievements.length).toBe(1);
      expect(mockGetIdentityAchievements).toHaveBeenCalledWith(oid);
    });
  });

  describe('getGlobalStatsResult', () => {
    test('returns stats record', async () => {
      const result = await getGlobalStatsResult();
      expect(result.ok).toBe(true);
      expect(result.stats).toEqual({ first_friend: 10, first_message: 3 });
    });
  });

  describe('getAchievementStatsResult', () => {
    test('not_found when id unknown after sanitize', async () => {
      const result = await getAchievementStatsResult('not_in_map');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
      expect(mockGetAchievementHolderCount).not.toHaveBeenCalled();
    });

    test('not_found for empty param', async () => {
      const result = await getAchievementStatsResult(undefined);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    test('success for known achievement id with junk stripped by idenhanced', async () => {
      const result = await getAchievementStatsResult('first_friend\u200B');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.achievementId).toBe('first_friend');
      expect(result.holderCount).toBe(42);
      expect(mockGetAchievementHolderCount).toHaveBeenCalledWith('first_friend');
    });
  });

  describe('claimAchievementResult', () => {
    test('bad_request when action missing', async () => {
      const oid = new ObjectId();
      expect(await claimAchievementResult(oid, {})).toEqual({ ok: false, reason: 'bad_request' });
      expect(await claimAchievementResult(oid, { action: 1 })).toEqual({
        ok: false,
        reason: 'bad_request',
      });
      expect(mockCheckAndAward).not.toHaveBeenCalled();
    });

    test('bad_request when action not claimable', async () => {
      const oid = new ObjectId();
      const result = await claimAchievementResult(oid, { action: 'not_claimable' });
      expect(result).toEqual({ ok: false, reason: 'bad_request' });
    });

    test('success calls checkAndAward with sanitized action', async () => {
      const oid = new ObjectId();
      const result = await claimAchievementResult(oid, { action: 'theme_saved\u200B' });
      expect(result).toEqual({ ok: true });
      expect(mockCheckAndAward).toHaveBeenCalledWith(oid, 'theme_saved');
    });
  });

  describe('getIdentityAchievementsForTargetResult', () => {
    test('bad_request for invalid object id', async () => {
      const result = await getIdentityAchievementsForTargetResult('!!!', null);
      expect(result).toEqual({ ok: false, reason: 'bad_request' });
      expect(mockFindByIdentityId).not.toHaveBeenCalled();
    });

    test('not_found when target identity missing', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await getIdentityAchievementsForTargetResult(VALID_OBJECT_ID, null);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    test('stranger + private achievements yields empty list', async () => {
      const target = baseIdentity({
        _id: new ObjectId(VALID_OBJECT_ID),
        privacySettings: { ...DEFAULT_PRIVACY_SETTINGS, achievements: 'private' },
      });
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(target));

      const result = await getIdentityAchievementsForTargetResult(VALID_OBJECT_ID, null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.achievements).toEqual([]);
      expect(result.stripAwardedAt).toBe(true);
      expect(mockGetIdentityAchievements).not.toHaveBeenCalled();
    });

    test('viewer self receives full achievements without strip flag false', async () => {
      const target = baseIdentity({ _id: new ObjectId(VALID_OBJECT_ID) });
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(target));

      const viewerId = new ObjectId(VALID_OBJECT_ID);
      const result = await getIdentityAchievementsForTargetResult(VALID_OBJECT_ID, viewerId);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.stripAwardedAt).toBe(false);
      expect(mockGetIdentityAchievements).toHaveBeenCalled();
    });

    test('public profile returns achievements and strips dates for non-self', async () => {
      const target = baseIdentity();
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(target));

      const result = await getIdentityAchievementsForTargetResult(target._id.toHexString(), null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.stripAwardedAt).toBe(true);
      expect(result.achievements.length).toBe(1);
    });

    test('friends-only + friend viewer loads achievements', async () => {
      const target = baseIdentity({
        privacySettings: { ...DEFAULT_PRIVACY_SETTINGS, achievements: 'friends' },
      });
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(target));
      mockAreFriends.mockImplementation(() => Promise.resolve(true));

      const viewerId = new ObjectId();
      const result = await getIdentityAchievementsForTargetResult(target._id.toHexString(), viewerId);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(mockGetIdentityAchievements).toHaveBeenCalled();
    });
  });

  describe('respondIdentityAchievementsForTarget', () => {
    test('maps not_found to 404 response', async () => {
      const ctx = {
        errors: {
          badRequest: () => new Response('bad', { status: 400 }),
        },
      } as unknown as RouteContext;

      const res = respondIdentityAchievementsForTarget(ctx, {
        ok: false,
        reason: 'not_found',
      });

      expect(res.status).toBe(404);
    });

    test('strips awardedAt when stripAwardedAt is true', async () => {
      const ctx = { errors: { badRequest: () => new Response() } } as unknown as RouteContext;

      const res = respondIdentityAchievementsForTarget(ctx, {
        ok: true,
        stripAwardedAt: true,
        achievements: [
          {
            id: 'aid',
            achievementId: 'first_friend',
            awardedAt: '2026-01-01T00:00:00.000Z',
            definition: mockPublicDef,
          },
        ],
      });

      const body = (await res.json()) as { success: boolean; data: { achievements: unknown[] } };
      expect(body.success).toBe(true);
      expect(body.data.achievements[0]).not.toHaveProperty('awardedAt');
    });
  });
});
