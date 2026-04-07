import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTour, type TourApi } from '../components/Tour';
import { useToast } from '../components/Toast';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  APPEARANCE_TOUR_COMPLETED_EVENT,
  APPEARANCE_TOUR_COMPLETED_STORAGE_KEY,
} from '../constants/onboarding';
import { createAppearanceTourSteps, createOnboardingSteps } from '../services/tourSteps';

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
