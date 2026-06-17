import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicFeedbackPost } from '@adieuu/shared';
import { setMockTranslate } from '../../test/react-i18next-mock';
import '../../test/react-router-dom-mock';

setMockTranslate((key, options) => {
  if (key === 'about.roadmap.viewComments') {
    return `Comments (${(options as { count?: number })?.count ?? 0})`;
  }
  const labels: Record<string, string> = {
    'about.roadmap.communityIdea': 'Community Idea',
    'about.roadmap.readMore': 'Read more',
    'about.roadmap.showLess': 'Show less',
    'feedback.statuses.planned': 'Planned',
    'feedback.statuses.released': 'Released',
  };
  return labels[key] ?? key;
});

const { RoadmapTimelineCard } = await import('./RoadmapTimelineCard');

function makePost(overrides: Partial<PublicFeedbackPost> = {}): PublicFeedbackPost {
  return {
    id: 'id-1',
    postId: 'FB-test1234',
    author: {
      identityId: 'identity-1',
      displayName: 'Contributor',
      username: 'contributor',
    },
    title: 'Dark mode',
    description: 'Please add dark mode support for late-night chats.',
    category: 'feature',
    status: 'planned',
    attachmentMediaIds: [],
    attachments: [],
    upvoteCount: 3,
    commentCount: 5,
    hasStaffResponse: false,
    isRoadmapOfficial: false,
    isStaffAuthored: false,
    hasUpvoted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RoadmapTimelineCard', () => {
  test('community posts show "Community Idea" badge', () => {
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost()}
        expanded={false}
        onToggle={() => {}}
      />,
    );

    expect(html).toContain('roadmap-timeline-card--community');
    expect(html).toContain('Community Idea');
    expect(html).toContain('roadmap-timeline-card-badge--community');
  });

  test('official posts do not show community badge or team label', () => {
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost({ isRoadmapOfficial: true, status: 'released' })}
        expanded={false}
        onToggle={() => {}}
      />,
    );

    expect(html).not.toContain('roadmap-timeline-card--community');
    expect(html).not.toContain('Community Idea');
    expect(html).toContain('feedback-status-released');
  });

  test('collapsed cards truncate long descriptions', () => {
    const longDescription = 'x'.repeat(250);
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost({ description: longDescription })}
        expanded={false}
        onToggle={() => {}}
      />,
    );

    expect(html).toContain(`${'x'.repeat(200)}\u2026`);
    expect(html).not.toContain(longDescription);
  });

  test('expanded cards show full description and comment link', () => {
    const description = 'Full roadmap description text.';
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost({ description, postId: 'FB-comments' })}
        expanded
        onToggle={() => {}}
      />,
    );

    expect(html).toContain(description);
    expect(html).toContain('href="/feedback/FB-comments"');
    expect(html).toContain('Comments (5)');
  });

  test('staff-authored posts do not show community badge', () => {
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost({ isStaffAuthored: true })}
        expanded={false}
        onToggle={() => {}}
      />,
    );

    expect(html).not.toContain('Community Idea');
    expect(html).not.toContain('roadmap-timeline-card--community');
  });

  test('focused cards get the focused class', () => {
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost()}
        expanded={false}
        isFocused
        onToggle={() => {}}
      />,
    );

    expect(html).toContain('roadmap-timeline-card--focused');
  });

  test('non-focused cards do not get the focused class', () => {
    const html = renderToStaticMarkup(
      <RoadmapTimelineCard
        post={makePost()}
        expanded={false}
        isFocused={false}
        onToggle={() => {}}
      />,
    );

    expect(html).not.toContain('roadmap-timeline-card--focused');
  });
});
