/**
 * Custom emoji management page.
 *
 * Lists the user's custom emojis, displays tier usage, and provides
 * upload / edit / delete flows with a two-phase upload model:
 *   Phase 1: file upload + content moderation (via useMediaUpload)
 *   Phase 2: metadata submission (shortcode, name) which consumes a tier slot
 */

import { useState, useCallback, useRef, useMemo, type ChangeEvent, type FormEvent } from 'react';
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
import type { PublicCustomEmoji } from '@adieuu/shared';

const EMOJI_ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/gif'];
const EMOJI_MAX_BYTES = 256 * 1024; // 256 KB
const SHORTCODE_PATTERN = /^[a-z0-9_]{2,32}$/;

function shortcodeError(value: string): string | null {
  if (value.length < 2) return 'Must be at least 2 characters';
  if (value.length > 32) return 'Must be 32 characters or fewer';
  if (!SHORTCODE_PATTERN.test(value)) return 'Only lowercase letters, numbers, and underscores';
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

/** The create-emoji dialog with two-phase upload. */
function CreateEmojiDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shortcode, setShortcode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { identity } = useIdentity();
  const { createEmoji } = useCustomEmojis(identity?.id);

  const {
    upload, reset: resetUpload, state: uploadState,
    progress, error: uploadError, mediaId, cdnUrl,
  } = useMediaUpload({
    purpose: 'custom_emoji',
    maxSizeBytes: EMOJI_MAX_BYTES,
    acceptedTypes: EMOJI_ACCEPTED_TYPES,
  });

  const resetAll = useCallback(() => {
    resetUpload();
    setPreviewUrl(null);
    setShortcode('');
    setName('');
    setSaving(false);
    setSaveError(null);
  }, [resetUpload]);

  const handleClose = useCallback(() => {
    resetAll();
    onOpenChange(false);
  }, [resetAll, onOpenChange]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSaveError(null);
    upload(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [upload]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!mediaId || uploadState !== 'complete') return;

    const scErr = shortcodeError(shortcode);
    if (scErr) {
      setSaveError(scErr);
      return;
    }
    if (!name.trim()) {
      setSaveError('Name is required');
      return;
    }

    setSaving(true);
    setSaveError(null);
    const result = await createEmoji(shortcode.toLowerCase(), name.trim(), mediaId);
    setSaving(false);

    if (result) {
      resetAll();
      onOpenChange(false);
      onCreated();
    } else {
      setSaveError('Failed to save emoji. The shortcode may already be in use.');
    }
  }, [mediaId, uploadState, shortcode, name, createEmoji, resetAll, onOpenChange, onCreated]);

  const isUploading = uploadState === 'requesting' || uploadState === 'uploading' || uploadState === 'processing';
  const canSubmit = uploadState === 'complete' && !!mediaId && !saving && shortcode.length >= 2 && name.trim().length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) handleClose(); }}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content custom-emoji-dialog">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.customEmojis.createTitle', 'Add Custom Emoji')}
              </Dialog.Title>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="confirm-dialog-body">
                {/* File upload area */}
                <div className="custom-emoji-upload-area">
                  {previewUrl ? (
                    <div className="custom-emoji-preview-wrapper">
                      <img src={previewUrl} alt="" className="custom-emoji-preview-img" />
                      {uploadState === 'complete' && (
                        <button
                          type="button"
                          className="custom-emoji-preview-change"
                          onClick={() => fileInputRef.current?.click()}
                          aria-label={t('identity.customEmojis.changeFile', 'Change file')}
                        >
                          <Icon name="camera" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="custom-emoji-upload-trigger"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <Icon name="camera" />
                      <span>{t('identity.customEmojis.selectFile', 'Select image')}</span>
                      <span className="custom-emoji-upload-hint">PNG, WebP, or GIF. Max 256 KB.</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={EMOJI_ACCEPTED_TYPES.join(',')}
                    onChange={handleFileSelect}
                    hidden
                  />
                  <UploadStateIndicator state={uploadState} progress={progress} error={uploadError} />
                </div>

                {/* Metadata fields, visible once upload completes */}
                {uploadState === 'complete' && (
                  <div className="custom-emoji-metadata-fields">
                    <div className="custom-emoji-field">
                      <label htmlFor="ce-shortcode" className="custom-emoji-field-label">
                        {t('identity.customEmojis.shortcodeLabel', 'Shortcode')}
                      </label>
                      <div className="custom-emoji-shortcode-wrapper">
                        <span className="custom-emoji-shortcode-colon">:</span>
                        <input
                          id="ce-shortcode"
                          type="text"
                          className="input custom-emoji-shortcode-input"
                          value={shortcode}
                          onChange={(e) => setShortcode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                          maxLength={32}
                          placeholder="my_emoji"
                          autoComplete="off"
                        />
                        <span className="custom-emoji-shortcode-colon">:</span>
                      </div>
                      {shortcode && shortcodeError(shortcode) && (
                        <p className="custom-emoji-field-error">{shortcodeError(shortcode)}</p>
                      )}
                    </div>

                    <div className="custom-emoji-field">
                      <label htmlFor="ce-name" className="custom-emoji-field-label">
                        {t('identity.customEmojis.nameLabel', 'Display name')}
                      </label>
                      <input
                        id="ce-name"
                        type="text"
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={64}
                        placeholder="My Emoji"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}

                {saveError && <Alert variant="error" className="custom-emoji-save-error">{saveError}</Alert>}
              </div>

              <div className="confirm-dialog-footer">
                <Button variant="secondary" type="button" onClick={handleClose} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button variant="primary" type="submit" disabled={!canSubmit}>
                  {saving ? t('identity.customEmojis.saving', 'Saving...') : t('identity.customEmojis.save', 'Save Emoji')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
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
            onChange={(e) => setShortcode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
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

export function IdentityCustomEmojis() {
  const { t } = useTranslation();
  const { status: identityStatus, identity } = useIdentity();
  const { emojis, limit, used, loading, error, refresh, updateEmoji, deleteEmoji } = useCustomEmojis(identity?.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicCustomEmoji | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteEmoji(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteEmoji]);

  const sortedEmojis = useMemo(
    () => [...emojis].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [emojis],
  );

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

          {/* Add button */}
          <div className="custom-emoji-header-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={used >= limit}
            >
              {t('identity.customEmojis.add', 'Add Emoji')}
            </Button>
            {used >= limit && (
              <span className="custom-emoji-limit-note">
                {t('identity.customEmojis.limitReached', 'You have reached your custom emoji limit. Upgrade your subscription for more.')}
              </span>
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
                      <div className="custom-emoji-card-preview">
                        <img src={emoji.cdnUrl} alt={emoji.name} className="custom-emoji-card-img" />
                      </div>
                      <div className="custom-emoji-card-info">
                        <span className="custom-emoji-card-name" title={emoji.name}>{emoji.name}</span>
                        <span className="custom-emoji-card-shortcode" title={`:${emoji.shortcode}:`}>:{emoji.shortcode}:</span>
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
        onCreated={refresh}
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
