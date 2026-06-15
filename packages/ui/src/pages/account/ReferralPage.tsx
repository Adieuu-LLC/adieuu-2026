import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type ReferralCodePayload,
  type ReferralStatsPayload,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';

function buildReferralLink(code: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/refer/${encodeURIComponent(code)}`;
}

type CodeEditorMode = 'create' | 'edit';

interface CodeEditorState {
  mode: CodeEditorMode;
  codeId?: string;
  code: string;
  customMessage: string;
}

export function ReferralPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl, externalLinkBase } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [stats, setStats] = useState<ReferralStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<CodeEditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const referralLinkBase =
    externalLinkBase || (typeof window !== 'undefined' ? window.location.origin : '');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.referral.getStats();
      if (!response.success || !response.data) {
        setError(t('account.referral.errors.loadFailed'));
        return;
      }
      setStats(response.data);
    } catch {
      setError(t('account.referral.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const openCreateModal = () => {
    setEditor({ mode: 'create', code: '', customMessage: '' });
    setEditorOpen(true);
  };

  const openEditModal = (code: ReferralCodePayload) => {
    setEditor({
      mode: 'edit',
      codeId: code.id,
      code: code.code,
      customMessage: code.customMessage ?? '',
    });
    setEditorOpen(true);
  };

  const closeEditorModal = () => {
    setEditorOpen(false);
    setEditor(null);
  };

  const handleSave = async () => {
    if (!editor) return;

    setSaving(true);
    const payload = {
      code: editor.code.trim() || undefined,
      customMessage: editor.customMessage.trim() || null,
    };

    const response =
      editor.mode === 'create'
        ? await api.referral.createCode(payload)
        : await api.referral.updateCode(editor.codeId!, payload);

    setSaving(false);

    if (!response.success) {
      toast.error(
        response.error?.message ??
          t(
            editor.mode === 'create'
              ? 'account.referral.errors.createFailed'
              : 'account.referral.errors.updateFailed',
          ),
      );
      return;
    }

    closeEditorModal();
    toast.success(
      t(editor.mode === 'create' ? 'account.referral.createSuccess' : 'account.referral.updateSuccess'),
    );
    await loadStats();
  };

  const handleDelete = async (code: ReferralCodePayload) => {
    const response = await api.referral.deleteCode(code.id);
    if (!response.success) {
      toast.error(response.error?.message ?? t('account.referral.errors.deleteFailed'));
      return;
    }
    toast.success(t('account.referral.deleteSuccess'));
    await loadStats();
  };

  const handleCopyLink = async (code: ReferralCodePayload) => {
    const link = buildReferralLink(code.code, referralLinkBase);
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('account.referral.linkCopied'));
    } catch {
      toast.error(t('account.referral.errors.copyFailed'));
    }
  };

  const handleRedeem = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = redeemCode.trim();
    if (!trimmed) return;

    setRedeeming(true);
    setRedeemFeedback(null);
    try {
      const response = await api.referral.redeem({ code: trimmed });

      if (response.success) {
        setRedeemCode('');
        setRedeemFeedback({ type: 'success', message: t('account.referral.redeem.success') });
        await loadStats();
        return;
      }

      setRedeemFeedback({
        type: 'error',
        message: response.error?.message ?? t('account.referral.redeem.errors.generic'),
      });
    } catch {
      setRedeemFeedback({
        type: 'error',
        message: t('account.referral.redeem.errors.generic'),
      });
    } finally {
      setRedeeming(false);
    }
  };

  const canCreateMore = (stats?.codes.length ?? 0) < 3;
  const isEditing = editor?.mode === 'edit';

  return (
    <div className="page-content">
      <div className="container">
        <header className="page-header">
          <h1>{t('account.referral.title')}</h1>
          <p>{t('account.referral.subtitle')}</p>
        </header>

        {loading && (
          <div className="page-loading">
            <Spinner />
          </div>
        )}

        {!loading && error && <Alert variant="error">{error}</Alert>}

        {!loading && stats && (
          <>
            <Card className="mb-lg">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                <div>
                  <h2 className="card-title">{t('account.referral.yourCodes.title')}</h2>
                  <p className="text-muted">{t('account.referral.yourCodes.description')}</p>
                </div>
                {canCreateMore && (
                  <Button type="button" onClick={openCreateModal}>
                    {t('account.referral.createButton')}
                  </Button>
                )}
              </div>

              {stats.codes.length === 0 && (
                <p className="text-muted">{t('account.referral.yourCodes.empty')}</p>
              )}

              {stats.codes.map((code) => (
                <div key={code.id} className="referral-code-row" style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                    <strong>{code.code}</strong>
                    <span className="text-muted">
                      {t('account.referral.stats.summary', {
                        visits: code.useCount,
                        signups: code.signupCount,
                        subscriptions: code.subscriptionCount,
                      })}
                    </span>
                  </div>
                  {code.customMessage && (
                    <p className="text-muted" style={{ marginTop: 'var(--spacing-xs)' }}>
                      {code.customMessage}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyLink(code)}>
                      {t('account.referral.copyLink')}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => openEditModal(code)}>
                      {t('account.referral.edit')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleDelete(code)}>
                      {t('account.referral.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </Card>

            <Card>
              <h2 className="card-title">{t('account.referral.redeem.title')}</h2>
              <p className="text-muted mb-md">{t('account.referral.redeem.description')}</p>

              {stats.hasBeenReferred ? (
                <Alert variant="info">
                  {stats.referredBy
                    ? t('account.referral.redeem.alreadyAppliedWithCode', { code: stats.referredBy.code })
                    : t('account.referral.redeem.alreadyApplied')}
                </Alert>
              ) : (
                <form onSubmit={(event) => void handleRedeem(event)} style={{ maxWidth: '24rem' }}>
                  {redeemFeedback && (
                    <Alert variant={redeemFeedback.type === 'success' ? 'success' : 'error'} className="mb-md">
                      {redeemFeedback.message}
                    </Alert>
                  )}
                  <Input
                    label={t('account.referral.redeem.codeLabel')}
                    value={redeemCode}
                    onChange={(event) => setRedeemCode(event.target.value)}
                    disabled={redeeming}
                  />
                  <Button type="submit" disabled={redeeming || !redeemCode.trim()}>
                    {redeeming ? t('account.referral.redeem.submitting') : t('account.referral.redeem.submit')}
                  </Button>
                </form>
              )}
            </Card>
          </>
        )}
      </div>

      <Dialog.Root
        open={editorOpen}
        onOpenChange={(details) => {
          if (!details.open) closeEditorModal();
        }}
      >
        <Portal>
          <Dialog.Backdrop className="confirm-dialog-backdrop" />
          <Dialog.Positioner className="confirm-dialog-positioner">
            <Dialog.Content className="confirm-dialog-content">
              <div className="confirm-dialog-header">
                <Dialog.Title className="confirm-dialog-title">
                  {t(isEditing ? 'account.referral.editTitle' : 'account.referral.create.title')}
                </Dialog.Title>
                <Dialog.Description className="confirm-dialog-description">
                  {t(isEditing ? 'account.referral.editDescription' : 'account.referral.create.description')}
                </Dialog.Description>
              </div>

              {editor && (
                <div className="confirm-dialog-body" style={{ display: 'grid', gap: 'var(--spacing-sm)' }}>
                  <Input
                    label={t('account.referral.create.codeLabel')}
                    placeholder={t('account.referral.create.codePlaceholder')}
                    value={editor.code}
                    onChange={(event) => setEditor({ ...editor, code: event.target.value })}
                    hint={t('account.referral.create.codeHint')}
                  />
                  <Input
                    label={t('account.referral.create.messageLabel')}
                    placeholder={t('account.referral.create.messagePlaceholder')}
                    value={editor.customMessage}
                    onChange={(event) => setEditor({ ...editor, customMessage: event.target.value })}
                    maxLength={300}
                  />
                </div>
              )}

              <div className="confirm-dialog-footer">
                <Button type="button" variant="ghost" onClick={closeEditorModal} disabled={saving}>
                  {t('account.referral.cancel')}
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving
                    ? t(isEditing ? 'account.referral.saving' : 'account.referral.create.submitting')
                    : t(isEditing ? 'account.referral.save' : 'account.referral.create.submit')}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  );
}
