import { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type PublicIdentity } from '@chadder/shared';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';

// ============================================================================
// Identity State Types
// ============================================================================

export type IdentityStatus = 'loading' | 'logged_in' | 'logged_out' | 'no_identity';

export interface IdentityState {
  status: IdentityStatus;
  identity: PublicIdentity | null;
  /** Whether the user has created an identity (but may not be logged in) */
  hasIdentity: boolean;
}

export interface CreateIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'USERNAME_TAKEN' | 'MAX_IDENTITIES' | 'VALIDATION_ERROR';
}

export interface LoginIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'LOCKED_OUT' | 'RATE_LIMITED';
  attemptNumber?: number;
  retryAfter?: number;
}

export interface IdentityContextValue extends IdentityState {
  /** Create a new identity */
  createIdentity: (passphrase: string, username: string, displayName: string) => Promise<CreateIdentityResult>;
  /** Login to identity with passphrase */
  loginToIdentity: (passphrase: string) => Promise<LoginIdentityResult>;
  /** Logout from identity (but stay logged in as user) */
  logoutFromIdentity: () => Promise<void>;
  /** Delete the current identity */
  deleteIdentity: () => Promise<{ success: boolean; error?: string }>;
  /** Refresh identity session status */
  refreshIdentitySession: () => Promise<void>;
}

// ============================================================================
// Identity Context
// ============================================================================

const IdentityContext = createContext<IdentityContextValue | null>(null);

// ============================================================================
// Identity Hook
// ============================================================================

/**
 * Hook to access identity state and methods.
 * Must be used within an IdentityProvider.
 */
export function useIdentity(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
}

/**
 * Internal hook that manages identity state.
 */
function useIdentityState(): IdentityContextValue {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus } = useAuth();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [state, setState] = useState<IdentityState>({
    status: 'loading',
    identity: null,
    hasIdentity: false,
  });

  // Check identity session status
  const refreshIdentitySession = useCallback(async () => {
    // Only check if user is authenticated
    if (authStatus !== 'authenticated') {
      setState({
        status: 'logged_out',
        identity: null,
        hasIdentity: false,
      });
      return;
    }

    try {
      const response = await api.identity.getSession();

      if (response.success && response.data) {
        setState({
          status: 'logged_in',
          identity: response.data,
          hasIdentity: true,
        });
      } else {
        // Not logged into identity, but might have one
        setState((prev) => ({
          ...prev,
          status: 'logged_out',
          identity: null,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'logged_out',
        identity: null,
      }));
    }
  }, [api, authStatus]);

  // Check identity session when auth status changes
  useEffect(() => {
    if (authStatus === 'authenticated') {
      refreshIdentitySession();
    } else if (authStatus === 'unauthenticated') {
      setState({
        status: 'logged_out',
        identity: null,
        hasIdentity: false,
      });
    }
  }, [authStatus, refreshIdentitySession]);

  const createIdentity = useCallback(
    async (passphrase: string, username: string, displayName: string): Promise<CreateIdentityResult> => {
      const response = await api.identity.create({ passphrase, username, displayName });

      if (!response.success) {
        const errorMessage = response.error?.message ?? 'Failed to create identity';
        let errorCode: CreateIdentityResult['errorCode'];

        if (errorMessage.includes('taken')) {
          errorCode = 'USERNAME_TAKEN';
        } else if (errorMessage.includes('maximum')) {
          errorCode = 'MAX_IDENTITIES';
        } else {
          errorCode = 'VALIDATION_ERROR';
        }

        return {
          success: false,
          error: errorMessage,
          errorCode,
        };
      }

      // Update state with the new identity
      setState({
        status: 'no_identity', // Still need to login
        identity: null,
        hasIdentity: true,
      });

      return {
        success: true,
        identity: response.data,
      };
    },
    [api]
  );

  const loginToIdentity = useCallback(
    async (passphrase: string): Promise<LoginIdentityResult> => {
      const response = await api.identity.login({ passphrase });

      if (!response.success) {
        const errorMessage = response.error?.message ?? 'Invalid passphrase';
        let errorCode: LoginIdentityResult['errorCode'] = 'INVALID_PASSPHRASE';

        if (response.error?.code === 'LOCKED_OUT' || errorMessage.includes('locked')) {
          errorCode = 'LOCKED_OUT';
        } else if (response.error?.code === 'RATE_LIMITED' || errorMessage.includes('wait')) {
          errorCode = 'RATE_LIMITED';
        }

        return {
          success: false,
          error: errorMessage,
          errorCode,
        };
      }

      // Update state with the identity
      if (response.data?.identity) {
        setState({
          status: 'logged_in',
          identity: response.data.identity,
          hasIdentity: true,
        });

        return {
          success: true,
          identity: response.data.identity,
        };
      }

      return {
        success: false,
        error: 'Unexpected response',
      };
    },
    [api]
  );

  const logoutFromIdentity = useCallback(async () => {
    await api.identity.logout();
    setState((prev) => ({
      ...prev,
      status: 'logged_out',
      identity: null,
    }));
  }, [api]);

  const deleteIdentity = useCallback(async () => {
    const response = await api.identity.delete();

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Failed to delete identity',
      };
    }

    setState({
      status: 'no_identity',
      identity: null,
      hasIdentity: false,
    });

    return { success: true };
  }, [api]);

  return {
    ...state,
    createIdentity,
    loginToIdentity,
    logoutFromIdentity,
    deleteIdentity,
    refreshIdentitySession,
  };
}

// ============================================================================
// Identity Provider Component
// ============================================================================

export interface IdentityProviderProps {
  children: ReactNode;
}

/**
 * Provider component that supplies identity state to the app.
 * Must be nested inside an AuthProvider.
 */
export function IdentityProvider({ children }: IdentityProviderProps) {
  const identityState = useIdentityState();

  return <IdentityContext.Provider value={identityState}>{children}</IdentityContext.Provider>;
}
