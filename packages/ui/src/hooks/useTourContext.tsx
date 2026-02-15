import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTour, createTourSteps, type TourApi } from '../components/Tour';
import { useAppConfig } from '../config';

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
function createOnboardingSteps(platform: 'web' | 'desktop' | 'mobile') {
  const platformName = platform === 'desktop' ? 'Desktop' : platform === 'mobile' ? 'Mobile' : '';
  const welcomeTitle = `Welcome to Chadder${platformName ? ` ${platformName}` : ''}!`;
  const welcomeDescription = platform === 'desktop'
    ? 'Your privacy-first messaging app, now on your desktop. Let us show you around the key features.'
    : 'Your privacy-first messaging app. Let us show you around the key features.';

  return createTourSteps([
    {
      id: 'welcome',
      type: 'dialog',
      title: welcomeTitle,
      description: welcomeDescription,
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
  const steps = useMemo(() => createOnboardingSteps(platform), [platform]);
  const tour = useTour({ steps });

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => tour, [tour]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
