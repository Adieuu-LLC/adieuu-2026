import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type SiteAnnouncement } from '@adieuu/shared';
import { useAppConfig } from '../config';

const STORAGE_PREFIX = 'adieuu_dismissed_announcement_';
const POLL_INTERVAL_MS = 60 * 1000;

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
}

function persistDismiss(id: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1');
  } catch {
    // storage full or blocked -- dismissal will not persist
  }
}

function isWithinTimeWindow(announcement: SiteAnnouncement): boolean {
  const now = Date.now();
  if (announcement.showAfter && new Date(announcement.showAfter).getTime() > now) return false;
  if (announcement.showUntil && new Date(announcement.showUntil).getTime() < now) return false;
  return true;
}

export interface SiteAnnouncementsContextValue {
  announcements: SiteAnnouncement[];
  dismissedIds: Set<string>;
  dismiss: (id: string) => void;
}

const SiteAnnouncementsContext = createContext<SiteAnnouncementsContextValue | null>(null);

export function SiteAnnouncementsProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [announcements, setAnnouncements] = useState<SiteAnnouncement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.announcements.getActive();
      if (res.success && res.data) {
        const visible = res.data.announcements.filter(isWithinTimeWindow);
        setAnnouncements(visible);

        const dismissed = new Set<string>();
        for (const a of visible) {
          if (isDismissed(a.id)) dismissed.add(a.id);
        }
        setDismissedIds(dismissed);
      }
    } catch {
      // silent -- announcements are non-critical
    }
  }, [api]);

  const lastFetchRef = useRef(0);

  useEffect(() => {
    void load();
    lastFetchRef.current = Date.now();

    const interval = setInterval(() => {
      void load();
      lastFetchRef.current = Date.now();
    }, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchRef.current;
        if (elapsed >= POLL_INTERVAL_MS) {
          void load();
          lastFetchRef.current = Date.now();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const dismiss = useCallback((id: string) => {
    const target = announcements.find((a) => a.id === id);
    if (!target?.dismissable) return;
    persistDismiss(id);
    setDismissedIds((prev) => new Set(prev).add(id));
  }, [announcements]);

  const value = useMemo(
    () => ({ announcements, dismissedIds, dismiss }),
    [announcements, dismissedIds, dismiss],
  );

  return (
    <SiteAnnouncementsContext.Provider value={value}>
      {children}
    </SiteAnnouncementsContext.Provider>
  );
}

export function useSiteAnnouncements(): SiteAnnouncementsContextValue {
  const ctx = useContext(SiteAnnouncementsContext);
  if (!ctx) {
    throw new Error('useSiteAnnouncements must be used within a SiteAnnouncementsProvider');
  }
  return ctx;
}
