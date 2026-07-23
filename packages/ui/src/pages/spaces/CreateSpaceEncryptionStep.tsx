/**
 * Create-Space wizard step 3: content encryption, identity encryption, join gate.
 */

import { useTranslation } from 'react-i18next';
import type { DecryptedCipher } from '../../hooks/useCipherStore';
import { Alert } from '../../components/Alert';
import {
  SpaceCipherFormFields,
  type CipherSource,
  type EntropyRow,
} from './SpaceCipherFormFields';

export interface CreateSpaceEncryptionStepProps {
  /** Current visibility — used to tailor identity-encryption copy for Listed. */
  visibility: 'public' | 'listed' | 'hidden';
  canUseCipher: boolean;
  encrypt: boolean;
  onEncryptChange: (value: boolean) => void;
  encryptIdentity: boolean;
  onEncryptIdentityChange: (value: boolean) => void;
  cipherRequired: boolean;
  onCipherRequiredChange: (value: boolean) => void;
  needsCipher: boolean;
  encryptionAvailable: boolean;
  cipherSource: CipherSource;
  onCipherSourceChange: (value: CipherSource) => void;
  ciphers: DecryptedCipher[];
  selectedCipherId: string;
  onSelectedCipherIdChange: (value: string) => void;
  newCipherName: string;
  onNewCipherNameChange: (value: string) => void;
  entropyRows: EntropyRow[];
  onEntropyRowChange: (id: string, value: string) => void;
  onAddEntropyRow: () => void;
  onRemoveEntropyRow: (id: string) => void;
  disabled: boolean;
}

export function CreateSpaceEncryptionStep({
  visibility,
  canUseCipher,
  encrypt,
  onEncryptChange,
  encryptIdentity,
  onEncryptIdentityChange,
  cipherRequired,
  onCipherRequiredChange,
  needsCipher,
  encryptionAvailable,
  cipherSource,
  onCipherSourceChange,
  ciphers,
  selectedCipherId,
  onSelectedCipherIdChange,
  newCipherName,
  onNewCipherNameChange,
  entropyRows,
  onEntropyRowChange,
  onAddEntropyRow,
  onRemoveEntropyRow,
  disabled,
}: CreateSpaceEncryptionStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-create-step space-create-encryption">
      <label className="space-create-checkbox">
        <input
          id="space-encrypt"
          type="checkbox"
          checked={encrypt}
          onChange={(e) => onEncryptChange(e.target.checked)}
          disabled={disabled || !canUseCipher}
        />
        <span className="space-create-checkbox-body">
          <span className="space-create-radio-title">
            {t('spaces.create.encryptionToggle')}
          </span>
          <span className="space-create-radio-desc">
            {canUseCipher
              ? t('spaces.create.encryptionHint')
              : t('spaces.create.encryptionPublicNote')}
          </span>
        </span>
      </label>

      <label className="space-create-checkbox space-create-checkbox--nested">
        <input
          id="space-encrypt-identity"
          type="checkbox"
          checked={encryptIdentity}
          onChange={(e) => onEncryptIdentityChange(e.target.checked)}
          disabled={disabled || !canUseCipher || !encrypt}
        />
        <span className="space-create-checkbox-body">
          <span className="space-create-radio-title">
            {t('spaces.create.encryptIdentityToggle')}
          </span>
          <span className="space-create-radio-desc">
            {t('spaces.create.encryptIdentityHint')}
            {visibility === 'listed' ? (
              <>
                {' '}
                {t('spaces.create.encryptIdentityListedUrlNote')}
              </>
            ) : null}
          </span>
        </span>
      </label>

      <label className="space-create-checkbox">
        <input
          id="space-cipher-required"
          type="checkbox"
          checked={cipherRequired}
          onChange={(e) => onCipherRequiredChange(e.target.checked)}
          disabled={disabled || !canUseCipher}
        />
        <span className="space-create-checkbox-body">
          <span className="space-create-radio-title">
            {t('spaces.create.cipherRequiredToggle')}
          </span>
          <span className="space-create-radio-desc">
            {canUseCipher
              ? t('spaces.create.cipherRequiredHint')
              : t('spaces.create.cipherRequiredPublicNote')}
          </span>
        </span>
      </label>

      {needsCipher && !encryptionAvailable && (
        <Alert variant="warning" className="space-create-encryption-warning">
          {t('spaces.create.encryptionUnavailable')}
        </Alert>
      )}

      {needsCipher && encryptionAvailable && (
        <SpaceCipherFormFields
          idPrefix="create-cipher"
          cipherSource={cipherSource}
          onCipherSourceChange={onCipherSourceChange}
          ciphers={ciphers}
          selectedCipherId={selectedCipherId}
          onSelectedCipherIdChange={onSelectedCipherIdChange}
          newCipherName={newCipherName}
          onNewCipherNameChange={onNewCipherNameChange}
          entropyRows={entropyRows}
          onEntropyRowChange={onEntropyRowChange}
          onAddEntropyRow={onAddEntropyRow}
          onRemoveEntropyRow={onRemoveEntropyRow}
          disabled={disabled}
        />
      )}
    </div>
  );
}
