import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useTour, createTourSteps, type TourApi } from '../components/Tour';
import { useAppConfig } from '../config';
import { TOUR_COMPLETED_EVENT, TOUR_COMPLETED_STORAGE_KEY } from '../constants/onboarding';

// ============================================================================
// Tour Context
// ============================================================================

const TourContext = createContext<TourApi | null>(null);

/**
 * Hook to access the tour API from anywhere in the app.
 * Must be used within a TourProvider.
 */
export function useTourContext(): TourApi {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTourContext must be used within a TourProvider');
  }
  return context;
}

// ============================================================================
// Tour Steps Factory
// ============================================================================

/**
 * Create platform-specific onboarding tour steps.
 */
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
      // Flyout is hover-only; open it before show() so the target is visible for spotlight/layout.
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

// ============================================================================
// Tour Provider
// ============================================================================

export interface TourProviderProps {
  children: ReactNode;
}

/**
 * Provider component that initializes and shares the tour across the app.
 * Automatically configures tour steps based on the current platform.
 */
export function TourProvider({ children }: TourProviderProps) {
  const { platform } = useAppConfig();
  const { t } = useTranslation();
  const steps = useMemo(() => createOnboardingSteps(platform, t), [platform, t]);

  const onStatusChange = useCallback((details: { status: string }) => {
    if (details.status === 'completed') {
      try {
        localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, 'true');
      } catch {
        // ignore quota / private mode
      }
      window.dispatchEvent(new Event(TOUR_COMPLETED_EVENT));
    }
    // Defensive: ensure flyout-forced-open class is cleared if the tour ends abruptly
    if (
      details.status === 'completed' ||
      details.status === 'skipped' ||
      details.status === 'dismissed' ||
      details.status === 'not-found'
    ) {
      document.body.classList.remove('tour-account-flyout-open');
    }
  }, []);

  const tour = useTour({ steps, onStatusChange });

  const value = useMemo(() => tour, [tour]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
