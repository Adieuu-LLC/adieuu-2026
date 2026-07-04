import type { TFunction } from 'i18next';
import { createTourSteps } from '../components/Tour';

export function waitForElement(
  selector: string,
  cb: () => void,
  intervalMs = 80,
  maxAttempts = 40
): () => void {
  let attempts = 0;
  const id = setInterval(() => {
    attempts++;
    if (document.querySelector(selector)) {
      clearInterval(id);
      cb();
    } else if (attempts >= maxAttempts) {
      clearInterval(id);
    }
  }, intervalMs);
  return () => clearInterval(id);
}

export const ONBOARDING_STEP_IDS = [
  'welcome',
  'search',
  'sidebarTabs',
  'identity',
  'account',
  'accountLink',
  'accountOverview',
  'accountAuthentication',
  'accountSessions',
  'accountDataExport',
  'subscription',
  'subscriptionOverview',
  'subscriptionPromo',
  'subscriptionSponsorships',
  'roadmap',
  'roadmapOverview',
  'roadmapProposals',
  'logout',
  'complete',
] as const;

export function createOnboardingSteps(
  platform: 'web' | 'desktop' | 'mobile',
  t: TFunction,
  navigate: (path: string) => void
) {
  const platformSuffix =
    platform === 'desktop' ? ' Desktop' : platform === 'mobile' ? ' Mobile' : '';
  return createTourSteps([
    // 1. Welcome dialog
    {
      id: 'welcome',
      type: 'dialog',
      title: t('tour.steps.welcome.title', { platform: platformSuffix }),
      description:
        platform === 'desktop'
          ? t('tour.steps.welcome.descriptionDesktop')
          : platform === 'mobile'
            ? t('tour.steps.welcome.descriptionMobile')
            : t('tour.steps.welcome.descriptionWeb'),
    },
    // 2. Search
    {
      id: 'search',
      type: 'tooltip',
      target: '[data-tour="search"]',
      title: t('tour.steps.search.title'),
      description: t('tour.steps.search.description'),
      placement: 'right',
    },
    // 4. Sidebar tabs
    {
      id: 'sidebarTabs',
      type: 'tooltip',
      target: '[data-tour="sidebar-tabs"]',
      title: t('tour.steps.sidebarTabs.title'),
      description: t('tour.steps.sidebarTabs.description'),
      placement: 'right',
    },
    // 5. Alias control
    {
      id: 'identity',
      type: 'tooltip',
      target: '[data-tour="identity"]',
      title: t('tour.steps.identity.title'),
      description: t('tour.steps.identity.description'),
      placement: 'right',
    },
    // 6. Account menu (highlight the flyout submenu)
    {
      id: 'account',
      type: 'tooltip',
      target: '[data-tour="account-flyout"]',
      title: t('tour.steps.account.title'),
      description: t('tour.steps.account.description'),
      placement: 'right',
      effect: ({ show }) => {
        document.body.classList.add('tour-account-flyout-open');
        show();
        return () => document.body.classList.remove('tour-account-flyout-open');
      },
    },
    // 7. Account page link (inside flyout)
    {
      id: 'accountLink',
      type: 'tooltip',
      target: '[data-tour="account-page-link"]',
      title: t('tour.steps.accountLink.title'),
      description: t('tour.steps.accountLink.description'),
      placement: 'right',
      effect: ({ show, next }) => {
        navigate('/');
        document.body.classList.add('tour-account-flyout-open');
        const onClick = (e: Event) => {
          const link = (e.target as HTMLElement)?.closest?.('[data-tour="account-page-link"]');
          if (link) {
            setTimeout(next, 100);
          }
        };
        const cleanup = waitForElement('[data-tour="account-page-link"]', () => {
          show();
          document.addEventListener('click', onClick, true);
        });
        return () => {
          cleanup();
          document.removeEventListener('click', onClick, true);
          document.body.classList.remove('tour-account-flyout-open');
        };
      },
    },
    // 8. Account Overview tab
    {
      id: 'accountOverview',
      type: 'tooltip',
      target: '[data-tour="account-tab-overview"]',
      title: t('tour.steps.accountOverview.title'),
      description: t('tour.steps.accountOverview.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        document.body.classList.remove('tour-account-flyout-open');
        navigate('/account/overview');
        return waitForElement('[data-tour="account-tab-overview"]', show);
      },
    },
    // 8. Authentication tab
    {
      id: 'accountAuthentication',
      type: 'tooltip',
      target: '[data-tour="account-tab-authentication"]',
      title: t('tour.steps.accountAuthentication.title'),
      description: t('tour.steps.accountAuthentication.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/account/authentication');
        return waitForElement('[data-tour="account-tab-authentication"]', show);
      },
    },
    // 9. Sessions tab
    {
      id: 'accountSessions',
      type: 'tooltip',
      target: '[data-tour="account-tab-sessions"]',
      title: t('tour.steps.accountSessions.title'),
      description: t('tour.steps.accountSessions.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/account/sessions');
        return waitForElement('[data-tour="account-tab-sessions"]', show);
      },
    },
    // 10. Data Export tab
    {
      id: 'accountDataExport',
      type: 'tooltip',
      target: '[data-tour="account-tab-data-export"]',
      title: t('tour.steps.accountDataExport.title'),
      description: t('tour.steps.accountDataExport.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/account/data-export');
        return waitForElement('[data-tour="account-tab-data-export"]', show);
      },
    },
    // 11. Subscription nav link (opens flyout to prompt click)
    {
      id: 'subscription',
      type: 'tooltip',
      target: '[data-tour="subscription-nav-link"]',
      title: t('tour.steps.subscription.title'),
      description: t('tour.steps.subscription.description'),
      placement: 'right',
      effect: ({ show }) => {
        document.body.classList.add('tour-account-flyout-open');
        show();
        return () => document.body.classList.remove('tour-account-flyout-open');
      },
    },
    // 12. Subscription overview (manage tab)
    {
      id: 'subscriptionOverview',
      type: 'tooltip',
      target: '[data-tour="subscription-tab-manage"]',
      title: t('tour.steps.subscriptionOverview.title'),
      description: t('tour.steps.subscriptionOverview.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        document.body.classList.remove('tour-account-flyout-open');
        navigate('/account/subscription/manage');
        return waitForElement('[data-tour="subscription-tab-manage"]', show);
      },
    },
    // 13. Promo code area
    {
      id: 'subscriptionPromo',
      type: 'tooltip',
      target: '#subscription-promo-code-card',
      title: t('tour.steps.subscriptionPromo.title'),
      description: t('tour.steps.subscriptionPromo.description'),
      placement: 'top',
      effect: ({ show }) => {
        const el = document.getElementById('subscription-promo-code-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        show();
        return () => {};
      },
    },
    // 14. Sponsorships tab
    {
      id: 'subscriptionSponsorships',
      type: 'tooltip',
      target: '[data-tour="subscription-tab-sponsorships"]',
      title: t('tour.steps.subscriptionSponsorships.title'),
      description: t('tour.steps.subscriptionSponsorships.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/account/subscription/sponsorships');
        return waitForElement('[data-tour="subscription-tab-sponsorships"]', show);
      },
    },
    // 15. Roadmap nav link
    {
      id: 'roadmap',
      type: 'tooltip',
      target: '[data-tour="roadmap-nav"]',
      title: t('tour.steps.roadmap.title'),
      description: t('tour.steps.roadmap.description'),
      placement: 'right',
    },
    // 16. Roadmap overview
    {
      id: 'roadmapOverview',
      type: 'tooltip',
      target: '[data-tour="roadmap-latest-card"]',
      title: t('tour.steps.roadmapOverview.title'),
      description: t('tour.steps.roadmapOverview.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/about/roadmap');
        return waitForElement('[data-tour="roadmap-latest-card"]', show);
      },
    },
    // 17. Browse All Proposals
    {
      id: 'roadmapProposals',
      type: 'tooltip',
      target: '[data-tour="roadmap-browse-proposals"]',
      title: t('tour.steps.roadmapProposals.title'),
      description: t('tour.steps.roadmapProposals.description'),
      placement: 'bottom',
    },
    // 18. Sign out
    {
      id: 'logout',
      type: 'tooltip',
      target: '[data-tour="logout"]',
      title: t('tour.steps.logout.title'),
      description: t('tour.steps.logout.description'),
      placement: 'right',
      effect: ({ show }) => {
        navigate('/');
        document.body.classList.add('tour-account-flyout-open');
        const cleanup = waitForElement('[data-tour="logout"]', () => {
          show();
        });
        return () => {
          cleanup();
          document.body.classList.remove('tour-account-flyout-open');
        };
      },
    },
    // 19. Completion dialog
    {
      id: 'complete',
      type: 'dialog',
      title: t('tour.steps.complete.title'),
      description: t('tour.steps.complete.description'),
      effect: ({ show }) => {
        document.body.classList.remove('tour-account-flyout-open');
        show();
        return () => {};
      },
    },
  ]);
}

export function createAppearanceTourSteps(
  t: TFunction,
  navigate: (path: string) => void,
  hasIdentitySession: boolean
) {
  return createTourSteps([
    { id: 'welcome', type: 'dialog', title: t('tour.appearance.welcome.title'), description: t('tour.appearance.welcome.description') },
    {
      id: 'nav',
      type: 'tooltip',
      target: '[data-tour="appearance-nav"]',
      title: t('tour.appearance.nav.title'),
      description: t('tour.appearance.nav.description'),
      placement: 'right',
      effect: ({ show, next, target }) => {
        document.body.classList.add('tour-account-flyout-open');
        show();
        const el = target?.();
        const onClick = () => setTimeout(next, 100);
        el?.addEventListener('click', onClick);
        return () => {
          document.body.classList.remove('tour-account-flyout-open');
          el?.removeEventListener('click', onClick);
        };
      },
    },
    {
      id: 'presets',
      type: 'tooltip',
      target: '[data-tour="appearance-presets"]',
      title: t('tour.appearance.presets.title'),
      description: t('tour.appearance.presets.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        document.body.classList.remove('tour-account-flyout-open');
        navigate('/identity/appearance');
        return waitForElement('[data-tour="appearance-presets"]', show);
      },
    },
    { id: 'editor', type: 'tooltip', target: '[data-tour="appearance-editor"]', title: t('tour.appearance.editor.title'), description: t('tour.appearance.editor.description'), placement: 'top' },
    {
      id: 'communityLink',
      type: 'tooltip',
      target: '[data-tour="appearance-community-link"]',
      title: t('tour.appearance.communityLink.title'),
      description: t('tour.appearance.communityLink.description'),
      placement: 'bottom',
      effect: ({ show, next, target }) => {
        show();
        const el = target?.();
        const onClick = () => setTimeout(next, 100);
        el?.addEventListener('click', onClick);
        return () => el?.removeEventListener('click', onClick);
      },
    },
    {
      id: 'communitySearch',
      type: 'tooltip',
      target: '[data-tour="community-search"]',
      title: t('tour.appearance.communitySearch.title'),
      description: t('tour.appearance.communitySearch.description'),
      placement: 'bottom',
      effect: ({ show }) => {
        navigate('/identity/appearance/community');
        return waitForElement('[data-tour="community-search"]', show);
      },
    },
    { id: 'btnPreview', type: 'tooltip', target: '[data-tour="community-btn-preview"]', title: t('tour.appearance.btnPreview.title'), description: t('tour.appearance.btnPreview.description'), placement: 'bottom' },
    hasIdentitySession
      ? { id: 'btnIdentity', type: 'tooltip' as const, target: '[data-tour="community-btn-identity"]', title: t('tour.appearance.btnIdentity.title'), description: t('tour.appearance.btnIdentity.description'), placement: 'bottom' as const }
      : { id: 'btnIdentity', type: 'dialog' as const, title: t('tour.appearance.btnIdentityHint.title'), description: t('tour.appearance.btnIdentityHint.description') },
    { id: 'btnAccount', type: 'tooltip', target: '[data-tour="community-btn-account"]', title: t('tour.appearance.btnAccount.title'), description: t('tour.appearance.btnAccount.description'), placement: 'bottom' },
    { id: 'btnUpvote', type: 'tooltip', target: '[data-tour="community-btn-upvote"]', title: t('tour.appearance.btnUpvote.title'), description: t('tour.appearance.btnUpvote.description'), placement: 'bottom' },
  ]);
}
