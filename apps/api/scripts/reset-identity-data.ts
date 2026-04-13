#!/usr/bin/env bun
/**
 * Identity Data Reset Script
 *
 * Drops all identity-dependent collections, resets user identity fields,
 * and recreates collections + indexes for the session separation schema.
 *
 * Run: bun run scripts/reset-identity-data.ts
 *
 * WARNING: This is destructive. Only suitable when all users are testers.
 */

import { connectMongo, getDb, disconnectMongo } from '../src/db/mongo';

const COLLECTIONS_TO_DROP = [
  'identities',
  'friendships',
  'friend_requests',
  'blocks',
  'conversations',
  'messages',
  'reactions',
  'group_invites',
  'key_bundles',
  'pre_keys',
  'identity_encrypted_prefs',
  'notifications',
  'community_themes',
  'media_uploads',
  'e2e_media',
  'platform_reports',
  'platform_report_events',
  'identity_counts',
  'identity_backup_codes',
  'mfa_backup_codes',
  'sessions',
  'user_preferences',
];

const COLLECTIONS_TO_KEEP = [
  'users',
  'totp_credentials',
  'webauthn_credentials',
  'platform_settings',
  'audit_logs',
];

async function main() {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  const db = getDb();

  const existing = await db.listCollections().toArray();
  const existingNames = new Set(existing.map((c) => c.name));

  // ---- Drop identity-dependent collections ----
  console.log('\n--- Dropping identity-dependent collections ---');
  for (const name of COLLECTIONS_TO_DROP) {
    if (existingNames.has(name)) {
      await db.dropCollection(name);
      console.log(`  Dropped: ${name}`);
    } else {
      console.log(`  Skipped (not found): ${name}`);
    }
  }

  // ---- Reset user identity fields ----
  console.log('\n--- Resetting user identity fields ---');
  const users = db.collection('users');
  const result = await users.updateMany(
    {},
    {
      $set: {
        identityCount: 0,
        identityLoginAttempts: [],
        identityLockoutDuration: 60 * 60 * 1000, // 1 hour default
      },
      $unset: {
        identityLockedUntil: '',
      },
    },
  );
  console.log(`  Updated ${result.modifiedCount} user documents`);

  // ---- Ensure maxIdentities default on users ----
  const noMax = await users.updateMany(
    { maxIdentities: { $exists: false } },
    { $set: { maxIdentities: 2 } },
  );
  console.log(`  Set maxIdentities=2 on ${noMax.modifiedCount} users missing the field`);

  // ---- Recreate sessions collection with new indexes ----
  console.log('\n--- Recreating sessions collection + indexes ---');
  await db.createCollection('sessions');

  const sessions = db.collection('sessions');
  await sessions.createIndex({ sessionId: 1 }, { unique: true });
  await sessions.createIndex({ userId: 1 });
  await sessions.createIndex({ identityId: 1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  console.log('  sessions: created (sessionId unique, userId, identityId, expiresAt TTL)');

  // ---- Create identity_counts collection ----
  console.log('\n--- Creating identity_counts collection + indexes ---');
  await db.createCollection('identity_counts');
  const identityCounts = db.collection('identity_counts');
  await identityCounts.createIndex({ accountHash: 1 }, { unique: true });
  console.log('  identity_counts: created (accountHash unique)');

  // ---- Recreate other dropped collections (empty, with indexes) ----
  console.log('\n--- Recreating other collections with indexes ---');

  await db.createCollection('identities');
  const identities = db.collection('identities');
  await identities.createIndex({ username: 1 }, { unique: true });
  await identities.createIndex({ identHash: 1 });
  console.log('  identities: created (username unique, identHash)');

  await db.createCollection('blocks');
  const blocks = db.collection('blocks');
  await blocks.createIndex({ blockerId: 1, blockedId: 1 }, { unique: true });
  await blocks.createIndex({ blockedId: 1 });
  console.log('  blocks: created (blockerId+blockedId unique, blockedId)');

  await db.createCollection('friend_requests');
  const friendRequests = db.collection('friend_requests');
  await friendRequests.createIndex({ fromId: 1, toId: 1, status: 1 });
  await friendRequests.createIndex({ toId: 1, status: 1 });
  console.log('  friend_requests: created (fromId+toId+status, toId+status)');

  await db.createCollection('friendships');
  const friendships = db.collection('friendships');
  await friendships.createIndex({ identityId: 1, friendId: 1 }, { unique: true });
  await friendships.createIndex({ friendId: 1 });
  console.log('  friendships: created (identityId+friendId unique, friendId)');

  await db.createCollection('notifications');
  const notifications = db.collection('notifications');
  await notifications.createIndex({ identityId: 1, createdAt: -1 });
  console.log('  notifications: created (identityId+createdAt)');

  await db.createCollection('key_bundles');
  const keyBundles = db.collection('key_bundles');
  await keyBundles.createIndex({ identityId: 1 }, { unique: true });
  console.log('  key_bundles: created (identityId unique)');

  await db.createCollection('conversations');
  const conversations = db.collection('conversations');
  await conversations.createIndex({ 'participants.identityId': 1 });
  await conversations.createIndex({ type: 1 });
  console.log('  conversations: created (participants.identityId, type)');

  await db.createCollection('messages');
  const messages = db.collection('messages');
  await messages.createIndex({ conversationId: 1, createdAt: -1 });
  console.log('  messages: created (conversationId+createdAt)');

  await db.createCollection('group_invites');
  const groupInvites = db.collection('group_invites');
  await groupInvites.createIndex({ conversationId: 1, inviteeId: 1 }, { unique: true });
  console.log('  group_invites: created (conversationId+inviteeId unique)');

  await db.createCollection('pre_keys');
  const preKeys = db.collection('pre_keys');
  await preKeys.createIndex({ identityId: 1, deviceId: 1, type: 1 });
  console.log('  pre_keys: created (identityId+deviceId+type)');

  await db.createCollection('reactions');
  console.log('  reactions: created');

  await db.createCollection('community_themes');
  console.log('  community_themes: created');

  await db.createCollection('identity_encrypted_prefs');
  console.log('  identity_encrypted_prefs: created');

  await db.createCollection('media_uploads');
  console.log('  media_uploads: created');

  await db.createCollection('e2e_media');
  console.log('  e2e_media: created');

  await db.createCollection('platform_reports');
  console.log('  platform_reports: created');

  await db.createCollection('platform_report_events');
  console.log('  platform_report_events: created');

  await db.createCollection('user_preferences');
  console.log('  user_preferences: created');

  // ---- Summary ----
  console.log('\n--- Kept (untouched) ---');
  for (const name of COLLECTIONS_TO_KEEP) {
    console.log(`  ${name}`);
  }

  console.log('\nDone. All identity data reset for fresh start.');

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
