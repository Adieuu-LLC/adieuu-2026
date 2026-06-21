/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentityContext } from '../../middleware/identity-session';
import type { IdentityDocument } from '../../models/identity';

const identityId = new ObjectId();
const identity = {
  _id: identityId,
  username: 'staffdev',
  displayName: 'Staff Dev',
  entitlementOverrides: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as IdentityDocument;

const mockCreateFeedbackPost = mock((): any =>
  Promise.resolve({ success: true, data: { postId: 'FB-new1234' } }),
);
const mockGetRoadmapTimelinePosts = mock((): any =>
  Promise.resolve({ success: true, data: { posts: [] } }),
);
const mockResolveFeedbackAuthors = mock((): any => Promise.resolve(new Map()));
const mockBuildAttachmentList = mock((): any => Promise.resolve([]));

mock.module('../../services/feedback.service', () => ({
  createFeedbackPost: mockCreateFeedbackPost,
  getRoadmapTimelinePosts: mockGetRoadmapTimelinePosts,
  resolveFeedbackAuthors: mockResolveFeedbackAuthors,
  buildAttachmentList: mockBuildAttachmentList,
  addFeedbackComment: mock(async () => ({ success: true, data: { commentId: 'c1' } })),
  getFeedbackPostDetail: mock(async () => ({ success: false, errorCode: 'NOT_FOUND' })),
  listFeedbackPosts: mock(async () => ({ success: true, data: { posts: [], total: 0, votedPostIds: new Set() } })),
  removeFeedbackUpvote: mock(async () => ({ success: true, data: undefined })),
  upvoteFeedbackPost: mock(async () => ({ success: true, data: undefined })),
  updateFeedbackStatus: mock(async () => ({ success: true, data: undefined })),
  updateFeedbackRoadmap: mock(async () => ({ success: true, data: undefined })),
}));

const mockFindByIdentityId = mock(async (): Promise<{
  notifyPostReplies: boolean;
  notifyCommentReplies: boolean;
} | null> => null);
const mockUpsertPrefs = mock(async (_id: ObjectId, input: any) => ({
  notifyPostReplies: input.notifyPostReplies ?? true,
  notifyCommentReplies: input.notifyCommentReplies ?? true,
}));
mock.module('../../repositories/feedback-notification-prefs.repository', () => ({
  getFeedbackNotificationPrefsRepository: () => ({
    findByIdentityId: mockFindByIdentityId,
    upsert: mockUpsertPrefs,
  }),
}));

const {
  CreateFeedbackPostSchema,
  createPostResult,
  getRoadmapTimelineResult,
  updateNotificationPrefsResult,
} = await import('./controller');

function makeCtx(entitlements: string[] = []): IdentityContext {
  return {
    identity,
    sessionId: 'session-1',
    maxVideoDurationSeconds: 300,
    subscriptions: [],
    entitlements,
    isLifetime: false,
  };
}

describe('feedback/controller', () => {
  beforeEach(() => {
    mockCreateFeedbackPost.mockClear();
    mockGetRoadmapTimelinePosts.mockClear();
    mockResolveFeedbackAuthors.mockClear();
    mockFindByIdentityId.mockClear();
    mockUpsertPrefs.mockClear();
    mockCreateFeedbackPost.mockResolvedValue({ success: true, data: { postId: 'FB-new1234' } });
    mockGetRoadmapTimelinePosts.mockResolvedValue({ success: true, data: { posts: [] } });
    mockResolveFeedbackAuthors.mockResolvedValue(new Map());
  });

  test('CreateFeedbackPostSchema accepts roadmap fields and rejects invalid date', () => {
    const valid = CreateFeedbackPostSchema.safeParse({
      title: 'Roadmap',
      description: 'Details',
      category: 'feature',
      isRoadmapOfficial: true,
      targetReleaseDate: '2026-06-01',
      status: 'planned',
    });
    expect(valid.success).toBe(true);

    const invalidDate = CreateFeedbackPostSchema.safeParse({
      title: 'Roadmap',
      description: 'Details',
      category: 'feature',
      targetReleaseDate: '06/01/2026',
    });
    expect(invalidDate.success).toBe(false);

    const invalidStatus = CreateFeedbackPostSchema.safeParse({
      title: 'Roadmap',
      description: 'Details',
      category: 'feature',
      status: 'not-a-status',
    });
    expect(invalidStatus.success).toBe(false);
  });

  test('createPostResult maps validation failures', async () => {
    const result = await createPostResult(makeCtx(), { title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation_failed');
  });

  test('createPostResult maps forbidden service errors', async () => {
    mockCreateFeedbackPost.mockResolvedValueOnce({
      success: false,
      error: 'Forbidden',
      errorCode: 'FORBIDDEN',
    });

    const result = await createPostResult(makeCtx(['adieuu-dev']), {
      title: 'Roadmap',
      description: 'Details',
      category: 'feature',
      isRoadmapOfficial: true,
      status: 'planned',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  test('createPostResult returns postId on success', async () => {
    const result = await createPostResult(makeCtx(['adieuu-dev']), {
      title: 'Roadmap',
      description: 'Details',
      category: 'feature',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.postId).toBe('FB-new1234');
  });

  test('getRoadmapTimelineResult returns empty timeline groups', async () => {
    const result = await getRoadmapTimelineResult();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.past).toEqual([]);
      expect(result.data.future).toEqual([]);
    }
  });

  test('updateNotificationPrefsResult ignores removed notifyOfficialPosts field', async () => {
    const result = await updateNotificationPrefsResult(makeCtx(), {
      notifyOfficialPosts: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('bad_request');
  });
});

afterAll(() => {
  mock.restore();
});
