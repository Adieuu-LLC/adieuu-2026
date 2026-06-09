import { useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { VpnComplianceModal } from './VpnComplianceModal';
import { AbusiveIpModal } from './AbusiveIpModal';

export function ComplianceModals() {
  const {
    session,
    abusiveIpNotice,
    clearAbusiveIpNotice,
    refreshSession,
  } = useAuth();

  const vpnAttestation = session?.compliance?.vpnAttestation;

  const handleVpnComplete = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  return (
    <>
      {vpnAttestation?.required && (
        <VpnComplianceModal
          open
          vpnAttestation={vpnAttestation}
          onComplete={handleVpnComplete}
        />
      )}
      <AbusiveIpModal
        open={!!abusiveIpNotice}
        message={abusiveIpNotice ?? undefined}
        onAcknowledge={clearAbusiveIpNotice}
      />
    </>
  );
}
