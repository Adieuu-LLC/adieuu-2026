import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ConversationScanJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ConversationScanJob {
  id: string;
  conversationId: string;
  fileName: string;
  e2eMediaId: string;
  status: ConversationScanJobStatus;
  errorMessage?: string;
  startedAt: number;
  abortController: AbortController;
}

export interface ConversationScanJobsContextValue {
  jobs: ConversationScanJob[];
  startJob: (input: { fileName: string; e2eMediaId: string }) => { jobId: string; signal: AbortSignal };
  completeJob: (jobId: string) => void;
  failJob: (jobId: string, errorMessage: string) => void;
  cancelJob: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
}

export const ConversationScanJobsContext = createContext<ConversationScanJobsContextValue | null>(null);

export function useConversationScanJobs(): ConversationScanJobsContextValue | null {
  return useContext(ConversationScanJobsContext);
}

export function ConversationScanJobsProvider({
  conversationId,
  children,
}: {
  conversationId: string;
  children: ReactNode;
}) {
  const [jobs, setJobs] = useState<ConversationScanJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearDismissTimer = useCallback((jobId: string) => {
    const t = dismissTimers.current.get(jobId);
    if (t) clearTimeout(t);
    dismissTimers.current.delete(jobId);
  }, []);

  useEffect(() => {
    return () => {
      dismissTimers.current.forEach((t) => clearTimeout(t));
      dismissTimers.current.clear();
    };
  }, []);

  useEffect(
    () => () => {
      for (const j of jobsRef.current) {
        if (j.status === 'running') j.abortController.abort();
      }
    },
    []
  );

  const dismissJob = useCallback(
    (jobId: string) => {
      clearDismissTimer(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    },
    [clearDismissTimer]
  );

  const startJob = useCallback(
    (input: { fileName: string; e2eMediaId: string }) => {
      const jobId =
        typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const abortController = new AbortController();
      setJobs((prev) => [
        ...prev,
        {
          id: jobId,
          conversationId,
          fileName: input.fileName,
          e2eMediaId: input.e2eMediaId,
          status: 'running',
          startedAt: Date.now(),
          abortController,
        },
      ]);
      return { jobId, signal: abortController.signal };
    },
    [conversationId]
  );

  const completeJob = useCallback(
    (jobId: string) => {
      setJobs((prev) => {
        const j = prev.find((x) => x.id === jobId);
        if (!j || j.status !== 'running') return prev;
        const tOld = dismissTimers.current.get(jobId);
        if (tOld) clearTimeout(tOld);
        dismissTimers.current.delete(jobId);
        const t = setTimeout(() => dismissJob(jobId), 6000);
        dismissTimers.current.set(jobId, t);
        return prev.map((x) => (x.id === jobId ? { ...x, status: 'completed' as const } : x));
      });
    },
    [dismissJob]
  );

  const failJob = useCallback((jobId: string, errorMessage: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === jobId);
      if (!j || j.status !== 'running') return prev;
      const tOld = dismissTimers.current.get(jobId);
      if (tOld) clearTimeout(tOld);
      dismissTimers.current.delete(jobId);
      return prev.map((x) =>
        x.id === jobId ? { ...x, status: 'failed' as const, errorMessage } : x
      );
    });
  }, []);

  const cancelJob = useCallback(
    (jobId: string) => {
      setJobs((prev) => {
        const j = prev.find((x) => x.id === jobId);
        if (!j || j.status !== 'running') return prev;
        j.abortController.abort();
        clearDismissTimer(jobId);
        const next = prev.map((x) =>
          x.id === jobId ? { ...x, status: 'cancelled' as const } : x
        );
        const t = setTimeout(() => dismissJob(jobId), 2500);
        dismissTimers.current.set(jobId, t);
        return next;
      });
    },
    [clearDismissTimer, dismissJob]
  );

  const value = useMemo(
    () => ({
      jobs,
      startJob,
      completeJob,
      failJob,
      cancelJob,
      dismissJob,
    }),
    [jobs, startJob, completeJob, failJob, cancelJob, dismissJob]
  );

  return (
    <ConversationScanJobsContext.Provider value={value}>{children}</ConversationScanJobsContext.Provider>
  );
}
