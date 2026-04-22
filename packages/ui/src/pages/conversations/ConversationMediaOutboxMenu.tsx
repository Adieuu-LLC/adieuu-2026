import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { useMediaOutbox, useMediaOutboxJobList } from '../../services/mediaOutbox';
import type { MediaOutboxJobRecord } from '../../services/mediaOutbox';

function stageLabel(job: MediaOutboxJobRecord, t: (key: string, fallback: string) => string): string {
  switch (job.stage) {
    case 'queued':
      return t('conversations.mediaOutbox.stageQueued', 'Queued');
    case 'preparing':
      return t('conversations.mediaOutbox.stagePreparing', 'Preparing media…');
    case 'encrypting':
      return t('conversations.mediaOutbox.stageEncrypting', 'Encrypting…');
    case 'uploading_e2e':
      return t('conversations.mediaOutbox.stageUploading', 'Uploading…');
    case 'sending':
      return t('conversations.mediaOutbox.stageSending', 'Sending message…');
    case 'scan_upload':
      return t('conversations.mediaOutbox.stageScan', 'Safety scan uploading…');
    case 'failed':
      return t('conversations.mediaOutbox.stageFailed', 'Failed');
    case 'cancelled':
      return t('conversations.mediaOutbox.stageCancelled', 'Cancelled');
    default:
      return '';
  }
}

function jobTitle(job: MediaOutboxJobRecord): string {
  const fromBlob = job.attachmentBlobs[0]?.name;
  const fromSnap = job.e2eSnapshot?.[0]?.fileName;
  if (fromBlob) return fromBlob;
  if (fromSnap) return fromSnap;
  return 'Media';
}

export function ConversationMediaOutboxMenu({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const { cancelJob, retryJob, dismissFailedJob } = useMediaOutbox();
  const allJobs = useMediaOutboxJobList();
  const jobs = useMemo(
    () => allJobs.filter((j) => j.conversationId === conversationId),
    [allJobs, conversationId]
  );
  const sorted = useMemo(() => [...jobs].sort((a, b) => b.createdAt - a.createdAt), [jobs]);

  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
      width: 'min(100vw - 2rem, 380px)',
      maxHeight: 'min(320px, calc(100vh - 3rem))',
      zIndex: 1400,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onWin = () => updatePanelPosition();
    window.addEventListener('resize', onWin);
    return () => window.removeEventListener('resize', onWin);
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  const badgeCount = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.stage !== 'completed' &&
          j.stage !== 'cancelled' &&
          j.stage !== 'failed'
      ).length,
    [jobs]
  );

  const failedCount = useMemo(() => jobs.filter((j) => j.stage === 'failed').length, [jobs]);

  const panelBadge = badgeCount + failedCount;

  const panel = open ? (
    <div
      ref={panelRef}
      id="conversation-media-outbox-panel"
      className="conversation-scan-jobs-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversation-media-outbox-panel-title"
    >
      <div className="conversation-scan-jobs-panel-header">
        <div id="conversation-media-outbox-panel-title" className="conversation-scan-jobs-panel-title">
          {t('conversations.mediaOutbox.panelTitle', 'Pending media sends')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="conversation-scan-jobs-panel-close"
          aria-label={t('conversations.mediaOutbox.closePanel', 'Close')}
          onClick={() => setOpen(false)}
        >
          <Icon name="x" size="sm" />
        </Button>
      </div>
      <div className="conversation-scan-jobs-panel-scroll">
        {sorted.length === 0 ? (
          <p className="conversation-scan-jobs-empty">
            {t('conversations.mediaOutbox.empty', 'No pending uploads for this chat.')}
          </p>
        ) : (
          sorted.map((job) => (
            <div key={job.id} className="conversation-scan-jobs-row">
              <span className="conversation-scan-jobs-row-icon" aria-hidden>
                {job.stage === 'failed' ? (
                  <Icon name="error" size="sm" />
                ) : job.stage === 'cancelled' ? (
                  <Icon name="x" size="sm" />
                ) : (
                  <span className="spinner spinner-sm" />
                )}
              </span>
              <div className="conversation-scan-jobs-row-body">
                <div className="conversation-scan-jobs-row-name" title={jobTitle(job)}>
                  {jobTitle(job)}
                </div>
                <div className="conversation-scan-jobs-row-status">
                  {stageLabel(job, t)}
                  {job.stage === 'failed' && job.errorMessage ? ` — ${job.errorMessage}` : ''}
                </div>
              </div>
              <div className="conversation-scan-jobs-row-actions">
                {job.stage !== 'failed' &&
                  job.stage !== 'cancelled' &&
                  job.stage !== 'completed' && (
                    <Tooltip
                      content={t('conversations.mediaOutbox.cancel', 'Cancel send')}
                      position="top"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="conversation-scan-jobs-row-btn"
                        aria-label={t('conversations.mediaOutbox.cancel', 'Cancel send')}
                        onClick={() => void cancelJob(job.id)}
                      >
                        <Icon name="ban" size="sm" />
                      </Button>
                    </Tooltip>
                  )}
                {job.stage === 'failed' && (
                  <>
                    <Tooltip content={t('conversations.mediaOutbox.retry', 'Retry')} position="top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="conversation-scan-jobs-row-btn"
                        aria-label={t('conversations.mediaOutbox.retry', 'Retry')}
                        onClick={() => void retryJob(job.id)}
                      >
                        <Icon name="rotateRight" size="sm" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('conversations.mediaOutbox.dismiss', 'Dismiss')} position="top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="conversation-scan-jobs-row-btn"
                        aria-label={t('conversations.mediaOutbox.dismiss', 'Dismiss')}
                        onClick={() => void dismissFailedJob(job.id)}
                      >
                        <Icon name="x" size="sm" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={anchorRef} className="conversation-scan-jobs-anchor">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'conversation-media-outbox-panel' : undefined}
        aria-label={t('conversations.mediaOutbox.toolbarAria', 'Pending media uploads')}
        title={t('conversations.mediaOutbox.toolbarTitle', 'Pending uploads')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="conversation-toolbar-pins-icon-wrap">
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="fileArrowUp" size="sm" />
          </span>
          {panelBadge > 0 && (
            <span className="conversation-toolbar-pins-badge" aria-hidden>
              {panelBadge > 99 ? '99+' : panelBadge}
            </span>
          )}
        </span>
      </Button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
