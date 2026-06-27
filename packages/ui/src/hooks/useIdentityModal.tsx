import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { IdentityModal } from '../app/IdentityModal';
import { useIdentity } from './useIdentity';

type IdentityModalContextValue = {
  openIdentityModal: () => void;
  closeIdentityModal: () => void;
};

const IdentityModalContext = createContext<IdentityModalContextValue | null>(null);

export function IdentityModalProvider({ children }: { children: ReactNode }) {
  const { status: identityStatus, identity, suspensionInfo } = useIdentity();
  const isIdentitySuspended = identityStatus === 'suspended' && !!suspensionInfo;
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;
  const isIdentityLocked = identityStatus === 'locked' && !!identity;

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isIdentityLocked) {
      setIsOpen(true);
    }
  }, [isIdentityLocked]);

  const openIdentityModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeIdentityModal = useCallback(() => {
    if (isIdentityLocked) return;
    setIsOpen(false);
  }, [isIdentityLocked]);

  const value = useMemo(
    () => ({ openIdentityModal, closeIdentityModal }),
    [closeIdentityModal, openIdentityModal],
  );

  const showModalHost =
    !isIdentitySuspended && (!isIdentityLoggedIn || isIdentityLocked);

  const modalOpen = isIdentityLocked || isOpen;

  return (
    <IdentityModalContext.Provider value={value}>
      {children}
      {showModalHost ? (
        <IdentityModal
          isOpen={modalOpen}
          onClose={closeIdentityModal}
          unlockMode={!!isIdentityLocked}
        />
      ) : null}
    </IdentityModalContext.Provider>
  );
}

export function useIdentityModal(): IdentityModalContextValue {
  const ctx = useContext(IdentityModalContext);
  if (!ctx) {
    throw new Error('useIdentityModal must be used within IdentityModalProvider');
  }
  return ctx;
}

/** Returns null when rendered outside IdentityModalProvider (e.g. unauthenticated public shell). */
export function useOptionalIdentityModal(): IdentityModalContextValue | null {
  return useContext(IdentityModalContext);
}
