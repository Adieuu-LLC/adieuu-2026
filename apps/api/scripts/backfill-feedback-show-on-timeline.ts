#!/usr/bin/env bun
/**
 * One-off migration: backfill the new `showOnTimeline` field on feedback posts.
 *
 * Timeline membership is now driven by an explicit `showOnTimeline` boolean.
 * For existing posts we seed it from the historical "official/staff" signals:
 * a post is placed on the timeline if it is (legacy) official, roadmap-official,
 * or staff-authored; otherwise it is off the timeline.
 *
 * Idempotent — only touches documents that don't already have the field, so it
 * won't clobber manual toggles made through the UI.
 *
 * Connection string resolution (first match wins):
 *   1. `--uri <connection-string>` CLI flag
 *   2. `MONGODB_URI` environment variable
 * The database name comes from `MONGODB_DB_NAME` (defaults to `adieuu`), or can
 * be embedded in the URI path.
 *
 * Examples:
 *   # local (loads apps/api/.env from this directory)
 *   cd apps/api && bun --env-file=.env run scripts/backfill-feedback-show-on-timeline.ts
 *
 *   # explicit / prod — no .env ambiguity
 *   bun run apps/api/scripts/backfill-feedback-show-on-timeline.ts --uri "mongodb+srv://user:pass@cluster/adieuu"
 */

import { MongoClient } from 'mongodb';

function parseUriArg(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf('--uri');
  if (flagIndex !== -1) return argv[flagIndex + 1];
  const inline = argv.find((arg) => arg.startsWith('--uri='));
  return inline?.slice('--uri='.length);
}

/** Hide credentials in a connection string before logging it. */
function maskUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

async function main() {
  const uri = parseUriArg(process.argv.slice(2)) ?? process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      'No MongoDB connection string found. Pass --uri <connection-string> or set MONGODB_URI.',
    );
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB_NAME ?? 'adieuu';

  console.log(`Connecting to ${maskUri(uri)} (db: ${dbName})...`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  try {
    const collection = client.db(dbName).collection('feedback_posts');

    const officialMatch = {
      $or: [
        { isOfficial: true },
        { isRoadmapOfficial: true },
        { isStaffAuthored: true },
      ],
    };

    const onTimeline = await collection.updateMany(
      { showOnTimeline: { $exists: false }, ...officialMatch },
      { $set: { showOnTimeline: true } },
    );

    const offTimeline = await collection.updateMany(
      { showOnTimeline: { $exists: false }, $nor: [officialMatch] },
      { $set: { showOnTimeline: false } },
    );

    console.log(`Marked ${onTimeline.modifiedCount} post(s) showOnTimeline=true.`);
    console.log(`Marked ${offTimeline.modifiedCount} post(s) showOnTimeline=false.`);
    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
