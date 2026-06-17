/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentityDocument } from '../models/identity';
import type { FeedbackPostDocument } from '../models/feedback-post';

const ADIEUU_DEV_ENTITLEMENT = 'adieuu-dev';

const identityId = new ObjectId();
const identity = {
  _id: identityId,
  username: 'staffdev',
  displayName: 'Staff Dev',
  entitlementOverrides: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as IdentityDocument;

const mockCheckRateLimit = mock(() => Promise.resolve({ allowed: true, remaining: 9 }));
mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const mockCreatePost = mock(async (_input: unknown): Promise<FeedbackPostDocument | null> => null);
const mockFindByPostId = mock((): any => Promise.resolve(null));
const mockUpdateStatus = mock((): any => Promise.resolve(null));
const mockListRoadmapTimelinePosts = mock((): any => Promise.resolve([]));

mock.module('../repositories/feedback-post.repository', () => ({
  getFeedbackPostRepository: () => ({
    createPost: mockCreatePost,
    findByPostId: mockFindByPostId,
    updateStatus: mockUpdateStatus,
    listRoadmapTimelinePosts: mockListRoadmapTimelinePosts,
  }),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    findByMediaId: mock(async () => null),
  }),
}));

const mockGetPlatformCapabilities = mock((): any =>
  Promise.resolve({ isPlatformAdmin: false, isPlatformModerator: false }),
);
mock.module('./platform-capabilities.service', () => ({
  getPlatformCapabilities: mockGetPlatformCapabilities,
}));

const mockCheckAndAward = mock(() => Promise.resolve());
mock.module('./achievement.service', () => ({
  checkAndAward: mockCheckAndAward,
}));

mock.module('../utils/sanitize', () => ({
  sanitizeString: (raw: string) => ({ value: raw }),
}));

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

mock.module('../utils/adieuuLogger', () => ({
  default: logger,
  adieuuLogger: logger,
}));

mock.module('./notification.service', () => ({
  createNotification: mock(async () => {}),
}));

mock.module('../db', () => ({
  withTransaction: mock(async (fn: (session: undefined) => Promise<unknown>) => fn(undefined)),
}));

mock.module('../repositories/feedback-vote.repository', () => ({
  getFeedbackVoteRepository: () => ({
    findVotedPostIds: mock(async () => new Set<string>()),
  }),
}));

mock.module('../repositories/feedback-comment.repository', () => ({
  getFeedbackCommentRepository: () => ({
    findByCommentId: mock(async () => null),
  }),
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findById: mock(async () => null),
  }),
}));

mock.module('../repositories/feedback-notification-prefs.repository', () => ({
  getFeedbackNotificationPrefsRepository: () => ({
    findByIdentityId: mock(async () => null),
  }),
}));

const {
  createFeedbackPost,
  updateFeedbackStatus,
  getRoadmapTimelinePosts,
} = await import('./feedback.service');

function makeCreatedPost(overrides: Partial<FeedbackPostDocument> = {}): FeedbackPostDocument {
  return {
    _id: new ObjectId(),
    postId: 'FB-created',
    identityId,
    title: 'Title',
    description: 'Description',
    category: 'feature',
    status: 'submitted',
    attachmentMediaIds: [],
    attachmentUrls: [],
    upvoteCount: 0,
    commentCount: 0,
    hasStaffResponse: false,
    isRoadmapOfficial: false,
    isStaffAuthored: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FeedbackPostDocument;
}

function setStaffDevCapabilities() {
  mockGetPlatformCapabilities.mockResolvedValue({
    isPlatformAdmin: true,
    isPlatformModerator: false,
  });
}

describe('feedback.service', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockClear();
    mockCreatePost.mockClear();
    mockFindByPostId.mockClear();
    mockUpdateStatus.mockClear();
    mockListRoadmapTimelinePosts.mockClear();
    mockCheckAndAward.mockClear();
    mockGetPlatformCapabilities.mockReset();
    mockGetPlatformCapabilities.mockResolvedValue({
      isPlatformAdmin: false,
      isPlatformModerator: false,
    });
    mockCreatePost.mockImplementation(async (input: unknown) =>
      makeCreatedPost({
        ...(input as Partial<FeedbackPostDocument>),
        postId: (input as { postId?: string }).postId ?? 'FB-created',
        status: (input as { status?: FeedbackPostDocument['status'] }).status,
        isRoadmapOfficial: (input as { isRoadmapOfficial?: boolean }).isRoadmapOfficial,
        targetReleaseDate: (input as { targetReleaseDate?: Date }).targetReleaseDate,
      }),
    );
    mockUpdateStatus.mockImplementation(async (...args: unknown[]) =>
      makeCreatedPost({ postId: args[0] as string }),
    );
  });

  test('createFeedbackPost defaults non-privileged submissions to submitted', async () => {
    const result = await createFeedbackPost(identity, {
      title: 'My idea',
      description: 'Details here',
      category: 'feature',
    });

    expect(result.success).toBe(true);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'submitted',
        isRoadmapOfficial: false,
      }),
    );
  });

  test('createFeedbackPost allows empty description for staff with adieuu-dev', async () => {
    setStaffDevCapabilities();

    const result = await createFeedbackPost(
      identity,
      {
        title: 'Roadmap item',
        description: '',
        category: 'feature',
      },
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(true);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '',
        isStaffAuthored: true,
      }),
    );
  });

  test('createFeedbackPost rejects empty description for regular users', async () => {
    const result = await createFeedbackPost(identity, {
      title: 'My idea',
      description: '',
      category: 'feature',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('BODY_TOO_LONG');
  });

  test('createFeedbackPost rejects privileged fields without staff dev access', async () => {
    const result = await createFeedbackPost(
      identity,
      {
        title: 'Roadmap item',
        description: 'Details here',
        category: 'feature',
        isRoadmapOfficial: true,
        status: 'roadmapped',
      },
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('FORBIDDEN');
  });

  test('createFeedbackPost allows privileged create for staff with adieuu-dev', async () => {
    setStaffDevCapabilities();

    const result = await createFeedbackPost(
      identity,
      {
        title: 'Roadmap item',
        description: 'Details here',
        category: 'feature',
        isRoadmapOfficial: true,
        status: 'roadmapped',
      },
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(true);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'roadmapped',
        isRoadmapOfficial: true,
        isStaffAuthored: true,
      }),
    );
  });

  test('createFeedbackPost requires official flag when setting initial status', async () => {
    setStaffDevCapabilities();

    const result = await createFeedbackPost(
      identity,
      {
        title: 'Roadmap item',
        description: 'Details here',
        category: 'feature',
        status: 'planned',
      },
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('FORBIDDEN');
  });

  test('createFeedbackPost forces official when target release date is provided', async () => {
    setStaffDevCapabilities();

    const result = await createFeedbackPost(
      identity,
      {
        title: 'Roadmap item',
        description: 'Details here',
        category: 'feature',
        targetReleaseDate: '2026-09-01',
      },
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(true);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        isRoadmapOfficial: true,
        targetReleaseDate: new Date('2026-09-01T00:00:00.000Z'),
      }),
    );
  });

  test('updateFeedbackStatus sets releasedAt from targetReleaseDate', async () => {
    setStaffDevCapabilities();
    const targetReleaseDate = new Date('2026-08-15T00:00:00.000Z');
    mockFindByPostId.mockResolvedValue(
      makeCreatedPost({
        postId: 'FB-release',
        status: 'planned',
        targetReleaseDate,
      }),
    );

    const result = await updateFeedbackStatus(
      'FB-release',
      identity,
      'released',
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'FB-release',
      'released',
      identityId.toHexString(),
      targetReleaseDate,
    );
  });

  test('updateFeedbackStatus uses now when releasing without target date', async () => {
    setStaffDevCapabilities();
    mockFindByPostId.mockResolvedValue(
      makeCreatedPost({
        postId: 'FB-release-now',
        status: 'planned',
      }),
    );

    const before = Date.now();
    const result = await updateFeedbackStatus(
      'FB-release-now',
      identity,
      'released',
      [ADIEUU_DEV_ENTITLEMENT],
    );
    const after = Date.now();

    expect(result.success).toBe(true);
    const callArgs = mockUpdateStatus.mock.calls[0] as unknown as [string, string, string, Date];
    const releasedAt = callArgs[3];
    expect(releasedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(releasedAt.getTime()).toBeLessThanOrEqual(after);
  });

  test('updateFeedbackStatus keeps existing releasedAt on repeat release', async () => {
    setStaffDevCapabilities();
    const existingReleasedAt = new Date('2025-12-01T00:00:00.000Z');
    mockFindByPostId.mockResolvedValue(
      makeCreatedPost({
        postId: 'FB-already-released',
        status: 'released',
        releasedAt: existingReleasedAt,
        targetReleaseDate: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    const result = await updateFeedbackStatus(
      'FB-already-released',
      identity,
      'released',
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'FB-already-released',
      'released',
      identityId.toHexString(),
      existingReleasedAt,
    );
  });

  test('updateFeedbackStatus returns NOT_FOUND when updateStatus returns null', async () => {
    setStaffDevCapabilities();
    mockFindByPostId.mockResolvedValue(
      makeCreatedPost({ postId: 'FB-missing', status: 'planned' }),
    );
    mockUpdateStatus.mockResolvedValue(null);

    const result = await updateFeedbackStatus(
      'FB-missing',
      identity,
      'planned',
      [ADIEUU_DEV_ENTITLEMENT],
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('NOT_FOUND');
    }
    expect(mockCheckAndAward).not.toHaveBeenCalled();
  });

  test('getRoadmapTimelinePosts returns repository posts', async () => {
    const posts = [makeCreatedPost({ postId: 'FB-timeline', status: 'planned' })];
    mockListRoadmapTimelinePosts.mockResolvedValue(posts);

    const result = await getRoadmapTimelinePosts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.posts).toEqual(posts);
    }
  });
});

afterAll(() => {
  mock.restore();
});
