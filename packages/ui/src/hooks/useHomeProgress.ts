import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient, expandedJurisdictionCodesForRequirements } from '@adieuu/shared';
import type { ConversationStats, PublicJurisdictionRequirement } from '@adieuu/shared';
import { useAppConfig } from '../config';
import {
  TOUR_COMPLETED_EVENT,
  TOUR_COMPLETED_STORAGE_KEY,
  FIRST_MESSAGE_SENT_EVENT,
  readFirstMessageSentFromStorage,
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
  isFreeTier: boolean;
  avRequired: boolean;
  avStepRelevant: boolean;
  avStatus: string | undefined;
  aliasGateJurisdiction?: string;
  aliasGateRequiredReason?: string;
  jurisdictionReqs: PublicJurisdictionRequirement[];
  jurisdictionReqsLoading: boolean;
  canSkipAvWithUpgrade: boolean;
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

export function useHomeProgress(): HomeProgress {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus, session } = useAuth();
  const { hasIdentity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const subjectId = session?.identifier;

  const [tourCompleted, setTourCompleted] = useState(readTourCompletedFromStorage);
  const [firstMessageSent, setFirstMessageSent] = useState(() => readFirstMessageSentFromStorage(subjectId));

  useEffect(() => {
    setFirstMessageSent(readFirstMessageSentFromStorage(subjectId));
  }, [subjectId]);

  useEffect(() => {
    const onTourDone = () => setTourCompleted(readTourCompletedFromStorage());
    const onFirstMessageSent = (e: Event) => {
      const detail = (e as CustomEvent<{ subjectId?: string }>).detail;
      if (!subjectId || detail?.subjectId === subjectId) {
        setFirstMessageSent(readFirstMessageSentFromStorage(subjectId));
      }
    };
    window.addEventListener(TOUR_COMPLETED_EVENT, onTourDone);
    window.addEventListener(FIRST_MESSAGE_SENT_EVENT, onFirstMessageSent);
    return () => {
      window.removeEventListener(TOUR_COMPLETED_EVENT, onTourDone);
      window.removeEventListener(FIRST_MESSAGE_SENT_EVENT, onFirstMessageSent);
    };
  }, [subjectId]);

  const isIdentityMode = authStatus === 'identity_mode';

  const accountProgress = useAccountProgress(
    api,
    authStatus,
    session,
    hasIdentity,
    tourCompleted,
    firstMessageSent,
  );
  const identityProgress = useIdentityProgress(api, isIdentityMode);

  return isIdentityMode ? identityProgress : accountProgress;
}

function useAccountProgress(
  api: ReturnType<typeof createApiClient>,
  authStatus: string,
  session: ReturnType<typeof useAuth>['session'],
  hasIdentity: boolean,
  tourCompleted: boolean,
  firstMessageSent: boolean,
): AccountProgress {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [accountVerified, setAccountVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [jurisdictionReqs, setJurisdictionReqs] = useState<PublicJurisdictionRequirement[]>([]);
  const [jurisdictionReqsLoading, setJurisdictionReqsLoading] = useState(false);

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
  const subscriptions = session?.subscriptions ?? [];
  const isFreeTier =
    hasSubscription &&
    subscriptions.every((t) => t === 'free');
  const avStatus = session?.ageVerification?.status;
  const aliasGateCode = session?.aliasGate?.code;
  const aliasGateJurisdiction = session?.aliasGate?.jurisdiction;
  const aliasGateRequiredReason = session?.aliasGate?.requiredReason;
  const avRequired = aliasGateCode === 'AGE_VERIFICATION_REQUIRED';
  const avVerified = avStatus === 'verified';
  const avStepRelevant =
    !avVerified &&
    (aliasGateCode === 'AGE_VERIFICATION_REQUIRED' ||
      aliasGateCode === 'AGE_VERIFICATION_FAILED' ||
      aliasGateCode === 'AGE_VERIFICATION_COOLDOWN' ||
      avStatus === 'pending' ||
      avStatus === 'expired');
  const aliasReady = hasSubscription && (!avStepRelevant || avVerified);
  const geo = session?.geo;

  useEffect(() => {
    if (!geo || !avStepRelevant) {
      setJurisdictionReqs([]);
      setJurisdictionReqsLoading(false);
      return;
    }
    const codes = expandedJurisdictionCodesForRequirements(geo);
    let cancelled = false;
    setJurisdictionReqsLoading(true);
    void (async () => {
      try {
        const res = await api.geo.getJurisdictionRequirements(codes);
        if (cancelled) return;
        if (res.success && res.data) {
          const sorted = [...res.data].sort((a, b) => {
            const r = a.region.localeCompare(b.region);
            if (r !== 0) return r;
            return a.jurisdictionName.localeCompare(b.jurisdictionName);
          });
          setJurisdictionReqs(sorted);
        } else {
          setJurisdictionReqs([]);
        }
      } catch {
        if (!cancelled) setJurisdictionReqs([]);
      } finally {
        if (!cancelled) setJurisdictionReqsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, geo, avStepRelevant]);

  const primarySteps: AccountProgressStep[] = useMemo(() => {
    const steps: AccountProgressStep[] = [];
    steps.push({ id: 'subscribe', completed: hasSubscription, disabled: false });
    if (avStepRelevant) {
      steps.push({ id: 'verifyAge', completed: avVerified, disabled: !hasSubscription });
    }
    steps.push({ id: 'createAlias', completed: hasIdentity, disabled: !aliasReady });
    steps.push({
      id: 'sendFirstMessage',
      completed: firstMessageSent,
      disabled: !hasIdentity,
    });
    return steps;
  }, [hasSubscription, avStepRelevant, avVerified, hasIdentity, aliasReady, firstMessageSent]);

  const secondarySteps: AccountProgressStep[] = useMemo(
    () => [
      { id: 'tour', completed: tourCompleted, disabled: false },
      { id: 'mfa', completed: mfaEnabled === true, disabled: false },
      { id: 'verify', completed: accountVerified === true, disabled: false },
    ],
    [tourCompleted, mfaEnabled, accountVerified]
  );

  const canSkipAvWithUpgrade = useMemo(() => {
    if (!isFreeTier || !avStepRelevant) return false;
    if (jurisdictionReqs.length === 0) return true;
    return jurisdictionReqs.some((r) =>
      r.compatibleMethods.includes('credit_card'),
    );
  }, [isFreeTier, avStepRelevant, jurisdictionReqs]);

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
    isFreeTier,
    avRequired,
    avStepRelevant,
    avStatus,
    aliasGateJurisdiction,
    aliasGateRequiredReason,
    jurisdictionReqs,
    jurisdictionReqsLoading,
    canSkipAvWithUpgrade,
    allComplete,
    primarySteps,
    secondarySteps,
    refetch: load,
  };
}

function useIdentityProgress(
  api: ReturnType<typeof createApiClient>,
  enabled: boolean,
): IdentityProgress {
  const { friends } = useFriends();
  const { conversations } = useConversations();
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
        const statsRes = await api.conversations.getStats();
        if (cancelled) return;
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
            { id: 'startConversation', completed: conversationsLen > 0, disabled: false },
            { id: 'joinSpace', completed: false, disabled: true },
          ]
        : [],
    [enabled, hasFriend, conversationsLen],
  );

  const secondarySteps: AccountProgressStep[] = useMemo(
    () =>
      enabled
        ? [
            { id: 'appearance', completed: false, disabled: false },
            { id: 'editProfile', completed: false, disabled: false },
          ]
        : [],
    [enabled],
  );

  const stats = useMemo(
    () =>
      enabled
        ? {
            conversations: conversationStats?.totalConversations ?? conversationsLen,
            friends: conversationStats?.totalFriends ?? friendsLen,
            messages: conversationStats?.totalMessages ?? 0,
            achievements: conversationStats?.totalAchievementsEarned ?? 0,
          }
        : {
            conversations: 0,
            friends: 0,
            messages: 0,
            achievements: 0,
          },
    [enabled, conversationStats, conversationsLen, friendsLen],
  );

  return {
    mode: 'identity',
    loading: enabled && loading,
    stats,
    primarySteps,
    secondarySteps,
  };
}
