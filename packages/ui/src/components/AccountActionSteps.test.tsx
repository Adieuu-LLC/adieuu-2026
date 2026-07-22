import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetReactI18nextMock, setMockTranslate } from '../test/react-i18next-mock';
import { resetReactRouterDomMock } from '../test/react-router-dom-mock';
import type { AccountProgress } from '../hooks/useHomeProgress';

import '../test/react-i18next-mock';
import '../test/react-router-dom-mock';

mock.module('../hooks/useTourContext', () => ({
  useTourContext: () => ({ start: () => {} }),
  useTourProgress: () => ({
    started: false,
    nextStepId: null,
    nextStepTitle: null,
  }),
}));

mock.module('../hooks/useIdentityModal', () => ({
  useIdentityModal: () => ({ openIdentityModal: () => {} }),
}));

mock.module('../icons/Icon', () => ({
  Icon: () => null,
}));

const { AccountActionSteps } = await import('./AccountActionSteps');

function baseProgress(overrides: Partial<AccountProgress> = {}): AccountProgress {
  return {
    mode: 'account',
    loading: false,
    hasSubscription: false,
    isFreeTier: false,
    isPaidPlan: false,
    avRequired: false,
    avStepRelevant: false,
    avStatus: undefined,
    jurisdictionReqs: [],
    jurisdictionReqsLoading: false,
    canSkipAvWithUpgrade: false,
    allComplete: false,
    primarySteps: [
      { id: 'subscribe', completed: false, disabled: false },
      { id: 'createAlias', completed: false, disabled: true },
      { id: 'sendFirstMessage', completed: false, disabled: true },
    ],
    secondarySteps: [
      { id: 'tour', completed: false, disabled: false },
      { id: 'mfa', completed: false, disabled: false },
      { id: 'verify', completed: false, disabled: false },
    ],
    refetch: async () => {},
    ...overrides,
  };
}

describe('AccountActionSteps subscribe step', () => {
  beforeEach(() => {
    resetReactI18nextMock();
    resetReactRouterDomMock();
    setMockTranslate((key) => key);
  });

  test('free-tier users see free plan copy and subscription + sponsorship links', () => {
    const html = renderToStaticMarkup(
      createElement(AccountActionSteps, {
        progress: baseProgress({
          hasSubscription: true,
          isFreeTier: true,
          isPaidPlan: false,
          primarySteps: [
            { id: 'subscribe', completed: true, disabled: false },
            { id: 'createAlias', completed: false, disabled: false },
            { id: 'sendFirstMessage', completed: false, disabled: true },
          ],
        }),
      }),
    );

    expect(html).toContain('home.account.steps.subscribe.titleFree');
    expect(html).toContain('home.account.steps.subscribe.descriptionFree');
    expect(html).not.toContain('home.account.steps.subscribe.titlePaid');
    expect(html).toContain('href="/account/subscription"');
    expect(html).toContain('href="/account/subscription/sponsorships"');
  });

  test('paid users see subscribed copy without upgrade CTAs', () => {
    const html = renderToStaticMarkup(
      createElement(AccountActionSteps, {
        progress: baseProgress({
          hasSubscription: true,
          isFreeTier: false,
          isPaidPlan: true,
          primarySteps: [
            { id: 'subscribe', completed: true, disabled: false },
            { id: 'createAlias', completed: false, disabled: false },
            { id: 'sendFirstMessage', completed: false, disabled: true },
          ],
        }),
      }),
    );

    expect(html).toContain('home.account.steps.subscribe.titlePaid');
    expect(html).toContain('home.account.steps.subscribe.descriptionPaid');
    expect(html).not.toContain('home.account.steps.subscribe.titleFree');
    expect(html).not.toContain('home.account.steps.subscribe.upgradeAction');
    expect(html).not.toContain('home.account.steps.subscribe.sponsorshipAction');
  });

  test('users without a subscription do not see paid "You\'re subscribed" copy', () => {
    const html = renderToStaticMarkup(
      createElement(AccountActionSteps, { progress: baseProgress() }),
    );

    expect(html).toContain('home.account.steps.subscribe.title');
    expect(html).not.toContain('home.account.steps.subscribe.titlePaid');
    expect(html).not.toContain('home.account.steps.subscribe.titleFree');
  });
});
