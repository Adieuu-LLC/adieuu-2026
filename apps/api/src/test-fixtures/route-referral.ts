/**
 * Test fixtures for referral routes and services.
 */

import { ObjectId } from 'mongodb';
import type { ReferralAttributionDocument, ReferralCodeDocument } from '../models/referral';
import type { UserDocument } from '../models/user';
import { getCollection, Collections } from '../db/mongo';
import { withTimestamps } from '../models/base';

export async function createTestReferralCode(
  userId: ObjectId,
  overrides: Partial<Omit<ReferralCodeDocument, '_id' | 'createdAt' | 'updatedAt'>> = {},
): Promise<ReferralCodeDocument> {
  const collection = getCollection<ReferralCodeDocument>(Collections.REFERRAL_CODES);
  const doc = withTimestamps({
    userId,
    code: overrides.code ?? `ref-${new ObjectId().toHexString().slice(-8)}`,
    previousVersions: overrides.previousVersions ?? [],
    customMessage: overrides.customMessage,
    useCount: overrides.useCount ?? 0,
    signupCount: overrides.signupCount ?? 0,
    subscriptionCount: overrides.subscriptionCount ?? 0,
    isDeleted: overrides.isDeleted ?? false,
    deletedAt: overrides.deletedAt,
  }) as ReferralCodeDocument;

  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function createTestReferralAttribution(
  referrerId: ObjectId,
  referredUserId: ObjectId,
  referralCode: ReferralCodeDocument,
  overrides: Partial<Omit<ReferralAttributionDocument, '_id' | 'createdAt' | 'updatedAt'>> = {},
): Promise<ReferralAttributionDocument> {
  const collection = getCollection<ReferralAttributionDocument>(Collections.REFERRAL_ATTRIBUTIONS);
  const doc = withTimestamps({
    referrerId,
    referredUserId,
    referralCodeId: referralCode._id,
    code: referralCode.code,
    attributedAt: overrides.attributedAt ?? new Date(),
    creditGranted: overrides.creditGranted ?? false,
    creditGrantedAt: overrides.creditGrantedAt,
    creditAmountCents: overrides.creditAmountCents,
    promoBlockedCredit: overrides.promoBlockedCredit ?? false,
  }) as ReferralAttributionDocument;

  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function createReferredUserWithAttribution(
  referrer: UserDocument,
  referralCode: ReferralCodeDocument,
  referredUser: UserDocument,
): Promise<ReferralAttributionDocument> {
  const users = getCollection<UserDocument>(Collections.USERS);
  await users.updateOne(
    { _id: referredUser._id },
    { $set: { referredBy: referrer._id, updatedAt: new Date() } },
  );
  return createTestReferralAttribution(referrer._id, referredUser._id, referralCode);
}
