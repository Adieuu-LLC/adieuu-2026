/**
 * Listens for subscription upgrade events on account sessions and shows
 * SubscriptionUpgradedModal. Polls pending events while authenticated at
 * account level (not identity mode).
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAccountEventPolling } from '../hooks/useAccountEventPolling';
import { SubscriptionUpgradedModal } from './SubscriptionUpgradedModal';
import {
  onSubscriptionUpgraded,
  resetSubscriptionEmitHistory,
  type SubscriptionUpgradedEvent,
} from '../services/subscriptionEvents';
import type { PublicPendingAccountEvent } from '@adieuu/shared';

const CLOSE_ANIMATION_MS = 300;

export function SubscriptionChangeListener() {
  const { status, refreshSession } = useAuth();
  const { dismiss } = useAccountEventPolling({
    enabled: status === 'authenticated',
  });

  const [queue, setQueue] = useState<PublicPendingAccountEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      resetSubscriptionEmitHistory();
      setQueue([]);
      setModalOpen(false);
    }
  }, [status]);

  const handleUpgraded = useCallback((event: SubscriptionUpgradedEvent) => {
    setQueue((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [...prev, event];
    });
  }, []);

  useEffect(() => {
    return onSubscriptionUpgraded(handleUpgraded);
  }, [handleUpgraded]);

  useEffect(() => {
    if (!modalOpen && queue.length > 0) {
      const timer = setTimeout(() => setModalOpen(true), CLOSE_ANIMATION_MS);
      return () => clearTimeout(timer);
    }
  }, [modalOpen, queue.length]);

  const handleDismiss = useCallback(
    (open: boolean) => {
      if (open) return;
      const current = queue[0];
      setModalOpen(false);
      setQueue((prev) => prev.slice(1));

      if (current) {
        void dismiss(current.id);
        void refreshSession().catch(() => {});
      }
    },
    [dismiss, queue, refreshSession],
  );

  const current = queue[0] ?? null;
  if (!current) return null;

  return (
    <SubscriptionUpgradedModal
      open={modalOpen}
      onOpenChange={handleDismiss}
      event={current}
    />
  );
}
