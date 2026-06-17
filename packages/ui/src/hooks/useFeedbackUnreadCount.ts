import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { onFeedbackUnreadChanged } from '../services/feedbackEvents';

const POLL_INTERVAL_MS = 60_000;

export function useFeedbackUnreadCount(enabled: boolean): number {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [unreadCount, setUnreadCount] = useState(0);
  const requestIdRef = useRef(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;
    try {
      const res = await api.feedback.getUnreadSummary();
      if (requestId !== requestIdRef.current) return;
      if (res.success && res.data) {
        const total =
          (res.data.postReplies ?? 0) +
          (res.data.commentReplies ?? 0);
        setUnreadCount(total);
      }
    } catch {
      /* silent */
    }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setUnreadCount(0);
      return undefined;
    }

    requestIdRef.current += 1;
    void fetchCount();

    const interval = setInterval(() => void fetchCount(), POLL_INTERVAL_MS);
    const unsubUnread = onFeedbackUnreadChanged(() => void fetchCount());

    return () => {
      requestIdRef.current += 1;
      clearInterval(interval);
      unsubUnread();
    };
  }, [enabled, fetchCount]);

  return unreadCount;
}
