import { afterEach, describe, expect, test } from 'bun:test';
import {
  MEDIA_OUTBOX_IDB_NAME,
} from './mediaOutboxConstants';
import {
  mediaOutboxDeleteJob,
  mediaOutboxListAllJobs,
  mediaOutboxPutJob,
} from './mediaOutboxDb';
import type { MediaOutboxJobRecord } from './mediaOutboxTypes';

function sampleJob(id: string, conversationId: string): MediaOutboxJobRecord {
  return {
    id,
    conversationId,
    stage: 'queued',
    createdAt: 1,
    updatedAt: 1,
    caption: '',
    mentionsJson: '[]',
    useForwardSecrecy: false,
    stripExif: true,
    attachmentBlobs: [],
  };
}

describe('mediaOutboxDb', () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(MEDIA_OUTBOX_IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  test('put list delete round-trip', async () => {
    const a = sampleJob('job-a', 'conv-1');
    const b = sampleJob('job-b', 'conv-2');
    await mediaOutboxPutJob(a);
    await mediaOutboxPutJob(b);
    const all = await mediaOutboxListAllJobs();
    expect(all.length).toBe(2);
    expect(all.some((j) => j.id === 'job-a')).toBe(true);
    await mediaOutboxDeleteJob('job-a');
    const rest = await mediaOutboxListAllJobs();
    expect(rest.length).toBe(1);
    expect(rest[0]!.id).toBe('job-b');
  });
});
