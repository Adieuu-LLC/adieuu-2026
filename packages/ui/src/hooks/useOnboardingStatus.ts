import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  APPEARANCE_TOUR_COMPLETED_EVENT,
  APPEARANCE_TOUR_COMPLETED_STORAGE_KEY,
} from '../constants/onboarding';
import { useAuth } from './useAuth';
import { useIdentity } from './useIdentity';

export type OnboardingItemId = 'tour' | 'mfa' | 'verify' | 'alias' | 'appearance' | 'age';

export interface OnboardingItemState {
  id: OnboardingItemId;
  completed: boolean;
  disabled: boolean;
}

function readTourCompletedFromStorage(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readAppearanceTourCompletedFromStorage(): boolean {
  try {
    return localStorage.getItem(APPEARANCE_TOUR_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Aggregates onboarding checklist completion from localStorage (tour),
 * MFA and profile APIs, and identity session state.
 */
export function useOnboardingStatus(): {
  items: OnboardingItemState[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus } = useAuth();
  const { hasIdentity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [tourCompleted, setTourCompleted] = useState(readTourCompletedFromStorage);
  const [appearanceTourCompleted, setAppearanceTourCompleted] = useState(readAppearanceTourCompletedFromStorage);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [accountVerified, setAccountVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (authStatus === 'loading') {
      return;
    }
    if (authStatus !== 'authenticated') {
      setMfaEnabled(null);
      setAccountVerified(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mfaRes, profileRes] = await Promise.all([
        api.mfa.getStatus(),
        api.users.getProfile(),
      ]);
      if (mfaRes.success && mfaRes.data) {
        setMfaEnabled(mfaRes.data.enabled);
      } else {
        setMfaEnabled(false);
      }
      if (profileRes.success && profileRes.data) {
        const p = profileRes.data;
        setAccountVerified(p.emailVerified === true || p.phoneVerified === true);
      } else {
        setAccountVerified(false);
      }
    } catch {
      setMfaEnabled(false);
      setAccountVerified(false);
    } finally {
      setLoading(false);
    }
  }, [api, authStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onTourDone = () => {
      setTourCompleted(readTourCompletedFromStorage());
    };
    const onAppearanceTourDone = () => {
      setAppearanceTourCompleted(readAppearanceTourCompletedFromStorage());
    };
    window.addEventListener(TOUR_COMPLETED_EVENT, onTourDone);
    window.addEventListener(APPEARANCE_TOUR_COMPLETED_EVENT, onAppearanceTourDone);
    return () => {
      window.removeEventListener(TOUR_COMPLETED_EVENT, onTourDone);
      window.removeEventListener(APPEARANCE_TOUR_COMPLETED_EVENT, onAppearanceTourDone);
    };
  }, []);

  const items: OnboardingItemState[] = useMemo(
    () => [
      { id: 'tour', completed: tourCompleted, disabled: false },
      { id: 'mfa', completed: mfaEnabled === true, disabled: false },
      { id: 'verify', completed: accountVerified === true, disabled: false },
      { id: 'alias', completed: hasIdentity, disabled: false },
      { id: 'appearance', completed: appearanceTourCompleted, disabled: false },
      { id: 'age', completed: false, disabled: true },
    ],
    [tourCompleted, appearanceTourCompleted, mfaEnabled, accountVerified, hasIdentity]
  );

  return { items, loading, refetch: load };
}
