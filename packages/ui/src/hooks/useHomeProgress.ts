import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import type { ConversationStats } from '@adieuu/shared';
import { useAppConfig } from '../config';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  APPEARANCE_TOUR_COMPLETED_EVENT,
  APPEARANCE_TOUR_COMPLETED_STORAGE_KEY,
} from '../constants/onboarding';
import { useAuth } from './useAuth';
import { useIdentity } from './useIdentity';
import { useFriends } from './useFriends';
import { useConversations } from './conversations';

export interface AccountProgressStep {
  id: string;
  completed: boolean;
  disabled: boolean;
}

export interface AccountProgress {
  mode: 'account';
  loading: boolean;
  hasSubscription: boolean;
  avRequired: boolean;
  avStatus: string | undefined;
  /** True when every primary and secondary onboarding step is completed. */
  allComplete: boolean;
  primarySteps: AccountProgressStep[];
  secondarySteps: AccountProgressStep[];
  refetch: () => Promise<void>;
}

export interface IdentityProgress {
  mode: 'identity';
  loading: boolean;
  stats: {
    conversations: number;
    friends: number;
    messages: number;
    achievements: number;
  };
  primarySteps: AccountProgressStep[];
  secondarySteps: AccountProgressStep[];
}

export type HomeProgress = AccountProgress | IdentityProgress;

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

export function useHomeProgress(): HomeProgress {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus, session } = useAuth();
  const { hasIdentity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [tourCompleted, setTourCompleted] = useState(readTourCompletedFromStorage);
  const [appearanceTourCompleted, setAppearanceTourCompleted] = useState(readAppearanceTourCompletedFromStorage);

  useEffect(() => {
    const onTourDone = () => setTourCompleted(readTourCompletedFromStorage());
    const onAppearanceTourDone = () => setAppearanceTourCompleted(readAppearanceTourCompletedFromStorage());
    window.addEventListener(TOUR_COMPLETED_EVENT, onTourDone);
    window.addEventListener(APPEARANCE_TOUR_COMPLETED_EVENT, onAppearanceTourDone);
    return () => {
      window.removeEventListener(TOUR_COMPLETED_EVENT, onTourDone);
      window.removeEventListener(APPEARANCE_TOUR_COMPLETED_EVENT, onAppearanceTourDone);
    };
  }, []);

  const isIdentityMode = authStatus === 'identity_mode';

  const accountProgress = useAccountProgress(
    api,
    authStatus,
    session,
    hasIdentity,
    tourCompleted,
    appearanceTourCompleted,
  );
  const identityProgress = useIdentityProgress(api, tourCompleted, isIdentityMode);

  return isIdentityMode ? identityProgress : accountProgress;
}

function useAccountProgress(
  api: ReturnType<typeof createApiClient>,
  authStatus: string,
  session: ReturnType<typeof useAuth>['session'],
  hasIdentity: boolean,
  tourCompleted: boolean,
  appearanceTourCompleted: boolean,
): AccountProgress {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [accountVerified, setAccountVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (authStatus === 'loading') return;
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
      setMfaEnabled(mfaRes.success && mfaRes.data ? mfaRes.data.enabled : false);
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

  const hasSubscription = (session?.subscriptions?.length ?? 0) > 0;
  const avStatus = session?.ageVerification?.status;
  const aliasGateCode = session?.aliasGate?.code;
  const avRequired = aliasGateCode === 'AGE_VERIFICATION_REQUIRED';
  const avVerified = avStatus === 'verified';
  const aliasReady = hasSubscription && (!avRequired || avVerified);

  const primarySteps: AccountProgressStep[] = useMemo(() => {
    const steps: AccountProgressStep[] = [];
    steps.push({ id: 'subscribe', completed: hasSubscription, disabled: false });
    if (hasSubscription && avRequired) {
      steps.push({ id: 'verifyAge', completed: avVerified, disabled: false });
    }
    steps.push({ id: 'createAlias', completed: hasIdentity, disabled: !aliasReady });
    return steps;
  }, [hasSubscription, avRequired, avVerified, hasIdentity, aliasReady]);

  const secondarySteps: AccountProgressStep[] = useMemo(
    () => [
      { id: 'tour', completed: tourCompleted, disabled: false },
      { id: 'mfa', completed: mfaEnabled === true, disabled: false },
      { id: 'verify', completed: accountVerified === true, disabled: false },
      { id: 'appearance', completed: appearanceTourCompleted, disabled: false },
    ],
    [tourCompleted, mfaEnabled, accountVerified, appearanceTourCompleted]
  );

  const allComplete = useMemo(
    () =>
      primarySteps.length > 0 &&
      secondarySteps.length > 0 &&
      primarySteps.every((s) => s.completed) &&
      secondarySteps.every((s) => s.completed),
    [primarySteps, secondarySteps],
  );

  return {
    mode: 'account',
    loading,
    hasSubscription,
    avRequired,
    avStatus,
    allComplete,
    primarySteps,
    secondarySteps,
    refetch: load,
  };
}

function useIdentityProgress(
  api: ReturnType<typeof createApiClient>,
  tourCompleted: boolean,
  enabled: boolean,
): IdentityProgress {
  const { friends } = useFriends();
  const { conversations } = useConversations();
  const [achievementCount, setAchievementCount] = useState(0);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [achRes, statsRes] = await Promise.all([
          api.achievements.getMine(),
          api.conversations.getStats(),
        ]);
        if (cancelled) return;
        const achievements = achRes.success && achRes.data ? achRes.data.achievements : undefined;
        setAchievementCount(Array.isArray(achievements) ? achievements.length : 0);
        if (statsRes.success && statsRes.data) {
          setConversationStats(statsRes.data);
        }
      } catch {
        // Stats are best-effort; fail silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [api, enabled]);

  const friendsLen = friends?.length ?? 0;
  const conversationsLen = conversations?.length ?? 0;
  const hasFriend = friendsLen > 0;

  const primarySteps: AccountProgressStep[] = useMemo(
    () =>
      enabled
        ? [
            { id: 'addFriend', completed: hasFriend, disabled: false },
            { id: 'startConversation', completed: false, disabled: false },
            { id: 'joinSpace', completed: false, disabled: true },
          ]
        : [],
    [enabled, hasFriend],
  );

  const secondarySteps: AccountProgressStep[] = useMemo(
    () =>
      enabled
        ? [
            { id: 'appearance', completed: false, disabled: false },
            { id: 'editProfile', completed: false, disabled: false },
            { id: 'tour', completed: tourCompleted, disabled: false },
          ]
        : [],
    [enabled, tourCompleted],
  );

  const stats = useMemo(
    () =>
      enabled
        ? {
            conversations: conversationStats?.totalConversations ?? conversationsLen,
            friends: friendsLen,
            messages: conversationStats?.totalMessages ?? 0,
            achievements: achievementCount,
          }
        : {
            conversations: 0,
            friends: 0,
            messages: 0,
            achievements: 0,
          },
    [enabled, conversationStats, conversationsLen, friendsLen, achievementCount],
  );

  return {
    mode: 'identity',
    loading: enabled && loading,
    stats,
    primarySteps,
    secondarySteps,
  };
}
