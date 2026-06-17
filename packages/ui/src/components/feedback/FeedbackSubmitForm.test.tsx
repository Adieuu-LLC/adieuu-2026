import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

let mockSession: {
  isPlatformAdmin?: boolean;
  isPlatformModerator?: boolean;
  entitlements?: string[];
} | null = null;

mock.module('../../hooks/useAuth', () => ({
  useAuth: () => ({ session: mockSession }),
}));

mock.module('../FeedbackAttachmentUploader', () => ({
  FeedbackAttachmentUploader: () => <div data-testid="feedback-attachment-uploader" />,
}));

const { FeedbackSubmitForm } = await import('./FeedbackSubmitForm');

describe('FeedbackSubmitForm', () => {
  beforeEach(() => {
    mockSession = null;
  });

  test('regular users do not see privileged roadmap fields', () => {
    mockSession = {
      isPlatformAdmin: false,
      isPlatformModerator: false,
      entitlements: [],
    };

    const html = renderToStaticMarkup(
      <FeedbackSubmitForm submitting={false} onSubmit={mock()} onCancel={mock()} />,
    );

    expect(html).not.toContain('feedback-submit-privileged-fields');
    expect(html).not.toContain('feedback.form.addToTimeline');
  });

  test('staff with adieuu-dev see privileged roadmap fields', () => {
    mockSession = {
      isPlatformAdmin: true,
      isPlatformModerator: false,
      entitlements: ['adieuu-dev'],
    };

    const html = renderToStaticMarkup(
      <FeedbackSubmitForm submitting={false} onSubmit={mock()} onCancel={mock()} />,
    );

    expect(html).toContain('feedback-submit-privileged-fields');
    expect(html).toContain('feedback.form.addToTimeline');
    expect(html).toContain('feedback.form.roadmapOfficial');
    expect(html).toContain('feedback.form.initialStatus');
  });

  test('staff without adieuu-dev do not see privileged fields', () => {
    mockSession = {
      isPlatformAdmin: true,
      isPlatformModerator: false,
      entitlements: [],
    };

    const html = renderToStaticMarkup(
      <FeedbackSubmitForm submitting={false} onSubmit={mock()} onCancel={mock()} />,
    );

    expect(html).not.toContain('feedback-submit-privileged-fields');
  });

  test('dev entitlement alone does not show privileged fields', () => {
    mockSession = {
      isPlatformAdmin: false,
      isPlatformModerator: false,
      entitlements: ['adieuu-dev'],
    };

    const html = renderToStaticMarkup(
      <FeedbackSubmitForm submitting={false} onSubmit={mock()} onCancel={mock()} />,
    );

    expect(html).not.toContain('feedback-submit-privileged-fields');
  });
});
