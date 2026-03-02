import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { Tooltip } from '../../components/Tooltip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ExportKeyBackupModal } from '../../components/ExportKeyBackupModal';
import { ImportKeyBackupModal } from '../../components/ImportKeyBackupModal';
import { useToast } from '../../components/Toast';
import { useCipherStore, createTextEntropy, type DecryptedCipher } from '../../hooks/useCipherStore';
import { useIdentity } from '../../hooks/useIdentity';
import type { EntropyPiece } from '@adieuu/crypto';

// ============================================================================
// Add Cipher Modal Component
// ============================================================================

interface EntropyRow {
  id: string;
  value: string;
}

interface AddCipherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, entropyPieces: EntropyPiece[]) => Promise<void>;
}

function AddCipherModal({ isOpen, onClose, onAdd }: AddCipherModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEntropyRow = () => {
    setEntropyRows((prev) => [...prev, { id: Date.now().toString(), value: '' }]);
  };

  const removeEntropyRow = (id: string) => {
    setEntropyRows((prev) => {
      // Don't remove if it's the only row
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  const updateEntropyRow = (id: string, value: string) => {
    setEntropyRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };

  const hasValidEntropy = entropyRows.some((row) => row.value.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !hasValidEntropy) return;

    setSubmitting(true);
    setError(null);

    try {
      // Convert rows to entropy pieces (filter out empty ones)
      const pieces = entropyRows
        .filter((row) => row.value.trim().length > 0)
        .map((row, idx) => createTextEntropy(row.value.trim(), `Phrase ${idx + 1}`));

      if (pieces.length === 0) {
        setError(t('ciphers.errors.noEntropy'));
        setSubmitting(false);
        return;
      }

      await onAdd(name.trim(), pieces);
      // Reset form
      setName('');
      setEntropyRows([{ id: '1', value: '' }]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ciphers.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setEntropyRows([{ id: '1', value: '' }]);
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
              <div className="entropy-rows">
                {entropyRows.map((row, index) => (
                  <div key={row.id} className="entropy-row">
                    <span className="entropy-row-number">{index + 1}</span>
                    <Input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateEntropyRow(row.id, e.target.value)}
                      placeholder={t('ciphers.addModal.entropyRowPlaceholder')}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="entropy-row-remove"
                      onClick={() => removeEntropyRow(row.id)}
                      disabled={submitting || entropyRows.length <= 1}
                      title={t('common.remove')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="entropy-add-btn"
                onClick={addEntropyRow}
                disabled={submitting}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('ciphers.addModal.addEntropy')}
              </button>
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
              disabled={submitting || !name.trim() || !hasValidEntropy}
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
// Edit Cipher Modal Component
// ============================================================================

interface EditCipherModalProps {
  cipher: DecryptedCipher | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, entropyPieces: EntropyPiece[]) => Promise<void>;
}

interface EditEntropyRow {
  id: string;
  value: string;
  label: string;
  type: EntropyPiece['type'];
}

function EditCipherModal({ cipher, isOpen, onClose, onSave }: EditCipherModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'entropy'>('details');
  const [name, setName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EditEntropyRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entropyModified, setEntropyModified] = useState(false);

  // Initialize form when cipher changes
  useEffect(() => {
    if (cipher) {
      setName(cipher.name);
      setEntropyRows(
        cipher.entropyPieces.map((piece, idx) => ({
          id: `entropy-${idx}`,
          value: piece.value,
          label: piece.label ?? `Phrase ${idx + 1}`,
          type: piece.type,
        }))
      );
      setEntropyModified(false);
      setActiveTab('details');
      setError(null);
    }
  }, [cipher]);

  const addEntropyRow = () => {
    setEntropyRows((prev) => [
      ...prev,
      { id: `entropy-${Date.now()}`, value: '', label: `Phrase ${prev.length + 1}`, type: 'text' as const },
    ]);
    setEntropyModified(true);
  };

  const removeEntropyRow = (id: string) => {
    setEntropyRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
    setEntropyModified(true);
  };

  const updateEntropyRow = (id: string, value: string) => {
    setEntropyRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, value } : row))
    );
    setEntropyModified(true);
  };

  const hasValidEntropy = entropyRows.some((row) => row.value.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cipher || !name.trim() || !hasValidEntropy) return;

    setSubmitting(true);
    setError(null);

    try {
      // Convert rows to entropy pieces (filter out empty ones)
      const pieces: EntropyPiece[] = entropyRows
        .filter((row) => row.value.trim().length > 0)
        .map((row) => ({
          type: row.type,
          value: row.value.trim(),
          label: row.label || undefined,
        }));

      if (pieces.length === 0) {
        setError(t('ciphers.errors.noEntropy'));
        setSubmitting(false);
        return;
      }

      await onSave(cipher.id, name.trim(), pieces);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ciphers.errors.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  if (!isOpen || !cipher) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('ciphers.editModal.title')}</h2>
          <button type="button" className="modal-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="cipher-edit-tabs">
          <button
            type="button"
            className={`cipher-edit-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            {t('ciphers.editModal.tabs.details')}
          </button>
          <button
            type="button"
            className={`cipher-edit-tab ${activeTab === 'entropy' ? 'active' : ''}`}
            onClick={() => setActiveTab('entropy')}
          >
            {t('ciphers.editModal.tabs.entropy')}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <Alert variant="error" className="cipher-edit-error">{error}</Alert>}

            {activeTab === 'details' && (
              <div className="cipher-edit-details">
                <div className="form-group">
                  <label className="form-label">{t('ciphers.editModal.nameLabel')}</label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('ciphers.editModal.namePlaceholder')}
                    disabled={submitting}
                  />
                </div>

                <div className="cipher-edit-info">
                  <div className="cipher-edit-info-row">
                    <span className="cipher-edit-info-label">{t('ciphers.card.cipherId')}</span>
                    <Tooltip content={cipher.cipherId}>
                      <code className="cipher-edit-info-value">{cipher.shortId}...</code>
                    </Tooltip>
                  </div>
                  <div className="cipher-edit-info-row">
                    <span className="cipher-edit-info-label">{t('ciphers.card.entropyPieces')}</span>
                    <span className="cipher-edit-info-value">{cipher.entropyPieces.length}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'entropy' && (
              <div className="cipher-edit-entropy">
                {entropyModified && (
                  <Alert variant="warning" className="cipher-entropy-warning">
                    <strong>{t('ciphers.editModal.entropyWarningTitle')}</strong>
                    <p>{t('ciphers.editModal.entropyWarning')}</p>
                  </Alert>
                )}

                <div className="form-group">
                  <label className="form-label">{t('ciphers.editModal.entropyLabel')}</label>
                  <div className="entropy-rows">
                    {entropyRows.map((row, index) => (
                      <div key={row.id} className="entropy-row">
                        <span className="entropy-row-number">{index + 1}</span>
                        <Input
                          type="text"
                          value={row.value}
                          onChange={(e) => updateEntropyRow(row.id, e.target.value)}
                          placeholder={t('ciphers.editModal.entropyRowPlaceholder')}
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          className="entropy-row-remove"
                          onClick={() => removeEntropyRow(row.id)}
                          disabled={submitting || entropyRows.length <= 1}
                          title={t('common.remove')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="entropy-add-btn"
                    onClick={addEntropyRow}
                    disabled={submitting}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('ciphers.editModal.addEntropy')}
                  </button>
                  <p className="form-hint">{t('ciphers.editModal.entropyHint')}</p>
                </div>
              </div>
            )}
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
              disabled={submitting || !name.trim() || !hasValidEntropy}
            >
              {submitting ? <Spinner size="sm" /> : t('ciphers.editModal.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Share Cipher Modal Component
// ============================================================================

interface ShareCipherModalProps {
  cipher: DecryptedCipher | null;
  isOpen: boolean;
  onClose: () => void;
}

function ShareCipherModal({ cipher, isOpen, onClose }: ShareCipherModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [hasConsented, setHasConsented] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset consent when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setHasConsented(false);
      setCopied(false);
    }
  }, [isOpen]);

  const handleCopy = async () => {
    if (!cipher) return;

    const text = cipher.entropyPieces
      .map((piece, idx) => `${t('ciphers.shareModal.phraseLabel', { index: idx + 1 })}: ${piece.value}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('ciphers.messages.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('ciphers.errors.copyFailed'));
    }
  };

  if (!isOpen || !cipher) return null;

  const warningBullets = t('ciphers.shareModal.warningBullets', { returnObjects: true }) as string[];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('ciphers.shareModal.title')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {!hasConsented ? (
            <div className="cipher-share-warning">
              <Alert variant="warning" className="cipher-share-warning-alert">
                <strong>{t('ciphers.shareModal.warningTitle')}</strong>
                <p>{t('ciphers.shareModal.warningMessage')}</p>
                <ul className="cipher-share-warning-list">
                  {warningBullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </Alert>

              <label className="cipher-share-consent">
                <input
                  type="checkbox"
                  checked={hasConsented}
                  onChange={(e) => setHasConsented(e.target.checked)}
                />
                <span>{t('ciphers.shareModal.consentLabel')}</span>
              </label>
            </div>
          ) : (
            <div className="cipher-share-content">
              <div className="cipher-share-section">
                <h3 className="cipher-share-section-title">{t('ciphers.shareModal.copyTitle')}</h3>
                <p className="cipher-share-section-desc">{t('ciphers.shareModal.copyDescription')}</p>

                <div className="cipher-share-phrases">
                  {cipher.entropyPieces.map((piece, idx) => (
                    <div key={idx} className="cipher-share-phrase">
                      <span className="cipher-share-phrase-label">
                        {t('ciphers.shareModal.phraseLabel', { index: idx + 1 })}
                      </span>
                      <code className="cipher-share-phrase-value">{piece.value}</code>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  className="btn btn-secondary btn-md cipher-share-copy-btn"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('ciphers.shareModal.copied')}
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      {t('ciphers.shareModal.copyButton')}
                    </>
                  )}
                </Button>
              </div>

              <div className="cipher-share-divider">
                <span>or</span>
              </div>

              <div className="cipher-share-section">
                <h3 className="cipher-share-section-title">{t('ciphers.shareModal.qrTitle')}</h3>
                <p className="cipher-share-section-desc">{t('ciphers.shareModal.qrDescription')}</p>

                <div className="cipher-share-qr-placeholder">
                  <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="3" height="3" />
                    <rect x="18" y="14" width="3" height="3" />
                    <rect x="14" y="18" width="3" height="3" />
                    <rect x="18" y="18" width="3" height="3" />
                  </svg>
                  <p className="cipher-share-qr-coming-soon">QR code generation coming soon</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <Button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-md"
          >
            {t('common.close')}
          </Button>
          {!hasConsented && (
            <Button
              type="button"
              className="btn btn-primary btn-md"
              disabled={!hasConsented}
              onClick={() => setHasConsented(true)}
            >
              {t('ciphers.shareModal.continueButton')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Duplicate Cipher Modal Component
// ============================================================================

interface DuplicateCipherModalProps {
  cipher: DecryptedCipher | null;
  isOpen: boolean;
  onClose: () => void;
  onDuplicate: (id: string, newName: string) => Promise<void>;
}

function DuplicateCipherModal({ cipher, isOpen, onClose, onDuplicate }: DuplicateCipherModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cipher && isOpen) {
      setName(t('ciphers.duplicateModal.namePlaceholder', { name: cipher.name }).replace('e.g., ', ''));
      setError(null);
    }
  }, [cipher, isOpen, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cipher || !name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await onDuplicate(cipher.id, name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ciphers.errors.duplicateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !cipher) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('ciphers.duplicateModal.title')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="cipher-duplicate-description">{t('ciphers.duplicateModal.description')}</p>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="form-group">
              <label className="form-label">{t('ciphers.duplicateModal.nameLabel')}</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('ciphers.duplicateModal.namePlaceholder', { name: cipher.name })}
                disabled={submitting}
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer">
            <Button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-md"
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={submitting || !name.trim()}
            >
              {submitting ? <Spinner size="sm" /> : t('ciphers.duplicateModal.submit')}
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
  cipher: DecryptedCipher;
  onEdit: (cipher: DecryptedCipher) => void;
  onShare: (cipher: DecryptedCipher) => void;
  onDuplicate: (cipher: DecryptedCipher) => void;
  onDelete: (cipher: DecryptedCipher) => void;
}

function CipherCard({ cipher, onEdit, onShare, onDuplicate, onDelete }: CipherCardProps) {
  const { t } = useTranslation();

  const createdDate = new Date(cipher.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card variant="elevated" className="cipher-card">
      <div className="cipher-card-header">
        <h3 className="cipher-name">{cipher.name}</h3>
        <div className="cipher-actions">
          <Tooltip content={t('common.edit')}>
            <button
              type="button"
              className="cipher-action-btn"
              onClick={() => onEdit(cipher)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content={t('common.share')}>
            <button
              type="button"
              className="cipher-action-btn"
              onClick={() => onShare(cipher)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content={t('common.duplicate')}>
            <button
              type="button"
              className="cipher-action-btn"
              onClick={() => onDuplicate(cipher)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content={t('common.delete')}>
            <button
              type="button"
              className="cipher-action-btn cipher-action-delete"
              onClick={() => onDelete(cipher)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </Tooltip>
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
  const { loading, ciphers, error, createCipher, deleteCipher, updateCipher, duplicateCipher, refresh } = useCipherStore();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editCipher, setEditCipher] = useState<DecryptedCipher | null>(null);
  const [shareCipher, setShareCipher] = useState<DecryptedCipher | null>(null);
  const [duplicateCipherModal, setDuplicateCipherModal] = useState<DecryptedCipher | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DecryptedCipher | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleExportSuccess = useCallback(() => {
    toast.success(t('identity.devices.export.success', 'Backup exported successfully.'));
  }, [toast, t]);

  const handleImportSuccess = useCallback((result: { ciphersImported: number; ciphersSkipped: number }) => {
    const totalImported = result.ciphersImported;
    const totalSkipped = result.ciphersSkipped;
    const msg = totalSkipped > 0
      ? `Imported ${totalImported} cipher(s). Skipped ${totalSkipped} existing.`
      : `Imported ${totalImported} cipher(s).`;
    toast.success(msg);
    refresh();
  }, [toast, refresh]);

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

  const handleEditCipher = useCallback(
    async (id: string, name: string, entropyPieces: EntropyPiece[]) => {
      const result = await updateCipher(id, { name, entropyPieces });
      if (result.success) {
        toast.success(t('ciphers.messages.updated'));
      } else {
        toast.error(result.error ?? t('ciphers.errors.updateFailed'));
        throw new Error(result.error);
      }
    },
    [updateCipher, toast, t]
  );

  const handleDuplicateCipher = useCallback(
    async (id: string, newName: string) => {
      const result = await duplicateCipher(id, newName);
      if (result.success) {
        toast.success(t('ciphers.messages.duplicated'));
      } else {
        toast.error(result.error ?? t('ciphers.errors.duplicateFailed'));
        throw new Error(result.error);
      }
    },
    [duplicateCipher, toast, t]
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

  // Identity is locked (needs passphrase to unlock)
  if (identityStatus === 'locked') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('ciphers.title')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.sessionLocked')}</Alert>
        </div>
      </div>
    );
  }

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
            <div className="page-header-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setExportDialogOpen(true)}
              >
                <BackupExportIcon />
                {t('ciphers.exportBackup', 'Export')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportDialogOpen(true)}
              >
                <BackupImportIcon />
                {t('ciphers.importBackup', 'Import')}
              </Button>
              <Button onClick={() => setAddModalOpen(true)} className="btn btn-primary btn-md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('ciphers.addButton')}
              </Button>
            </div>
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
                onEdit={setEditCipher}
                onShare={setShareCipher}
                onDuplicate={setDuplicateCipherModal}
                onDelete={setDeleteConfirm}
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

      {/* Edit Cipher Modal */}
      <EditCipherModal
        cipher={editCipher}
        isOpen={editCipher !== null}
        onClose={() => setEditCipher(null)}
        onSave={handleEditCipher}
      />

      {/* Share Cipher Modal */}
      <ShareCipherModal
        cipher={shareCipher}
        isOpen={shareCipher !== null}
        onClose={() => setShareCipher(null)}
      />

      {/* Duplicate Cipher Modal */}
      <DuplicateCipherModal
        cipher={duplicateCipherModal}
        isOpen={duplicateCipherModal !== null}
        onClose={() => setDuplicateCipherModal(null)}
        onDuplicate={handleDuplicateCipher}
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

      {/* Export backup dialog */}
      <ExportKeyBackupModal
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onSuccess={handleExportSuccess}
        defaultContent={['ciphers']}
      />

      {/* Import backup dialog */}
      <ImportKeyBackupModal
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}

function BackupExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function BackupImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
