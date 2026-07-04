import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTour, type TourApi } from '../components/Tour';
import { useToast } from '../components/Toast';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  TOUR_LAST_STEP_STORAGE_KEY,
  TOUR_PROGRESS_EVENT,
  APPEARANCE_TOUR_COMPLETED_EVENT,
  APPEARANCE_TOUR_COMPLETED_STORAGE_KEY,
} from '../constants/onboarding';
import { createAppearanceTourSteps, createOnboardingSteps, ONBOARDING_STEP_IDS } from '../services/tourSteps';

// ============================================================================
// Tour Context
// ============================================================================

export interface TourProgress {
  lastStepIndex: number;
  nextStepId: string | null;
  nextStepTitle: string | null;
  started: boolean;
}

interface TourContextValue {
  main: TourApi;
  appearance: TourApi;
  tourProgress: TourProgress;
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
 * Hook to access the main tour's resume progress.
 */
export function useTourProgress(): TourProgress {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTourProgress must be used within a TourProvider');
  }
  return context.tourProgress;
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

  const mainSteps = useMemo(() => createOnboardingSteps(platform, t, navigate), [platform, t, navigate]);

  const buildProgress = useCallback((): TourProgress => {
    const raw = localStorage.getItem(TOUR_LAST_STEP_STORAGE_KEY);
    if (raw == null) {
      return { lastStepIndex: -1, nextStepId: null, nextStepTitle: null, started: false };
    }
    const lastStepIndex = parseInt(raw, 10);
    if (isNaN(lastStepIndex) || lastStepIndex < 0) {
      return { lastStepIndex: -1, nextStepId: null, nextStepTitle: null, started: false };
    }
    const nextIndex = lastStepIndex + 1;
    const nextId = ONBOARDING_STEP_IDS[nextIndex] ?? null;
    const nextTitle = nextId ? t(`tour.steps.${nextId}.title`) : null;
    return { lastStepIndex, nextStepId: nextId, nextStepTitle: nextTitle, started: true };
  }, [t]);

  const [tourProgress, setTourProgress] = useState<TourProgress>(buildProgress);

  useEffect(() => {
    const onProgress = () => setTourProgress(buildProgress());
    window.addEventListener(TOUR_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(TOUR_PROGRESS_EVENT, onProgress);
  }, [buildProgress]);
  const appearanceSteps = useMemo(
    () => createAppearanceTourSteps(t, navigate, hasIdentitySession),
    [t, navigate, hasIdentitySession],
  );

  const mainTourRef = useRef<TourApi | null>(null);
  const appearanceTourRef = useRef<TourApi | null>(null);

  const saveTourProgress = useCallback((stepIndex: number) => {
    try {
      localStorage.setItem(TOUR_LAST_STEP_STORAGE_KEY, String(stepIndex));
      window.dispatchEvent(new Event(TOUR_PROGRESS_EVENT));
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  const onMainStatusChange = useCallback((details: { status: string; stepId: string | null; stepIndex: number }) => {
    const tour = mainTourRef.current;
    const isLastStep = tour ? details.stepIndex >= tour.totalSteps - 1 : false;
    const finishedNaturally = details.status === 'completed' || (details.status === 'dismissed' && isLastStep);

    if (details.stepIndex >= 0) {
      saveTourProgress(details.stepIndex);
    }

    if (finishedNaturally) {
      try {
        localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, 'true');
        localStorage.removeItem(TOUR_LAST_STEP_STORAGE_KEY);
      } catch {
        // ignore quota / private mode
      }
      window.dispatchEvent(new Event(TOUR_COMPLETED_EVENT));
      window.dispatchEvent(new Event(TOUR_PROGRESS_EVENT));
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
  }, [t, toast, saveTourProgress]);

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

  const onMainStepChange = useCallback((details: { stepIndex: number }) => {
    if (details.stepIndex >= 0) {
      saveTourProgress(details.stepIndex);
    }
  }, [saveTourProgress]);

  const mainTour = useTour({
    steps: mainSteps,
    onStatusChange: onMainStatusChange,
    onStepChange: onMainStepChange,
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
    tourProgress,
  }), [mainTour, appearanceTour, tourProgress]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
