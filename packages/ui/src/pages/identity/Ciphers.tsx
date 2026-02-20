import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { Tooltip } from '../../components/Tooltip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useCipherStore, createTextEntropy, type StoredCipher } from '../../hooks/useCipherStore';
import { useIdentity } from '../../hooks/useIdentity';
import type { EntropyPiece } from '@adieuu/crypto';

// ============================================================================
// Add Cipher Modal Component
// ============================================================================

interface AddCipherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, entropyPieces: EntropyPiece[]) => Promise<void>;
}

function AddCipherModal({ isOpen, onClose, onAdd }: AddCipherModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [entropyText, setEntropyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !entropyText.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      // For now, we only support text entropy
      // Split by newlines to allow multiple phrases
      const pieces = entropyText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line, idx) => createTextEntropy(line, `Phrase ${idx + 1}`));

      if (pieces.length === 0) {
        setError(t('ciphers.errors.noEntropy'));
        setSubmitting(false);
        return;
      }

      await onAdd(name.trim(), pieces);
      // Reset form
      setName('');
      setEntropyText('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ciphers.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setEntropyText('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('ciphers.addModal.title')}</h2>
          <button type="button" className="modal-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="cipher-add-description">{t('ciphers.addModal.description')}</p>

            {error && <Alert variant="error" className="cipher-add-error">{error}</Alert>}

            <div className="form-group">
              <label className="form-label">{t('ciphers.addModal.nameLabel')}</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('ciphers.addModal.namePlaceholder')}
                disabled={submitting}
                autoFocus
              />
              <p className="form-hint">{t('ciphers.addModal.nameHint')}</p>
            </div>

            <div className="form-group">
              <label className="form-label">{t('ciphers.addModal.entropyLabel')}</label>
              <textarea
                className="input input-textarea"
                value={entropyText}
                onChange={(e) => setEntropyText(e.target.value)}
                placeholder={t('ciphers.addModal.entropyPlaceholder')}
                rows={4}
                disabled={submitting}
              />
              <p className="form-hint">{t('ciphers.addModal.entropyHint')}</p>
            </div>

            <Alert variant="warning" className="cipher-security-warning">
              <strong>{t('ciphers.addModal.securityTitle')}</strong>
              <p>{t('ciphers.addModal.securityWarning')}</p>
            </Alert>
          </div>

          <div className="modal-footer">
            <Button
              type="button"
              onClick={handleClose}
              className="btn btn-ghost btn-md"
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={submitting || !name.trim() || !entropyText.trim()}
            >
              {submitting ? <Spinner size="sm" /> : t('ciphers.addModal.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Cipher Card Component
// ============================================================================

interface CipherCardProps {
  cipher: StoredCipher;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => void;
}

function CipherCard({ cipher, onRename, onDelete }: CipherCardProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(cipher.name);
  const [saving, setSaving] = useState(false);

  const handleSaveRename = async () => {
    if (!editName.trim() || editName.trim() === cipher.name) {
      setIsEditing(false);
      setEditName(cipher.name);
      return;
    }

    setSaving(true);
    try {
      await onRename(cipher.id, editName.trim());
      setIsEditing(false);
    } catch {
      setEditName(cipher.name);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(cipher.name);
    }
  };

  const createdDate = new Date(cipher.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card variant="elevated" className="cipher-card">
      <div className="cipher-card-header">
        {isEditing ? (
          <div className="cipher-edit-name">
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveRename}
              disabled={saving}
              autoFocus
            />
          </div>
        ) : (
          <h3 className="cipher-name">{cipher.name}</h3>
        )}
        <div className="cipher-actions">
          {!isEditing && (
            <>
              <Tooltip content={t('common.edit')}>
                <button
                  type="button"
                  className="cipher-action-btn"
                  onClick={() => setIsEditing(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip content={t('common.delete')}>
                <button
                  type="button"
                  className="cipher-action-btn cipher-action-delete"
                  onClick={() => onDelete(cipher.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div className="cipher-card-details">
        <div className="cipher-detail">
          <span className="cipher-detail-label">{t('ciphers.card.cipherId')}</span>
          <Tooltip content={cipher.cipherId}>
            <code className="cipher-detail-value cipher-id">{cipher.shortId}...</code>
          </Tooltip>
        </div>
        <div className="cipher-detail">
          <span className="cipher-detail-label">{t('ciphers.card.created')}</span>
          <span className="cipher-detail-value">{createdDate}</span>
        </div>
        <div className="cipher-detail">
          <span className="cipher-detail-label">{t('ciphers.card.entropyPieces')}</span>
          <span className="cipher-detail-value">{cipher.entropyPieces.length}</span>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Main Ciphers Page Component
// ============================================================================

export function IdentityCiphers() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: identityStatus } = useIdentity();
  const { loading, ciphers, error, createCipher, deleteCipher, renameCipher, refresh } = useCipherStore();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StoredCipher | null>(null);

  const handleAddCipher = useCallback(
    async (name: string, entropyPieces: EntropyPiece[]) => {
      const result = await createCipher({ name, entropyPieces });
      if (result.success) {
        toast.success(t('ciphers.messages.created'));
      } else {
        throw new Error(result.error);
      }
    },
    [createCipher, toast, t]
  );

  const handleRenameCipher = useCallback(
    async (id: string, newName: string) => {
      const result = await renameCipher(id, newName);
      if (result.success) {
        toast.success(t('ciphers.messages.renamed'));
      } else {
        toast.error(result.error ?? t('ciphers.errors.renameFailed'));
        throw new Error(result.error);
      }
    },
    [renameCipher, toast, t]
  );

  const handleDeleteCipher = useCallback(async () => {
    if (!deleteConfirm) return;

    const result = await deleteCipher(deleteConfirm.id);
    if (result.success) {
      toast.success(t('ciphers.messages.deleted'));
    } else {
      toast.error(result.error ?? t('ciphers.errors.deleteFailed'));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteCipher, toast, t]);

  // Not logged into identity
  if (identityStatus !== 'logged_in') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('ciphers.title')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.notLoggedIn')}</Alert>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('ciphers.title')}</h1>
          </div>
          <div className="loading-container">
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('ciphers.title')}</h1>
          </div>
          <Alert variant="error">{error}</Alert>
          <Button onClick={refresh} className="btn btn-secondary btn-md" style={{ marginTop: '1rem' }}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('ciphers.title')}</h1>
              <p className="page-subtitle">{t('ciphers.subtitle')}</p>
            </div>
            <Button onClick={() => setAddModalOpen(true)} className="btn btn-primary btn-md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('ciphers.addButton')}
            </Button>
          </div>
        </div>

        {ciphers.length === 0 ? (
          <Card variant="elevated" className="cipher-empty-state">
            <div className="cipher-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="cipher-empty-title">{t('ciphers.empty.title')}</h3>
            <p className="cipher-empty-description">{t('ciphers.empty.description')}</p>
            <Button onClick={() => setAddModalOpen(true)} className="btn btn-primary btn-md">
              {t('ciphers.empty.addFirst')}
            </Button>
          </Card>
        ) : (
          <div className="cipher-grid">
            {ciphers.map((cipher) => (
              <CipherCard
                key={cipher.id}
                cipher={cipher}
                onRename={handleRenameCipher}
                onDelete={() => setDeleteConfirm(cipher)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Cipher Modal */}
      <AddCipherModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddCipher}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title={t('ciphers.deleteModal.title')}
        description={t('ciphers.deleteModal.message', { name: deleteConfirm?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={handleDeleteCipher}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
