import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type AuthSession } from '@chadder/shared';

// Create API client
const api = createApiClient({ baseUrl: '' });

// ============================================================================
// Auth State Types
// ============================================================================

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
}

export interface AuthContextValue extends AuthState {
  requestOtp: (identifier: string, type: 'email' | 'sms') => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (identifier: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

// ============================================================================
// Auth Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEY = 'chadder_session';

// ============================================================================
// Auth Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthState(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
  });

  // Load session from storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored) as AuthSession;
        setState({ status: 'authenticated', session });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setState({ status: 'unauthenticated', session: null });
      }
    } else {
      setState({ status: 'unauthenticated', session: null });
    }
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
  }, []);

  const verifyOtp = useCallback(async (identifier: string, code: string) => {
    const response = await api.auth.verifyOtp({ identifier, code });

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Invalid code',
      };
    }

    // Store session
    if (response.data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.data));
      setState({ status: 'authenticated', session: response.data });
    }

    return { success: true };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ status: 'unauthenticated', session: null });
  }, []);

  return {
    ...state,
    requestOtp,
    verifyOtp,
    logout,
  };
}

// ============================================================================
// Auth Provider Component
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
