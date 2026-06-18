#!/usr/bin/env bun
/**
 * Upserts official roadmap release entries into feedback_posts for the public timeline.
 *
 * Run from repo root:
 *   ROADMAP_SEED_AUTHOR_IDENTITY_ID=<24-char hex> bun run apps/api/scripts/seed-roadmap-releases.ts
 *
 * Or from apps/api:
 *   ROADMAP_SEED_AUTHOR_IDENTITY_ID=<24-char hex> bun run scripts/seed-roadmap-releases.ts
 *
 * Requires MONGODB_URI (and optional MONGODB_DB_NAME) in the environment.
 * Re-running is idempotent — rows are upserted by stable postId (FB-RM-xxx).
 */

import { ObjectId } from 'mongodb';
import { parseTargetReleaseDate } from '@adieuu/shared';
import { connectMongo, disconnectMongo, getDb } from '../src/db/mongo';
import { Collections } from '../src/db';
import { getIdentityRepository } from '../src/repositories/identity.repository';
import { ROADMAP_RELEASE_SEED } from './data/roadmap-releases.seed';

async function resolveAuthorIdentityId(): Promise<ObjectId> {
  const fromEnv = process.env.ROADMAP_SEED_AUTHOR_IDENTITY_ID?.trim();
  if (fromEnv) {
    if (!ObjectId.isValid(fromEnv)) {
      throw new Error(`Invalid ROADMAP_SEED_AUTHOR_IDENTITY_ID: ${fromEnv}`);
    }
    const identityRepo = getIdentityRepository();
    const identity = await identityRepo.findById(fromEnv);
    if (!identity) {
      throw new Error(`Identity not found for ROADMAP_SEED_AUTHOR_IDENTITY_ID: ${fromEnv}`);
    }
    return identity._id;
  }

  const identityRepo = getIdentityRepository();
  const fallback = await identityRepo.findOne({});
  if (!fallback) {
    throw new Error(
      'No identity found. Set ROADMAP_SEED_AUTHOR_IDENTITY_ID to a valid 24-char hex identity id.',
    );
  }
  console.warn(
    `ROADMAP_SEED_AUTHOR_IDENTITY_ID not set — using first identity (${fallback._id.toHexString()}).`,
  );
  return fallback._id;
}

async function main() {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  const db = getDb();
  const collection = db.collection(Collections.FEEDBACK_POSTS);
  const authorIdentityId = await resolveAuthorIdentityId();
  const now = new Date();

  let upserted = 0;
  for (const row of ROADMAP_RELEASE_SEED) {
    const releasedAt = parseTargetReleaseDate(row.releasedAt);
    if (!releasedAt) {
      throw new Error(`Invalid releasedAt for ${row.postId}: ${row.releasedAt}`);
    }

    const result = await collection.updateOne(
      { postId: row.postId },
      {
        $set: {
          postId: row.postId,
          identityId: authorIdentityId,
          title: row.title,
          description: row.description,
          category: row.category,
          status: 'released',
          attachmentMediaIds: [],
          attachmentUrls: [],
          upvoteCount: 0,
          commentCount: 0,
          hasStaffResponse: false,
          isOfficial: false,
          isRoadmapOfficial: true,
          isStaffAuthored: true,
          targetReleaseDate: releasedAt,
          releasedAt,
          statusChangedAt: releasedAt,
          statusChangedBy: authorIdentityId.toHexString(),
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: releasedAt,
        },
      },
      { upsert: true },
    );

    upserted += 1;
    const action = result.upsertedCount > 0 ? 'inserted' : 'updated';
    console.log(`  ${action} ${row.postId} [${row.tier}] ${row.releasedAt} — ${row.title}`);
  }

  const byDate = ROADMAP_RELEASE_SEED.reduce<Record<string, number>>((acc, row) => {
    acc[row.releasedAt] = (acc[row.releasedAt] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nDone. ${upserted} roadmap release posts upserted.`);
  console.log('Timeline groups:');
  for (const [date, count] of Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${date}: ${count} card${count === 1 ? '' : 's'}`);
  }

  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
