import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';
import { useConversations } from '../../hooks/useConversations';
import { useMessageAchievements } from '../../hooks/useMessageAchievements';
import { clearConversationScrollCache } from '../../hooks/useConversationScroll';
import { createApiClient } from '@adieuu/shared';
import type { MediaOutboxJobRecord, MediaOutboxEnqueueInput } from './mediaOutboxTypes';
import {
  mediaOutboxDeleteJob,
  mediaOutboxGetJob,
  mediaOutboxListAllJobs,
  mediaOutboxPutJob,
} from './mediaOutboxDb';
import { processMediaOutboxJob } from './mediaOutboxProcessJob';
import {
  MEDIA_OUTBOX_COMPLETED_RETENTION_MS,
  MEDIA_OUTBOX_MAX_CONCURRENT_JOBS,
  MEDIA_OUTBOX_PUMP_COOLDOWN_MS,
} from './mediaOutboxConstants';

type OutboxHooks = {
  markJustSent: () => void;
  scrollToBottom: (behavior: 'smooth' | 'auto') => void;
};

export interface MediaOutboxContextValue {
  enqueueMediaSend: (input: MediaOutboxEnqueueInput) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  dismissFailedJob: (jobId: string) => Promise<void>;
  registerConversationOutboxHooks: (conversationId: string, hooks: OutboxHooks | null) => void;
  getJobsForConversation: (conversationId: string) => MediaOutboxJobRecord[];
  getPendingJobsAllConversations: () => MediaOutboxJobRecord[];
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => MediaOutboxJobRecord[];
}

const MediaOutboxContext = createContext<MediaOutboxContextValue | null>(null);

const RUNNABLE_STAGES = new Set<MediaOutboxJobRecord['stage']>([
  'queued',
  'preparing',
  'encrypting',
  'uploading_e2e',
  'sending',
  'scan_upload',
]);

function isTerminal(stage: MediaOutboxJobRecord['stage']): boolean {
  return stage === 'completed' || stage === 'cancelled';
}

export function MediaOutboxProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const { sendTextMessage, jumpToLatestMessages, setIsAtBottom, computeAtLiveTail } = useConversations();

  const checkMessageAchievements = useMessageAchievements();

  const hooksRef = useRef(new Map<string, OutboxHooks>());
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const activeRunCountRef = useRef(0);
  const processingIdsRef = useRef(new Set<string>());

  const cacheRef = useRef<MediaOutboxJobRecord[]>([]);
  const listenersRef = useRef(new Set<() => void>());

  const notify = useCallback(() => {
    listenersRef.current.forEach((l) => l());
  }, []);

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange);
    return () => {
      listenersRef.current.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => cacheRef.current, []);

  const refreshCache = useCallback(async () => {
    cacheRef.current = await mediaOutboxListAllJobs();
    notify();
  }, [notify]);

  const saveJob = useCallback(
    async (job: MediaOutboxJobRecord) => {
      if (job.stage === 'completed' && MEDIA_OUTBOX_COMPLETED_RETENTION_MS === 0) {
        await mediaOutboxDeleteJob(job.id);
      } else if (job.stage === 'cancelled') {
        await mediaOutboxDeleteJob(job.id);
      } else {
        await mediaOutboxPutJob(job);
      }
      await refreshCache();
    },
    [refreshCache]
  );

  const toastScanFailed = useCallback(() => {
    toast.error(
      t('conversations.uploadFailed', 'Upload failed'),
      t(
        'conversations.scanUploadFailedDesc',
        'Preview upload for safety checks did not finish. The attachment may stay pending until you retry.',
      ),
    );
  }, [toast, t]);

  const sendForOutbox = useCallback(
    async (
      conversationId: string,
      plaintext: string,
      options: {
        useForwardSecrecy?: boolean;
        replyToMessageId?: string;
        expiresInSeconds?: number;
        e2eMediaIds?: string[];
        mentionedIdentityIds?: string[];
        signal?: AbortSignal;
      }
    ) => {
      const { signal, ...sendOpts } = options;
      const atLiveTailBefore = computeAtLiveTail(conversationId);
      const result = await sendTextMessage(conversationId, plaintext, {
        ...sendOpts,
        skipMessageStateUpdate: !atLiveTailBefore,
        suppressGlobalSending: true,
        signal,
      });
      if (result != null && typeof result === 'object' && 'errorCode' in result && result.errorCode === 'BLOCKED') {
        return result;
      }
      if (result != null && typeof result === 'object' && !('errorCode' in result)) {
        checkMessageAchievements(plaintext);
        const hooks = hooksRef.current.get(conversationId);
        if (!atLiveTailBefore) {
          clearConversationScrollCache(conversationId);
          setIsAtBottom(true);
          await jumpToLatestMessages(conversationId);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => hooks?.scrollToBottom('smooth'));
          });
        } else {
          hooks?.markJustSent();
        }
      }
      return result;
    },
    [sendTextMessage, computeAtLiveTail, checkMessageAchievements, setIsAtBottom, jumpToLatestMessages]
  );

  const pumpRef = useRef<() => void>(() => {});

  pumpRef.current = () => {
    void (async () => {
      if (activeRunCountRef.current >= MEDIA_OUTBOX_MAX_CONCURRENT_JOBS) return;

      const all = await mediaOutboxListAllJobs();
      const next = all
        .filter((j) => RUNNABLE_STAGES.has(j.stage))
        .sort((a, b) => a.createdAt - b.createdAt)
        .find((j) => !processingIdsRef.current.has(j.id));

      if (!next) return;

      processingIdsRef.current.add(next.id);
      activeRunCountRef.current += 1;
      const ac = new AbortController();
      abortControllersRef.current.set(next.id, ac);

      try {
        await processMediaOutboxJob(next.id, {
          api,
          abortSignal: ac.signal,
          loadJob: mediaOutboxGetJob,
          saveJob,
          sendForOutbox,
          toastScanFailed,
          t,
        });
      } finally {
        abortControllersRef.current.delete(next.id);
        processingIdsRef.current.delete(next.id);
        activeRunCountRef.current -= 1;
        await refreshCache();
        globalThis.setTimeout(() => pumpRef.current(), MEDIA_OUTBOX_PUMP_COOLDOWN_MS);
      }
    })();
  };

  useEffect(() => {
    void refreshCache().then(() => pumpRef.current());
  }, [refreshCache]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const pending = cacheRef.current.filter((j) => !isTerminal(j.stage));
      if (pending.length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    globalThis.addEventListener('beforeunload', onBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const enqueueMediaSend = useCallback(
    async (input: MediaOutboxEnqueueInput): Promise<string> => {
      const id =
        typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      const mentionsJson = JSON.stringify(
        input.mentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }))
      );
      const attachmentBlobs = await Promise.all(
        input.files.map(async (f) => ({
          name: f.name,
          type: f.type,
          blob: new Blob([await f.arrayBuffer()], { type: f.type }),
        }))
      );
      const record: MediaOutboxJobRecord = {
        id,
        conversationId: input.conversationId,
        stage: 'queued',
        createdAt: now,
        updatedAt: now,
        caption: input.caption,
        mentionsJson,
        replyToMessageId: input.replyToMessageId,
        ttlSeconds: input.ttlSeconds,
        useForwardSecrecy: input.useForwardSecrecy,
        stripExif: input.stripExif,
        ...(input.sendMp4WithoutReencode === true ? { sendMp4WithoutReencode: true } : {}),
        attachmentBlobs,
      };
      await mediaOutboxPutJob(record);
      await refreshCache();
      pumpRef.current();
      return id;
    },
    [refreshCache]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      abortControllersRef.current.get(jobId)?.abort();
      await mediaOutboxDeleteJob(jobId);
      await refreshCache();
      pumpRef.current();
    },
    [refreshCache]
  );

  const retryJob = useCallback(
    async (jobId: string) => {
      const j = await mediaOutboxGetJob(jobId);
      if (!j || j.stage !== 'failed') return;
      let nextStage: MediaOutboxJobRecord['stage'] = 'queued';
      if (j.messageSendCompleted === true) nextStage = 'scan_upload';
      else if (j.e2eSnapshot?.length) nextStage = 'sending';
      const patch: Partial<MediaOutboxJobRecord> = {
        stage: nextStage,
        errorMessage: undefined,
        updatedAt: Date.now(),
      };
      await mediaOutboxPutJob({ ...j, ...patch });
      await refreshCache();
      pumpRef.current();
    },
    [refreshCache]
  );

  const dismissFailedJob = useCallback(
    async (jobId: string) => {
      await mediaOutboxDeleteJob(jobId);
      await refreshCache();
    },
    [refreshCache]
  );

  const registerConversationOutboxHooks = useCallback((conversationId: string, hooks: OutboxHooks | null) => {
    if (hooks == null) hooksRef.current.delete(conversationId);
    else hooksRef.current.set(conversationId, hooks);
  }, []);

  const value = useMemo<MediaOutboxContextValue>(
    () => ({
      enqueueMediaSend,
      cancelJob,
      retryJob,
      dismissFailedJob,
      registerConversationOutboxHooks,
      getJobsForConversation: (conversationId: string) =>
        cacheRef.current.filter((j) => j.conversationId === conversationId),
      getPendingJobsAllConversations: () => cacheRef.current.filter((j) => !isTerminal(j.stage)),
      subscribe,
      getSnapshot,
    }),
    [
      enqueueMediaSend,
      cancelJob,
      retryJob,
      dismissFailedJob,
      registerConversationOutboxHooks,
      subscribe,
      getSnapshot,
    ]
  );

  return <MediaOutboxContext.Provider value={value}>{children}</MediaOutboxContext.Provider>;
}

export function useMediaOutbox(): MediaOutboxContextValue {
  const ctx = useContext(MediaOutboxContext);
  if (!ctx) {
    throw new Error('useMediaOutbox must be used within MediaOutboxProvider');
  }
  return ctx;
}

export function useMediaOutboxJobList(): MediaOutboxJobRecord[] {
  const ctx = useContext(MediaOutboxContext);
  return useSyncExternalStore(
    ctx?.subscribe ?? (() => () => {}),
    ctx?.getSnapshot ?? (() => []),
    () => []
  );
}
