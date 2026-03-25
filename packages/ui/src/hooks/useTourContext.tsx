import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTour, createTourSteps, type TourApi } from '../components/Tour';
import { useToast } from '../components/Toast';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  APPEARANCE_TOUR_COMPLETED_EVENT,
  APPEARANCE_TOUR_COMPLETED_STORAGE_KEY,
} from '../constants/onboarding';

// ============================================================================
// Tour Context
// ============================================================================

interface TourContextValue {
  main: TourApi;
  appearance: TourApi;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Hook to access the main onboarding tour API.
 * Must be used within a TourProvider.
 */
export function useTourContext(): TourApi {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTourContext must be used within a TourProvider');
  }
  return context.main;
}

/**
 * Hook to access the appearance tour API.
 * Must be used within a TourProvider.
 */
export function useAppearanceTour(): TourApi {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useAppearanceTour must be used within a TourProvider');
  }
  return context.appearance;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Poll the DOM for a selector, then invoke the callback once found.
 * Returns a cleanup function that cancels polling.
 */
function waitForElement(
  selector: string,
  cb: () => void,
  intervalMs = 80,
  maxAttempts = 40,
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

// ============================================================================
// Tour Steps Factories
// ============================================================================

function createOnboardingSteps(
  platform: 'web' | 'desktop' | 'mobile',
  t: TFunction
) {
  const platformSuffix =
    platform === 'desktop' ? ' Desktop' : platform === 'mobile' ? ' Mobile' : '';

  return createTourSteps([
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
    {
      id: 'search',
      type: 'tooltip',
      target: '[data-tour="search"]',
      title: t('tour.steps.search.title'),
      description: t('tour.steps.search.description'),
      placement: 'right',
    },
    {
      id: 'sidebarTabs',
      type: 'tooltip',
      target: '[data-tour="sidebar-tabs"]',
      title: t('tour.steps.sidebarTabs.title'),
      description: t('tour.steps.sidebarTabs.description'),
      placement: 'right',
    },
    {
      id: 'identity',
      type: 'tooltip',
      target: '[data-tour="identity"]',
      title: t('tour.steps.identity.title'),
      description: t('tour.steps.identity.description'),
      placement: 'right',
    },
    {
      id: 'account',
      type: 'tooltip',
      target: '[data-tour="account"]',
      title: t('tour.steps.account.title'),
      description: t('tour.steps.account.description'),
      placement: 'right',
    },
    {
      id: 'logout',
      type: 'tooltip',
      target: '[data-tour="logout"]',
      title: t('tour.steps.logout.title'),
      description: t('tour.steps.logout.description'),
      placement: 'right',
      effect: ({ show }) => {
        document.body.classList.add('tour-account-flyout-open');
        show();
        return () => {
          document.body.classList.remove('tour-account-flyout-open');
        };
      },
    },
  ]);
}

function createAppearanceTourSteps(
  t: TFunction,
  navigate: (path: string) => void,
  hasIdentitySession: boolean,
) {
  return createTourSteps([
    {
      id: 'welcome',
      type: 'dialog',
      title: t('tour.appearance.welcome.title'),
      description: t('tour.appearance.welcome.description'),
    },
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
        navigate('/account/appearance');
        return waitForElement('[data-tour="appearance-presets"]', show);
      },
    },
    {
      id: 'editor',
      type: 'tooltip',
      target: '[data-tour="appearance-editor"]',
      title: t('tour.appearance.editor.title'),
      description: t('tour.appearance.editor.description'),
      placement: 'top',
    },
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
        navigate('/account/appearance/community');
        return waitForElement('[data-tour="community-search"]', show);
      },
    },
    {
      id: 'btnPreview',
      type: 'tooltip',
      target: '[data-tour="community-btn-preview"]',
      title: t('tour.appearance.btnPreview.title'),
      description: t('tour.appearance.btnPreview.description'),
      placement: 'bottom',
    },
    hasIdentitySession ? {
      id: 'btnIdentity',
      type: 'tooltip' as const,
      target: '[data-tour="community-btn-identity"]',
      title: t('tour.appearance.btnIdentity.title'),
      description: t('tour.appearance.btnIdentity.description'),
      placement: 'bottom' as const,
    } : {
      id: 'btnIdentity',
      type: 'dialog' as const,
      title: t('tour.appearance.btnIdentityHint.title'),
      description: t('tour.appearance.btnIdentityHint.description'),
    },
    {
      id: 'btnAccount',
      type: 'tooltip',
      target: '[data-tour="community-btn-account"]',
      title: t('tour.appearance.btnAccount.title'),
      description: t('tour.appearance.btnAccount.description'),
      placement: 'bottom',
    },
    {
      id: 'btnUpvote',
      type: 'tooltip',
      target: '[data-tour="community-btn-upvote"]',
      title: t('tour.appearance.btnUpvote.title'),
      description: t('tour.appearance.btnUpvote.description'),
      placement: 'bottom',
    },
  ]);
}

// ============================================================================
// Tour Provider
// ============================================================================

export interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  const { platform } = useAppConfig();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { status: identityStatus } = useIdentity();

  const hasIdentitySession = identityStatus === 'logged_in';

  const mainSteps = useMemo(() => createOnboardingSteps(platform, t), [platform, t]);
  const appearanceSteps = useMemo(
    () => createAppearanceTourSteps(t, navigate, hasIdentitySession),
    [t, navigate, hasIdentitySession],
  );

  const mainTourRef = useRef<TourApi | null>(null);
  const appearanceTourRef = useRef<TourApi | null>(null);

  const onMainStatusChange = useCallback((details: { status: string; stepId: string | null; stepIndex: number }) => {
    const tour = mainTourRef.current;
    const isLastStep = tour ? details.stepIndex >= tour.totalSteps - 1 : false;
    const finishedNaturally = details.status === 'completed' || (details.status === 'dismissed' && isLastStep);

    if (finishedNaturally) {
      try {
        localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, 'true');
      } catch {
        // ignore quota / private mode
      }
      window.dispatchEvent(new Event(TOUR_COMPLETED_EVENT));
    }

    const ended =
      details.status === 'completed' ||
      details.status === 'skipped' ||
      details.status === 'dismissed' ||
      details.status === 'not-found';

    if (ended) {
      document.body.classList.remove('tour-account-flyout-open');
    }

    if ((details.status === 'dismissed' && !isLastStep) || details.status === 'skipped') {
      const resumeStepId = details.stepId;
      toast.toast({
        title: t('tour.resumeToast.title'),
        description: t('tour.resumeToast.description'),
        variant: 'info',
        duration: Infinity,
        action: {
          label: t('tour.resumeToast.action'),
          onClick: () => mainTourRef.current?.start(resumeStepId ?? undefined),
        },
      });
    }
  }, [t, toast]);

  const onAppearanceStatusChange = useCallback((details: { status: string; stepId: string | null; stepIndex: number }) => {
    const tour = appearanceTourRef.current;
    const isLastStep = tour ? details.stepIndex >= tour.totalSteps - 1 : false;
    const finishedNaturally = details.status === 'completed' || (details.status === 'dismissed' && isLastStep);

    if (finishedNaturally) {
      try {
        localStorage.setItem(APPEARANCE_TOUR_COMPLETED_STORAGE_KEY, 'true');
      } catch {
        // ignore quota / private mode
      }
      window.dispatchEvent(new Event(APPEARANCE_TOUR_COMPLETED_EVENT));
    }

    const ended =
      details.status === 'completed' ||
      details.status === 'skipped' ||
      details.status === 'dismissed' ||
      details.status === 'not-found';

    if (ended) {
      document.body.classList.remove('tour-account-flyout-open');
    }

    if ((details.status === 'dismissed' && !isLastStep) || details.status === 'skipped') {
      const resumeStepId = details.stepId;
      toast.toast({
        title: t('tour.resumeToast.title'),
        description: t('tour.resumeToast.description'),
        variant: 'info',
        duration: Infinity,
        action: {
          label: t('tour.resumeToast.action'),
          onClick: () => appearanceTourRef.current?.start(resumeStepId ?? undefined),
        },
      });
    }
  }, [t, toast]);

  const mainTour = useTour({
    steps: mainSteps,
    onStatusChange: onMainStatusChange,
    closeOnInteractOutside: false,
  });

  const appearanceTour = useTour({
    steps: appearanceSteps,
    onStatusChange: onAppearanceStatusChange,
    closeOnInteractOutside: false,
  });

  mainTourRef.current = mainTour;
  appearanceTourRef.current = appearanceTour;

  const value = useMemo<TourContextValue>(() => ({
    main: mainTour,
    appearance: appearanceTour,
  }), [mainTour, appearanceTour]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
