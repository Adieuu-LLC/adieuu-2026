import { useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import { useToast } from './Toast';
import { VpnComplianceModal } from './VpnComplianceModal';
import { AbusiveIpModal } from './AbusiveIpModal';

export function ComplianceModals() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    session,
    abusiveIpNotice,
    clearAbusiveIpNotice,
    refreshSession,
  } = useAuth();

  const vpnAttestation = session?.compliance?.vpnAttestation;

  const handleVpnComplete = useCallback(async () => {
    const updated = await refreshSession();
    if (!updated) {
      const message = t('compliance.vpn.sessionRefreshFailed');
      toast.error(message);
      throw new Error('SESSION_REFRESH_FAILED');
    }
  }, [refreshSession, t, toast]);

  return (
    <>
      {vpnAttestation?.required && (
        <VpnComplianceModal
          open
          vpnAttestation={vpnAttestation}
          onComplete={handleVpnComplete}
        />
      )}
      {!vpnAttestation?.required && (
        <AbusiveIpModal
          open={!!abusiveIpNotice}
          message={abusiveIpNotice ?? undefined}
          onAcknowledge={clearAbusiveIpNotice}
        />
      )}
    </>
  );
}
