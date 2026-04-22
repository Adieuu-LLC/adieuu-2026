import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { useConversationScanJobs } from '../../context/ConversationScanJobsContext';
import type { ConversationScanJob } from '../../context/ConversationScanJobsContext';

function jobStatusLabel(
  job: ConversationScanJob,
  t: (key: string, fallback: string) => string
): string {
  switch (job.status) {
    case 'running':
      return t('conversations.scanJob.statusRunning', 'Safety scan uploading…');
    case 'completed':
      return t('conversations.scanJob.statusDone', 'Safety scan complete');
    case 'failed':
      return t('conversations.scanJob.statusFailed', 'Safety scan failed');
    case 'cancelled':
      return t('conversations.scanJob.statusCancelled', 'Cancelled');
    default:
      return '';
  }
}

export function ConversationScanJobsMenu({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const ctx = useConversationScanJobs();
  const jobs = ctx?.jobs.filter((j) => j.conversationId === conversationId) ?? [];
  const sorted = [...jobs].sort((a, b) => b.startedAt - a.startedAt);

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
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  if (!ctx) return null;

  const badgeCount = jobs.filter((j) => j.status === 'running' || j.status === 'failed').length;

  const panel = open ? (
    <div
      ref={panelRef}
      id="conversation-scan-jobs-panel"
      className="conversation-scan-jobs-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversation-scan-jobs-panel-title"
    >
      <div className="conversation-scan-jobs-panel-header">
        <div id="conversation-scan-jobs-panel-title" className="conversation-scan-jobs-panel-title">
          {t('conversations.scanJob.panelTitle', 'Media safety uploads')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="conversation-scan-jobs-panel-close"
          aria-label={t('conversations.scanJob.closePanel', 'Close')}
          onClick={() => setOpen(false)}
        >
          <Icon name="x" size="sm" />
        </Button>
      </div>
      <div className="conversation-scan-jobs-panel-scroll">
        {sorted.length === 0 ? (
          <p className="conversation-scan-jobs-empty">
            {t('conversations.scanJob.empty', 'No background safety uploads for this chat.')}
          </p>
        ) : (
          sorted.map((job) => (
            <div key={job.id} className="conversation-scan-jobs-row">
              <span className="conversation-scan-jobs-row-icon" aria-hidden>
                {job.status === 'running' ? (
                  <span className="spinner spinner-sm" />
                ) : job.status === 'completed' ? (
                  <Icon name="check" size="sm" />
                ) : job.status === 'failed' ? (
                  <Icon name="error" size="sm" />
                ) : (
                  <Icon name="x" size="sm" />
                )}
              </span>
              <div className="conversation-scan-jobs-row-body">
                <div className="conversation-scan-jobs-row-name" title={job.fileName}>
                  {job.fileName}
                </div>
                <div className="conversation-scan-jobs-row-status">
                  {jobStatusLabel(job, t)}
                  {job.status === 'failed' && job.errorMessage ? ` — ${job.errorMessage}` : ''}
                </div>
              </div>
              <div className="conversation-scan-jobs-row-actions">
                {job.status === 'running' && (
                  <Tooltip
                    content={t('conversations.scanJob.cancel', 'Cancel upload')}
                    position="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="conversation-scan-jobs-row-btn"
                      aria-label={t('conversations.scanJob.cancel', 'Cancel upload')}
                      onClick={() => ctx.cancelJob(job.id)}
                    >
                      <Icon name="ban" size="sm" />
                    </Button>
                  </Tooltip>
                )}
                {(job.status === 'failed' ||
                  job.status === 'cancelled' ||
                  job.status === 'completed') && (
                  <Tooltip
                    content={t('conversations.scanJob.dismiss', 'Dismiss')}
                    position="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="conversation-scan-jobs-row-btn"
                      aria-label={t('conversations.scanJob.dismiss', 'Dismiss')}
                      onClick={() => ctx.dismissJob(job.id)}
                    >
                      <Icon name="x" size="sm" />
                    </Button>
                  </Tooltip>
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
        aria-controls={open ? 'conversation-scan-jobs-panel' : undefined}
        aria-label={t('conversations.scanJob.toolbarAria', 'Media safety upload status')}
        title={t('conversations.scanJob.toolbarTitle', 'Safety scan uploads')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="conversation-toolbar-pins-icon-wrap">
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="fileArrowUp" size="sm" />
          </span>
          {badgeCount > 0 && (
            <span className="conversation-toolbar-pins-badge" aria-hidden>
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </span>
      </Button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
