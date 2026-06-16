import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient, type FeedbackNotificationPrefs } from '@adieuu/shared';
import { useAppConfig } from '../config';

const DEFAULTS: FeedbackNotificationPrefs = {
  notifyPostReplies: true,
  notifyCommentReplies: true,
  notifyOfficialPosts: true,
};

export function useFeedbackNotificationPrefs(enabled: boolean) {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [prefs, setPrefs] = useState<FeedbackNotificationPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setPrefs(DEFAULTS);
      return;
    }

    requestIdRef.current += 1;
    const id = requestIdRef.current;
    setLoading(true);

    void (async () => {
      try {
        const res = await api.feedback.getNotificationPrefs();
        if (id !== requestIdRef.current) return;
        if (res.success && res.data) {
          setPrefs(res.data);
        }
      } catch {
        /* silent */
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    })();
  }, [api, enabled]);

  const toggle = useCallback(
    async (field: keyof FeedbackNotificationPrefs) => {
      const newValue = !prefs[field];
      setPrefs((prev) => ({ ...prev, [field]: newValue }));

      try {
        const res = await api.feedback.updateNotificationPrefs({ [field]: newValue });
        if (res.success && res.data) {
          setPrefs(res.data);
        }
      } catch {
        setPrefs((prev) => ({ ...prev, [field]: !newValue }));
      }
    },
    [api, prefs],
  );

  const togglePostReplies = useCallback(() => toggle('notifyPostReplies'), [toggle]);
  const toggleCommentReplies = useCallback(() => toggle('notifyCommentReplies'), [toggle]);
  const toggleOfficialPosts = useCallback(() => toggle('notifyOfficialPosts'), [toggle]);

  return {
    ...prefs,
    loading,
    togglePostReplies,
    toggleCommentReplies,
    toggleOfficialPosts,
  };
}
