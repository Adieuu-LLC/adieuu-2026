#!/usr/bin/env bun
/**
 * One-off batch backfill for identity dashboard counters (`messagesSentCount`,
 * `conversationsJoinedCount`, `friendCount`, `achievementsEarnedCount`).
 *
 * Run from repo root:
 *   bun run apps/api/scripts/backfill-identity-activity-stats.ts
 *
 * Options:
 *   --dry-run   Log computed sizes and batches only; skip writes.
 *
 * Requires MongoDB reachable per app config (`MONGODB_URI`, etc.).
 */

import { ObjectId } from 'mongodb';
import {
  Collections,
  connectMongo,
  disconnectMongo,
  getCollection,
} from '../src/db/mongo';

const BATCH_SIZE = Number(process.env.BACKFILL_IDENTITY_STATS_BATCH ?? '500');

type StatsMerge = {
  friendCount?: number;
  messagesSentCount?: number;
  conversationsJoinedCount?: number;
  achievementsEarnedCount?: number;
};

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

function mergeAgg(
  target: Map<string, StatsMerge>,
  rows: { _id: ObjectId | null; count: number },
  field: Exclude<keyof StatsMerge, never>,
): void {
  const idVal = rows._id;
  if (!(idVal instanceof ObjectId)) return;
  const hex = idVal.toHexString();
  const prev = target.get(hex) ?? {};
  target.set(hex, { ...prev, [field]: rows.count });
}

async function main() {
  const dryRun = parseDryRun(process.argv.slice(2));

  console.log('Connecting…');
  await connectMongo();

  try {
    const friendships = getCollection(Collections.FRIENDSHIPS);
    const messages = getCollection(Collections.MESSAGES);
    const conversations = getCollection(Collections.CONVERSATIONS);
    const identityAchievements = getCollection(Collections.IDENTITY_ACHIEVEMENTS);

    const merged = new Map<string, StatsMerge>();

    console.log('Aggregating friendships…');
    const friendRows = (await friendships
      .aggregate([{ $group: { _id: '$identityId', count: { $sum: 1 } } }])
      .toArray()) as { _id: ObjectId; count: number }[];
    for (const row of friendRows) {
      mergeAgg(merged, { _id: row._id, count: row.count }, 'friendCount');
    }

    console.log('Aggregating messages (non-system sends)…');
    const msgRows = (await messages
      .aggregate([
        {
          $match: {
            fromIdentityId: { $exists: true, $type: 'objectId' },
            messageType: { $ne: 'system' },
          },
        },
        { $group: { _id: '$fromIdentityId', count: { $sum: 1 } } },
      ])
      .toArray()) as { _id: ObjectId; count: number }[];
    for (const row of msgRows) {
      mergeAgg(merged, { _id: row._id, count: row.count }, 'messagesSentCount');
    }

    console.log('Aggregating conversations (participant edges)…');
    const convRows = (await conversations
      .aggregate([
        {
          $match: {
            'participants.0': { $exists: true },
          },
        },
        { $unwind: '$participants' },
        { $group: { _id: '$participants', count: { $sum: 1 } } },
      ])
      .toArray()) as { _id: ObjectId; count: number }[];
    for (const row of convRows) {
      mergeAgg(merged, { _id: row._id, count: row.count }, 'conversationsJoinedCount');
    }

    console.log('Aggregating identity achievements…');
    const achRows = (await identityAchievements
      .aggregate([
        {
          $match: {
            identityId: { $exists: true, $type: 'objectId' },
          },
        },
        { $group: { _id: '$identityId', count: { $sum: 1 } } },
      ])
      .toArray()) as { _id: ObjectId; count: number }[];
    for (const row of achRows) {
      mergeAgg(merged, { _id: row._id, count: row.count }, 'achievementsEarnedCount');
    }

    const identities = getCollection(Collections.IDENTITIES);

    console.log(`Identities touched: ${merged.size}. Batch size ${BATCH_SIZE}. Dry run: ${dryRun}`);

    const entries = [...merged.entries()];
    let batches = 0;
    let updated = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);

      const bulk = chunk.map(([hex, s]) => ({
        updateOne: {
          filter: { _id: new ObjectId(hex) },
          update: {
            $set: {
              friendCount: s.friendCount ?? 0,
              messagesSentCount: s.messagesSentCount ?? 0,
              conversationsJoinedCount: s.conversationsJoinedCount ?? 0,
              achievementsEarnedCount: s.achievementsEarnedCount ?? 0,
            },
          },
        },
      }));

      batches += 1;
      if (dryRun) {
        updated += bulk.length;
        console.log(`[dry-run] batch ${batches}: ${bulk.length} updates`);
        continue;
      }

      const res = await identities.bulkWrite(bulk, { ordered: false });
      updated += res.modifiedCount;
      console.log(`Batch ${batches}: modified=${res.modifiedCount}, matched=${res.matchedCount}`);
    }

    console.log(
      `Done. Rows in merge map=${merged.size}, batches=${batches}, totalModified=${dryRun ? '(dry-run skipped)' : updated}.`,
    );
    if (dryRun) {
      console.log('Dry run complete — re-run without --dry-run to write.');
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
