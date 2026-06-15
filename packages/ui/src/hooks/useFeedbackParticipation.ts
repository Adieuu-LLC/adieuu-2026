import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useIdentity } from './useIdentity';
import { useOptionalIdentityModal } from './useIdentityModal';

/**
 * Gate feedback participation (vote, post, comment) behind an active alias session.
 * Browsing remains public; this hook is for mutating actions only.
 */
export function useFeedbackParticipation() {
  const { status: authStatus } = useAuth();
  const { status: identityStatus } = useIdentity();
  const identityModal = useOptionalIdentityModal();
  const navigate = useNavigate();
  const location = useLocation();

  const canParticipate = identityStatus === 'logged_in';

  const requireIdentitySession = useCallback(() => {
    if (canParticipate) return true;

    if (authStatus === 'unauthenticated') {
      navigate('/auth/login', { state: { from: location.pathname } });
      return false;
    }

    if (identityModal) {
      identityModal.openIdentityModal();
    } else {
      navigate('/auth/login', { state: { from: location.pathname } });
    }
    return false;
  }, [authStatus, canParticipate, identityModal, location.pathname, navigate]);

  return { canParticipate, requireIdentitySession };
}
