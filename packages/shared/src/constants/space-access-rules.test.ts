import { describe, expect, test } from 'bun:test';
import {
  evaluateSpaceJoin,
  tierMeetsMinimum,
  SPACE_OPEN_JOIN_MIN_TIER,
  type SpaceJoinContext,
} from './space-access-rules';
import type { SubscriptionTierId } from '../subscriptions';

describe('tierMeetsMinimum', () => {
  test('respects the free < access < insider hierarchy', () => {
    expect(tierMeetsMinimum('free', 'free')).toBe(true);
    expect(tierMeetsMinimum('free', 'access')).toBe(false);
    expect(tierMeetsMinimum('access', 'free')).toBe(true);
    expect(tierMeetsMinimum('access', 'access')).toBe(true);
    expect(tierMeetsMinimum('insider', 'access')).toBe(true);
    expect(tierMeetsMinimum('access', 'insider')).toBe(false);
  });
});

describe('evaluateSpaceJoin', () => {
  const base = (over: Partial<SpaceJoinContext>): SpaceJoinContext => ({
    visibility: 'public',
    allowFreeMembers: false,
    viaInvite: false,
    tier: 'free',
    ...over,
  });

  test('paid users can open-join public and listed spaces', () => {
    for (const visibility of ['public', 'listed'] as const) {
      expect(evaluateSpaceJoin(base({ visibility, tier: 'access' })).allowed).toBe(true);
    }
  });

  test('free users are blocked from open-joining public/listed by default', () => {
    for (const visibility of ['public', 'listed'] as const) {
      const decision = evaluateSpaceJoin(base({ visibility, tier: 'free' }));
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe('tier_required');
        expect(decision.minTier).toBe(SPACE_OPEN_JOIN_MIN_TIER);
      }
    }
  });

  test('allowFreeMembers lets free users open-join public/listed', () => {
    for (const visibility of ['public', 'listed'] as const) {
      expect(
        evaluateSpaceJoin(base({ visibility, tier: 'free', allowFreeMembers: true })).allowed
      ).toBe(true);
    }
  });

  test('hidden spaces cannot be open-joined regardless of tier or toggle', () => {
    const decision = evaluateSpaceJoin(
      base({ visibility: 'hidden', tier: 'insider', allowFreeMembers: true })
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('invite_required');
    }
  });

  test('invite path lets free users join any visibility, including hidden', () => {
    for (const visibility of ['public', 'listed', 'hidden'] as const) {
      expect(
        evaluateSpaceJoin(base({ visibility, tier: 'free', viaInvite: true })).allowed
      ).toBe(true);
    }
  });

  test('all tiers can join via invite', () => {
    for (const tier of ['free', 'access', 'insider'] as SubscriptionTierId[]) {
      expect(
        evaluateSpaceJoin(base({ visibility: 'hidden', tier, viaInvite: true })).allowed
      ).toBe(true);
    }
  });
});
