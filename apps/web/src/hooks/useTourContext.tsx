import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTour, createTourSteps, type TourApi } from '@chadder/ui';

/**
 * Tour context for sharing tour state across the app.
 */
const TourContext = createContext<TourApi | null>(null);

/**
 * Hook to access the tour API from anywhere in the app.
 */
export function useTourContext(): TourApi {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTourContext must be used within a TourProvider');
  }
  return context;
}

/**
 * Define the onboarding tour steps.
 */
const onboardingSteps = createTourSteps([
  {
    id: 'welcome',
    type: 'dialog',
    title: 'Welcome to Chadder!',
    description:
      'Your privacy-first messaging app. Let us show you around the key features.',
  },
  {
    id: 'account',
    type: 'tooltip',
    target: '[data-tour="account"]',
    title: 'Account Settings',
    description:
      'Access your account settings here. Manage your profile, security, privacy preferences, and more.',
    placement: 'right',
  },
  {
    id: 'logout',
    type: 'tooltip',
    target: '[data-tour="logout"]',
    title: 'Sign Out',
    description:
      'When you\'re done, you can securely sign out from here. Your session will be safely terminated.',
    placement: 'right',
  },
]);

export interface TourProviderProps {
  children: ReactNode;
}

/**
 * Provider component that initializes and shares the tour across the app.
 */
export function TourProvider({ children }: TourProviderProps) {
  const tour = useTour({ steps: onboardingSteps });

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => tour, [tour]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
