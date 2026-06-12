/**
 * Custom emoji management page.
 *
 * Lists the user's custom emojis, displays tier usage, and provides
 * upload / edit / delete flows with a two-phase upload model:
 *   Phase 1: file upload + content moderation (via useMediaUpload)
 *   Phase 2: metadata submission (shortcode, name) which consumes a tier slot
 *
 * The "Add Emojis" dialog supports bulk upload: users can select multiple
 * files at once or drag-and-drop a batch. Each file's shortcode and display
 * name default to the filename (sanitised).
 */

import { useState, useCallback, useRef, useMemo, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../icons/Icon';
import { useIdentity } from '../../hooks/useIdentity';
import { useCustomEmojis } from '../../hooks/useCustomEmojis';
import { useMediaUpload, type MediaUploadState } from '../../hooks/useMediaUpload';
import {
  CUSTOM_EMOJI_SHORTCODE_BODY_RE,
  filenameToShortcode,
  filenameToDisplayName,
  type PublicCustomEmoji,
} from '@adieuu/shared';
import { scheduleUploads, retryItem } from './emojiUploadQueue';

const EMOJI_ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/gif'];
const EMOJI_MAX_BYTES = 256 * 1024; // 256 KB

function shortcodeError(value: string): string | null {
  if (value.length < 2) return 'Must be at least 2 characters';
  if (value.length > 32) return 'Must be 32 characters or fewer';
  if (!CUSTOM_EMOJI_SHORTCODE_BODY_RE.test(value)) {
    return 'Only lowercase letters, numbers, underscores, and hyphens';
  }
  return null;
}

/** Upload status indicator shared between create and inline feedback. */
function UploadStateIndicator({ state, progress, error }: {
  state: MediaUploadState;
  progress: number;
  error: string | null;
}) {
  if (state === 'idle' || state === 'complete') return null;

  if (state === 'error') {
    return <p className="custom-emoji-upload-error">{error}</p>;
  }

  const label =
    state === 'requesting' ? 'Preparing upload...' :
    state === 'uploading' ? 'Uploading...' :
    state === 'processing' ? 'Scanning content...' : '';

  return (
    <div className="custom-emoji-upload-status">
      <div className="custom-emoji-upload-progress-bar">
        <div
          className="custom-emoji-upload-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="custom-emoji-upload-status-label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bulk-upload dialog                                                 */
/* ------------------------------------------------------------------ */

interface PendingEmojiItem {
  id: string;
  file: File;
  previewUrl: string;
  shortcode: string;
  name: string;
  mediaId: string | null;
  uploadDone: boolean;
  uploadFailed: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  retryCount: number;
  uploadStarted: boolean;
}

const MAX_CONCURRENT_UPLOADS = 20;
const MAX_RETRIES = 2;

let _bulkSeq = 0;

/**
 * Renders a single pending emoji and drives its upload via useMediaUpload.
 * Reports completion/failure back to the parent via callbacks.
 * Upload only starts when `startUpload` is true (concurrency gated by parent).
 */
function BulkEmojiUploadItem({
  item,
  onMetadataChange,
  onUploadDone,
  onRemove,
  onRetry,
  startUpload,
}: {
  item: PendingEmojiItem;
  onMetadataChange: (id: string, field: 'shortcode' | 'name', value: string) => void;
  onUploadDone: (id: string, mediaId: string | null, failed: boolean) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  startUpload: boolean;
}) {
  const {
    upload, reset: resetUpload, state: uploadState, progress, error: uploadError, mediaId,
  } = useMediaUpload({
    purpose: 'custom_emoji',
    maxSizeBytes: EMOJI_MAX_BYTES,
    acceptedTypes: EMOJI_ACCEPTED_TYPES,
  });

  useEffect(() => {
    return () => { resetUpload(); };
  }, [resetUpload]);

  const startedRef = useRef(false);
  const retrySeqRef = useRef(item.retryCount);

  useEffect(() => {
    if (!startUpload) return;

    if (item.retryCount > retrySeqRef.current) {
      retrySeqRef.current = item.retryCount;
      startedRef.current = false;
      resetUpload();
    }

    if (!startedRef.current) {
      startedRef.current = true;
      upload(item.file);
    }
  }, [startUpload, upload, resetUpload, item.file, item.retryCount]);

  const reportedRef = useRef(false);
  const reportedRetryRef = useRef(item.retryCount);

  useEffect(() => {
    if (item.retryCount > reportedRetryRef.current) {
      reportedRetryRef.current = item.retryCount;
      reportedRef.current = false;
    }
  }, [item.retryCount]);

  useEffect(() => {
    if (reportedRef.current) return;
    if (uploadState === 'complete' && mediaId) {
      reportedRef.current = true;
      onUploadDone(item.id, mediaId, false);
    } else if (uploadState === 'error') {
      reportedRef.current = true;
      onUploadDone(item.id, null, true);
    }
  }, [uploadState, mediaId, item.id, onUploadDone]);

  const isUploading = uploadState === 'requesting' || uploadState === 'uploading' || uploadState === 'processing';
  const isWaiting = startUpload === false && !item.uploadDone && !item.uploadFailed;
  const showFields = item.uploadDone && item.saveState !== 'saved';
  const scErr = item.shortcode ? shortcodeError(item.shortcode) : null;
  const canRetry = item.uploadFailed && item.retryCount < MAX_RETRIES;

  return (
    <div
      className={
        'bulk-emoji-item' +
        (item.saveState === 'saved' ? ' bulk-emoji-item--saved' : '') +
        (item.uploadFailed ? ' bulk-emoji-item--failed' : '')
      }
    >
      <div className="bulk-emoji-item-preview">
        <img src={item.previewUrl} alt="" />
        {item.saveState === 'saved' && (
          <span className="bulk-emoji-item-check"><Icon name="check" size="xs" /></span>
        )}
      </div>

      <div className="bulk-emoji-item-body">
        {isWaiting && (
          <span className="bulk-emoji-item-status">Queued...</span>
        )}

        {isUploading && (
          <UploadStateIndicator state={uploadState} progress={progress} error={null} />
        )}

        {uploadState === 'error' && (
          <div className="bulk-emoji-item-error-row">
            <p className="custom-emoji-upload-error">{uploadError ?? 'Upload failed'}</p>
            {canRetry && (
              <button
                type="button"
                className="btn btn-ghost btn-sm bulk-emoji-item-retry"
                onClick={() => onRetry(item.id)}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {showFields && (
          <>
            <div className="custom-emoji-shortcode-wrapper">
              <span className="custom-emoji-shortcode-colon">:</span>
              <input
                type="text"
                className="input custom-emoji-shortcode-input"
                value={item.shortcode}
                onChange={(e) =>
                  onMetadataChange(item.id, 'shortcode', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                }
                maxLength={32}
                placeholder="shortcode"
                autoComplete="off"
                disabled={item.saveState === 'saving'}
              />
              <span className="custom-emoji-shortcode-colon">:</span>
            </div>
            {scErr && <p className="custom-emoji-field-error">{scErr}</p>}
            <input
              type="text"
              className="input bulk-emoji-item-name-input"
              value={item.name}
              onChange={(e) => onMetadataChange(item.id, 'name', e.target.value)}
              maxLength={64}
              placeholder="Display name"
              autoComplete="off"
              disabled={item.saveState === 'saving'}
            />
          </>
        )}

        {item.saveState === 'saving' && (
          <span className="bulk-emoji-item-status">Saving...</span>
        )}
        {item.saveState === 'saved' && (
          <span className="bulk-emoji-item-status bulk-emoji-item-status--done">
            :{item.shortcode}: saved
          </span>
        )}
        {item.saveState === 'error' && item.saveError && (
          <p className="custom-emoji-field-error">{item.saveError}</p>
        )}
      </div>

      {item.saveState !== 'saved' && item.saveState !== 'saving' && (
        <button
          type="button"
          className="btn btn-ghost btn-sm bulk-emoji-item-remove"
          onClick={() => onRemove(item.id)}
          aria-label="Remove"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

/** Bulk-upload dialog: multi-file selection, drag-and-drop, filename-derived defaults. */
function CreateEmojiDialog({
  open,
  onOpenChange,
  onCreated,
  remainingSlots,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  remainingSlots: number;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingEmojiItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);
  const [allSavedSuccessfully, setAllSavedSuccessfully] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const dragCounterRef = useRef(0);

  const { identity } = useIdentity();
  const { createEmoji } = useCustomEmojis(identity?.id);

  /* ---- file handling ---- */

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      (f) => EMOJI_ACCEPTED_TYPES.includes(f.type) && f.size <= EMOJI_MAX_BYTES,
    );
    if (valid.length === 0) return;

    setItems((prev) => {
      const currentCount = prev.length;
      const available = remainingSlots - currentCount;
      if (available <= 0) return prev;

      const batch = valid.slice(0, available);
      const next: PendingEmojiItem[] = batch.map((file) => ({
        id: `be-${++_bulkSeq}`,
        file,
        previewUrl: URL.createObjectURL(file),
        shortcode: filenameToShortcode(file.name),
        name: filenameToDisplayName(file.name),
        mediaId: null,
        uploadDone: false,
        uploadFailed: false,
        saveState: 'idle',
        saveError: null,
        retryCount: 0,
        uploadStarted: false,
      }));
      return [...prev, ...next];
    });
    setAllSavedSuccessfully(false);
  }, [remainingSlots]);

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [addFiles],
  );

  /* ---- drag & drop ---- */

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  /* ---- concurrency control ---- */

  const activeUploadCount = useMemo(
    () => items.filter((i) => i.uploadStarted && !i.uploadDone && !i.uploadFailed).length,
    [items],
  );

  useEffect(() => {
    setItems((prev) => scheduleUploads(prev, MAX_CONCURRENT_UPLOADS));
  }, [items.length, activeUploadCount]);

  /* ---- child callbacks ---- */

  const handleUploadDone = useCallback(
    (id: string, mediaId: string | null, failed: boolean) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, mediaId, uploadDone: !failed, uploadFailed: failed } : i,
        ),
      );
    },
    [],
  );

  const handleRetry = useCallback((id: string) => {
    setItems((prev) => {
      const updated = retryItem(prev, id, MAX_RETRIES);
      const withMediaReset = updated.map((i) => (i.id === id ? { ...i, mediaId: null } : i));
      return scheduleUploads(withMediaReset, MAX_CONCURRENT_UPLOADS);
    });
  }, []);

  const handleMetadataChange = useCallback(
    (id: string, field: 'shortcode' | 'name', value: string) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    },
    [],
  );

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  /* ---- close / cleanup ---- */

  const hasActiveUploads = useMemo(
    () => items.some((i) => i.uploadStarted && !i.uploadDone && !i.uploadFailed),
    [items],
  );

  const handleClose = useCallback(() => {
    const hadSaved = items.some((i) => i.saveState === 'saved');
    for (const item of items) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setSaving(false);
    setOverallError(null);
    setAllSavedSuccessfully(false);
    setConfirmCloseOpen(false);
    dragCounterRef.current = 0;
    setDragging(false);
    onOpenChange(false);
    if (hadSaved) onCreated();
  }, [items, onOpenChange, onCreated]);

  const handleRequestClose = useCallback(() => {
    if (hasActiveUploads) {
      setConfirmCloseOpen(true);
    } else {
      handleClose();
    }
  }, [hasActiveUploads, handleClose]);

  const handleUploadMore = useCallback(() => {
    for (const item of items) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setAllSavedSuccessfully(false);
    setOverallError(null);
  }, [items]);

  /* ---- save all ---- */

  const handleSaveAll = useCallback(async () => {
    const toSave = items.filter((i) => i.uploadDone && i.mediaId && i.saveState !== 'saved');
    if (toSave.length === 0) return;

    for (const item of toSave) {
      const scErr = shortcodeError(item.shortcode);
      if (scErr) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, saveState: 'error' as const, saveError: scErr } : i)),
        );
        return;
      }
      if (!item.name.trim()) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, saveState: 'error' as const, saveError: 'Name is required' } : i,
          ),
        );
        return;
      }
    }

    setSaving(true);
    setOverallError(null);
    let allOk = true;

    for (const item of toSave) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, saveState: 'saving' as const, saveError: null } : i)),
      );

      const result = await createEmoji(item.shortcode.toLowerCase(), item.name.trim(), item.mediaId!);
      if (result) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, saveState: 'saved' as const } : i)));
      } else {
        allOk = false;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, saveState: 'error' as const, saveError: 'Failed to save. The shortcode may already be in use.' }
              : i,
          ),
        );
      }
    }

    setSaving(false);

    if (allOk) {
      setAllSavedSuccessfully(true);
    }
  }, [items, createEmoji]);

  /* ---- derived state ---- */

  const activeItems = useMemo(() => items.filter((i) => i.saveState !== 'saved'), [items]);
  const allUploaded = activeItems.length > 0 && activeItems.every((i) => i.uploadDone);
  const canSave =
    allUploaded &&
    !saving &&
    activeItems.every((i) => i.shortcode.length >= 2 && i.name.trim().length > 0);
  const hasItems = items.length > 0;
  const canAddMore = items.length < remainingSlots && !saving && !allSavedSuccessfully;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) handleRequestClose(); }}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content
            className={
              'confirm-dialog-content custom-emoji-dialog custom-emoji-dialog--bulk' +
              (dragging ? ' custom-emoji-dialog--drag-active' : '')
            }
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.customEmojis.createTitle', 'Add Custom Emojis')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              {!hasItems ? (
                <div
                  className={
                    'bulk-emoji-dropzone' + (dragging ? ' bulk-emoji-dropzone--active' : '')
                  }
                >
                  <button
                    type="button"
                    className="custom-emoji-upload-trigger"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="upload" />
                    <span>{t('identity.customEmojis.selectFiles', 'Select images')}</span>
                    <span className="custom-emoji-upload-hint">
                      {t('identity.customEmojis.fileHint', 'PNG, WebP, or GIF. Max 256 KB each.')}
                    </span>
                    <span className="custom-emoji-upload-hint">
                      {t('identity.customEmojis.dropHint', 'Drag and drop or click to browse')}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="bulk-emoji-list">
                  {items.map((item) => (
                    <BulkEmojiUploadItem
                      key={item.id}
                      item={item}
                      onMetadataChange={handleMetadataChange}
                      onUploadDone={handleUploadDone}
                      onRemove={handleRemove}
                      onRetry={handleRetry}
                      startUpload={item.uploadStarted}
                    />
                  ))}

                  {canAddMore && (
                    <button
                      type="button"
                      className="bulk-emoji-add-more"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="plus" />
                      <span>{t('identity.customEmojis.addMore', 'Add more')}</span>
                    </button>
                  )}
                </div>
              )}

              {overallError && <Alert variant="error">{overallError}</Alert>}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={EMOJI_ACCEPTED_TYPES.join(',')}
              multiple
              onChange={handleFileInput}
              hidden
            />

            <div className="confirm-dialog-footer">
              {allSavedSuccessfully ? (
                <>
                  <Button variant="secondary" type="button" onClick={handleUploadMore}>
                    {t('identity.customEmojis.uploadMore', 'Upload More')}
                  </Button>
                  <Button variant="primary" type="button" onClick={handleClose}>
                    {t('identity.customEmojis.done', 'Done')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" type="button" onClick={handleRequestClose} disabled={saving}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  {activeItems.length > 0 && (
                    <Button variant="primary" type="button" onClick={handleSaveAll} disabled={!canSave}>
                      {saving
                        ? t('identity.customEmojis.saving', 'Saving...')
                        : t('identity.customEmojis.save', { count: activeItems.length })}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>

      <ConfirmDialog
        open={confirmCloseOpen}
        onOpenChange={(open) => { if (!open) setConfirmCloseOpen(false); }}
        title={t('identity.customEmojis.cancelUploadsTitle', 'Cancel uploads?')}
        description={t(
          'identity.customEmojis.cancelUploadsDescription',
          'Some uploads are still in progress. Closing now will cancel them.',
        )}
        confirmLabel={t('identity.customEmojis.cancelUploadsConfirm', 'Discard uploads')}
        variant="danger"
        onConfirm={handleClose}
      />
    </Dialog.Root>
  );
}

/** Inline edit row for an existing emoji's shortcode or name. */
function EmojiEditRow({
  emoji,
  onUpdate,
  onClose,
}: {
  emoji: PublicCustomEmoji;
  onUpdate: (id: string, params: { shortcode?: string; name?: string }) => Promise<PublicCustomEmoji | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [shortcode, setShortcode] = useState(emoji.shortcode);
  const [name, setName] = useState(emoji.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const scErr = shortcodeError(shortcode);
    if (scErr) { setError(scErr); return; }
    if (!name.trim()) { setError('Name is required'); return; }

    const changes: { shortcode?: string; name?: string } = {};
    if (shortcode !== emoji.shortcode) changes.shortcode = shortcode;
    if (name.trim() !== emoji.name) changes.name = name.trim();

    if (Object.keys(changes).length === 0) { onClose(); return; }

    setSaving(true);
    setError(null);
    const result = await onUpdate(emoji.id, changes);
    setSaving(false);

    if (result) {
      onClose();
    } else {
      setError('Failed to update. The shortcode may already be in use.');
    }
  }, [shortcode, name, emoji, onUpdate, onClose]);

  return (
    <div className="custom-emoji-edit-row">
      <div className="custom-emoji-edit-fields">
        <div className="custom-emoji-shortcode-wrapper">
          <span className="custom-emoji-shortcode-colon">:</span>
          <input
            type="text"
            className="input custom-emoji-shortcode-input"
            value={shortcode}
            onChange={(e) => setShortcode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            maxLength={32}
            autoComplete="off"
          />
          <span className="custom-emoji-shortcode-colon">:</span>
        </div>
        <input
          type="text"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          autoComplete="off"
        />
      </div>
      {error && <p className="custom-emoji-field-error">{error}</p>}
      <div className="custom-emoji-edit-actions">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
        </Button>
      </div>
    </div>
  );
}

type EmojiSortMode = 'name' | 'shortcode' | 'recent';

export function IdentityCustomEmojis() {
  const { t } = useTranslation();
  const { status: identityStatus, identity } = useIdentity();
  const { emojis, limit, used, loading, error, refresh, updateEmoji, deleteEmoji } = useCustomEmojis(identity?.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicCustomEmoji | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortMode, setSortMode] = useState<EmojiSortMode>('name');

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteEmoji(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteEmoji]);

  const handleDialogCreated = useCallback(() => {
    refresh();
  }, [refresh]);

  const sortedEmojis = useMemo(() => {
    const copy = [...emojis];
    switch (sortMode) {
      case 'name':
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'shortcode':
        return copy.sort((a, b) => a.shortcode.localeCompare(b.shortcode));
      case 'recent':
        return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [emojis, sortMode]);

  if (identityStatus === 'locked') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('identity.customEmojis.title', 'Custom Emojis')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.sessionLocked')}</Alert>
        </div>
      </div>
    );
  }

  if (identityStatus !== 'logged_in') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('identity.customEmojis.title', 'Custom Emojis')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.notLoggedIn')}</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.customEmojis.title', 'Custom Emojis')}</h1>
          <p className="page-subtitle">
            {t('identity.customEmojis.subtitle', 'Upload and manage custom emojis you can use in conversations.')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up app-settings-card">
          {/* Tier usage summary */}
          <div className="custom-emoji-tier-summary">
            <span className="custom-emoji-tier-label">
              {t('identity.customEmojis.usage', '{{used}} of {{limit}} slots used', { used, limit })}
            </span>
            <div className="custom-emoji-tier-bar">
              <div
                className="custom-emoji-tier-bar-fill"
                style={{ width: limit > 0 ? `${Math.min((used / limit) * 100, 100)}%` : '0%' }}
              />
            </div>
          </div>

          {/* Add button and sort controls */}
          <div className="custom-emoji-header-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={used >= limit}
            >
              {t('identity.customEmojis.add', 'Add Emojis')}
            </Button>
            {used >= limit && (
              <span className="custom-emoji-limit-note">
                {t('identity.customEmojis.limitReached', 'You have reached your custom emoji limit. Upgrade your subscription for more.')}
              </span>
            )}
            {emojis.length > 1 && (
              <div className="custom-emoji-sort-controls">
                <label className="custom-emoji-sort-label" htmlFor="emoji-sort">
                  {t('identity.customEmojis.sortLabel', 'Sort by')}
                </label>
                <select
                  id="emoji-sort"
                  className="input custom-emoji-sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as EmojiSortMode)}
                >
                  <option value="name">{t('identity.customEmojis.sortName', 'Name')}</option>
                  <option value="shortcode">{t('identity.customEmojis.sortShortcode', 'Shortcode')}</option>
                  <option value="recent">{t('identity.customEmojis.sortRecent', 'Recently uploaded')}</option>
                </select>
              </div>
            )}
          </div>

          {/* Loading / error states */}
          {loading && (
            <div className="custom-emoji-loading">
              <div className="spinner spinner-sm" />
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}

          {/* Emoji grid */}
          {!loading && emojis.length === 0 && (
            <p className="custom-emoji-empty">
              {t('identity.customEmojis.empty', 'You haven\'t added any custom emojis yet.')}
            </p>
          )}

          {!loading && sortedEmojis.length > 0 && (
            <div className="custom-emoji-grid">
              {sortedEmojis.map((emoji) => (
                <div key={emoji.id} className="custom-emoji-card">
                  {editingId === emoji.id ? (
                    <EmojiEditRow
                      emoji={emoji}
                      onUpdate={updateEmoji}
                      onClose={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="custom-emoji-card-main">
                        <div className="custom-emoji-card-preview">
                          <img src={emoji.cdnUrl} alt={emoji.name} className="custom-emoji-card-img" />
                        </div>
                        <div className="custom-emoji-card-info">
                          <span className="custom-emoji-card-name">{emoji.name}</span>
                          <span className="custom-emoji-card-shortcode">:{emoji.shortcode}:</span>
                        </div>
                      </div>
                      <div className="custom-emoji-card-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(emoji.id)}
                          aria-label={t('common.edit', 'Edit')}
                        >
                          <Icon name="pen" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger-ghost"
                          onClick={() => setDeleteTarget(emoji)}
                          aria-label={t('common.delete', 'Delete')}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <CreateEmojiDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleDialogCreated}
        remainingSlots={Math.max(0, limit - used)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('identity.customEmojis.deleteTitle', 'Delete custom emoji?')}
        description={t(
          'identity.customEmojis.deleteDescription',
          'This emoji will be permanently deleted. Messages that already contain it will show the shortcode text instead.',
        )}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
