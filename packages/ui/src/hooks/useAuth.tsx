import { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  createApiClient,
  API_ERROR_SESSION_EXPIRED,
  API_ERROR_ABUSIVE_IP_BLOCKED,
  API_ERROR_ACCOUNT_DELETED,
  type SessionInfo,
  type SubscriptionTierId,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@adieuu/shared';
import { useAppConfig, usePlatformCapabilities } from '../config';
import {
  resolveAccountRestriction,
  type AccountRestrictionInfo,
} from '../services/authRestrictionFlow';
import { ComplianceModals } from '../components/ComplianceModals';
import { tryRedeemPendingReferral } from '../services/referralRedemption';
import { crashReporter } from '../services/crashReporter';

/** Delay (ms) before retrying the initial session check on cold start. */
const MOUNT_RETRY_DELAY_MS = 750;

/** Periodic session refresh while authenticated (compliance IP re-check). */
const SESSION_POLL_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Structural equality for auth state. Used to skip no-op setState calls
 * (e.g. the 10-minute compliance poll) so the auth context reference stays
 * stable and consumers don't re-render when nothing actually changed.
 */
function authStateEqual(a: AuthState, b: AuthState): boolean {
  if (a.status !== b.status) return false;
  if (a.session === b.session) return true;
  if (!a.session || !b.session) return false;
  return JSON.stringify(a.session) === JSON.stringify(b.session);
}

// ============================================================================
// Auth State Types
// ============================================================================

export type AuthStatus = 'loading' | 'authenticated' | 'identity_mode' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: SessionInfo | null;
}

export interface MfaChallenge {
  mfaToken: string;
  mfaOptions: {
    totp: boolean;
    webauthn: boolean;
  };
  webauthnChallenge?: PublicKeyCredentialRequestOptionsJSON;
}

export type VerifyOtpResult =
  | { success: true; mfaRequired?: false }
  | { success: true; mfaRequired: true; mfaChallenge: MfaChallenge }
  | { success: false; error: string; restriction?: AccountRestrictionInfo };

export type MfaCompletionResult =
  | { success: true }
  | { success: false; error: string; restriction?: AccountRestrictionInfo };

export interface AuthContextValue extends AuthState {
  requestOtp: (identifier: string, type: 'email' | 'sms') => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (identifier: string, code: string) => Promise<VerifyOtpResult>;
  completeMfaTotp: (mfaToken: string, code: string) => Promise<MfaCompletionResult>;
  completeMfaWebAuthn: (mfaToken: string, webauthnChallenge: PublicKeyCredentialRequestOptionsJSON) => Promise<MfaCompletionResult>;
  logout: () => Promise<void>;
  /** Refresh session status from server. Returns the fresh session or null. */
  refreshSession: () => Promise<SessionInfo | null>;
  /** Set when session/login blocked due to abusive IP (shows modal). */
  abusiveIpNotice: string | null;
  clearAbusiveIpNotice: () => void;
}

// ============================================================================
// Auth Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Auth Hook
// ============================================================================

/**
 * Hook to access authentication state and methods.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Internal hook that manages auth state.
 * Uses the API base URL from platform context.
 */
function useAuthState(): AuthContextValue {
  const { apiBaseUrl } = useAppConfig();
  const { webauthn: webauthnBridge } = usePlatformCapabilities();

  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
  });
  const [abusiveIpNotice, setAbusiveIpNotice] = useState<string | null>(null);

  const clearAbusiveIpNotice = useCallback(() => {
    setAbusiveIpNotice(null);
  }, []);

  const onSessionExpired = useCallback(() => {
    setState({
      status: 'unauthenticated',
      session: null,
    });
  }, []);

  // Memoize the API client to avoid recreating on every render
  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, onSessionExpired }),
    [apiBaseUrl, onSessionExpired],
  );

  // Check session status from server.
  // `retryOnce` is used only on mount: if the cookie store hasn't loaded yet
  // (cold start timing), the server returns UNAUTHORIZED even though a valid
  // cookie exists. A single delayed retry covers that window without slowing
  // normal startup.
  const refreshSession = useCallback(async (retryOnce = false): Promise<SessionInfo | null> => {
    try {
      const response = await api.auth.getSession();

      if (response.success && response.data) {
        const data = response.data as unknown as Record<string, unknown>;

        // Server returns { sessionType: 'identity' } when the cookie
        // holds an identity session instead of an account session.
        if ('sessionType' in data && data.sessionType === 'identity') {
          const identitySession: SessionInfo = {
            isPlatformAdmin: (data.isPlatformAdmin as boolean) ?? false,
            isPlatformModerator: (data.isPlatformModerator as boolean) ?? false,
            isPlatformSupportAgent: (data.isPlatformSupportAgent as boolean) ?? false,
            platformPermissions: (data.platformPermissions as string[]) ?? [],
            subscriptions: (data.subscriptions as SubscriptionTierId[]) ?? [],
            entitlements: (data.entitlements as string[]) ?? [],
            isLifetime: (data.isLifetime as boolean) ?? false,
          };
          const nextIdentityState: AuthState = { status: 'identity_mode', session: identitySession };
          setState((prev) => (authStateEqual(prev, nextIdentityState) ? prev : nextIdentityState));
          return identitySession;
        }

        const accountSession: SessionInfo = {
          ...response.data,
          isPlatformAdmin: false,
          isPlatformModerator: false,
          isPlatformSupportAgent: false,
          platformPermissions: [],
        };
        const nextAccountState: AuthState = { status: 'authenticated', session: accountSession };
        setState((prev) => (authStateEqual(prev, nextAccountState) ? prev : nextAccountState));
        return accountSession;
      } else {
        const code = response.error?.code;
        if (code === API_ERROR_ABUSIVE_IP_BLOCKED) {
          setAbusiveIpNotice(response.error?.message ?? null);
          setState({ status: 'unauthenticated', session: null });
          return null;
        }
        // SESSION_EXPIRED is definitive — the server cleared the cookie.
        // Any other failure on mount may be a cold-start timing issue
        // where the cookie hasn't been sent yet; retry once.
        if (retryOnce && code !== API_ERROR_SESSION_EXPIRED) {
          await new Promise((r) => setTimeout(r, MOUNT_RETRY_DELAY_MS));
          return refreshSession(false);
        }
        setState({ status: 'unauthenticated', session: null });
        return null;
      }
    } catch {
      if (retryOnce) {
        await new Promise((r) => setTimeout(r, MOUNT_RETRY_DELAY_MS));
        return refreshSession(false);
      }
      setState({ status: 'unauthenticated', session: null });
      return null;
    }
  }, [api]);

  // Check session on mount (retry-enabled for cold-start cookie timing)
  useEffect(() => {
    refreshSession(true);
  }, [refreshSession]);

  // Periodic compliance re-check while signed in at account level
  useEffect(() => {
    if (state.status !== 'authenticated') return undefined;
    const id = window.setInterval(() => {
      void refreshSession();
    }, SESSION_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state.status, refreshSession]);

  const handleVerifyError = useCallback((errorCode?: string, message?: string, details?: Record<string, unknown>) => {
    if (errorCode === API_ERROR_ACCOUNT_DELETED) {
      return {
        success: false as const,
        error: message ?? 'This email is associated with a deleted account and cannot be used to create a new account.',
        restriction: undefined,
      };
    }
    if (errorCode === API_ERROR_ABUSIVE_IP_BLOCKED) {
      setAbusiveIpNotice(message ?? null);
      setState({ status: 'unauthenticated', session: null });
      return { success: false as const, error: message ?? 'Network blocked', restriction: undefined };
    }
    const restriction = resolveAccountRestriction(
      errorCode,
      details as Parameters<typeof resolveAccountRestriction>[1],
    );
    return {
      success: false as const,
      error: message ?? 'Invalid code',
      restriction,
    };
  }, []);

  const requestOtp = useCallback(async (identifier: string, type: 'email' | 'sms') => {
    const response = await api.auth.requestOtp({ identifier, type });

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Failed to send code',
      };
    }

    return { success: true };
  }, [api]);

  const verifyOtp = useCallback(async (identifier: string, code: string): Promise<VerifyOtpResult> => {
    const response = await api.auth.verifyOtp({ identifier, code });

    if (!response.success) {
      return handleVerifyError(
        response.error?.code,
        response.error?.message,
        response.error?.details,
      );
    }

    // Check if MFA is required
    if (response.data?.mfaRequired && response.data.mfaToken && response.data.mfaOptions) {
      return {
        success: true,
        mfaRequired: true,
        mfaChallenge: {
          mfaToken: response.data.mfaToken,
          mfaOptions: response.data.mfaOptions,
          webauthnChallenge: response.data.webauthnChallenge,
        },
      };
    }

    // Session cookie is set by the server automatically
    // Refresh session to get the session info
    await refreshSession();
    await tryRedeemPendingReferral(api);

    return { success: true };
  }, [api, refreshSession, handleVerifyError]);

  const completeMfaTotp = useCallback(async (mfaToken: string, code: string): Promise<MfaCompletionResult> => {
    const response = await api.auth.verifyMfaTotp(mfaToken, code);

    if (!response.success) {
      return handleVerifyError(
        response.error?.code,
        response.error?.message,
        response.error?.details,
      );
    }

    // Session cookie is set by the server
    await refreshSession();
    await tryRedeemPendingReferral(api);
    return { success: true };
  }, [api, refreshSession, handleVerifyError]);

  const completeMfaWebAuthn = useCallback(async (mfaToken: string, webauthnChallenge: PublicKeyCredentialRequestOptionsJSON): Promise<MfaCompletionResult> => {
    try {
      let credential: unknown;

      if (webauthnBridge) {
        credential = await webauthnBridge.get(webauthnChallenge);
      } else {
        const { startAuthentication } = await import('@simplewebauthn/browser');
        credential = await startAuthentication({ optionsJSON: webauthnChallenge as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      }

      const response = await api.auth.verifyMfaWebAuthn(mfaToken, credential);

      if (!response.success) {
        return handleVerifyError(
          response.error?.code,
          response.error?.message,
          response.error?.details,
        );
      }

      await refreshSession();
      await tryRedeemPendingReferral(api);
      return { success: true };
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication was cancelled' };
      }
      return { success: false, error: 'WebAuthn authentication failed' };
    }
  }, [api, refreshSession, webauthnBridge, handleVerifyError]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setState({
      status: 'unauthenticated',
      session: null,
    });
    setAbusiveIpNotice(null);
  }, [api]);

  return useMemo<AuthContextValue>(
    () => ({
      ...state,
      requestOtp,
      verifyOtp,
      completeMfaTotp,
      completeMfaWebAuthn,
      logout,
      refreshSession,
      abusiveIpNotice,
      clearAbusiveIpNotice,
    }),
    [
      state,
      requestOtp,
      verifyOtp,
      completeMfaTotp,
      completeMfaWebAuthn,
      logout,
      refreshSession,
      abusiveIpNotice,
      clearAbusiveIpNotice,
    ],
  );
}

// ============================================================================
// Auth Provider Component
// ============================================================================

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider component that supplies authentication state to the app.
 * Must be nested inside a PlatformProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuthState();

  useEffect(() => {
    if (auth.status === 'authenticated' && auth.session?.identifier) {
      crashReporter.setUserContext({ type: 'account', identifier: auth.session.identifier });
    } else if (auth.status === 'unauthenticated') {
      crashReporter.setUserContext(null);
    }
  }, [auth.status, auth.session?.identifier]);

  return (
    <AuthContext.Provider value={auth}>
      <ComplianceModals />
      {children}
    </AuthContext.Provider>
  );
}
