import { createContext, useContext, type ReactNode } from 'react';
import { useUpdateCheck, type UseUpdateCheckResult } from './useUpdateCheck';

const UpdateContext = createContext<UseUpdateCheckResult | null>(null);

export interface UpdateProviderProps {
  children: ReactNode;
}

/**
 * Single provider for update state. Instantiates one useUpdateCheck and
 * shares it across all consumers, avoiding duplicate IPC listeners.
 */
export function UpdateProvider({ children }: UpdateProviderProps) {
  const update = useUpdateCheck();

  return (
    <UpdateContext.Provider value={update}>
      {children}
    </UpdateContext.Provider>
  );
}

/**
 * Consume update state from the nearest UpdateProvider.
 * Falls back to calling useUpdateCheck directly if no provider is present
 * (e.g. on web where the provider may be omitted).
 */
export function useUpdateContext(): UseUpdateCheckResult {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error('useUpdateContext must be used within an UpdateProvider');
  }
  return ctx;
}
