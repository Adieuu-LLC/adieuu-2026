import { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type SessionInfo } from '@chadder/shared';
import { useAppConfig } from '../config';

// ============================================================================
// Auth State Types
// ============================================================================

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: SessionInfo | null;
}

export interface AuthContextValue extends AuthState {
  requestOtp: (identifier: string, type: 'email' | 'sms') => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (identifier: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Refresh session status from server */
  refreshSession: () => Promise<void>;
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

  // Memoize the API client to avoid recreating on every render
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
  });

  // Check session status from server on mount
  const refreshSession = useCallback(async () => {
    try {
      const response = await api.auth.getSession();

      if (response.success && response.data) {
        setState({
          status: 'authenticated',
          session: response.data,
        });
      } else {
        setState({
          status: 'unauthenticated',
          session: null,
        });
      }
    } catch {
      setState({
        status: 'unauthenticated',
        session: null,
      });
    }
  }, [api]);

  // Check session on mount
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

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

  const verifyOtp = useCallback(async (identifier: string, code: string) => {
    const response = await api.auth.verifyOtp({ identifier, code });

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Invalid code',
      };
    }

    // Session cookie is set by the server automatically
    // Refresh session to get the session info
    await refreshSession();

    return { success: true };
  }, [api, refreshSession]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setState({
      status: 'unauthenticated',
      session: null,
    });
  }, [api]);

  return {
    ...state,
    requestOtp,
    verifyOtp,
    logout,
    refreshSession,
  };
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

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
