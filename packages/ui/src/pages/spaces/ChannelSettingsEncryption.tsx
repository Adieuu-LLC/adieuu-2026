/**
 * Encrypt toggle + Cipher picker for create/edit channel settings.
 */

import { useTranslation } from 'react-i18next';
import type { DecryptedCipher } from '../../hooks/useCipherStore';
import { Alert } from '../../components/Alert';
import {
  SpaceCipherFormFields,
  type CipherSource,
  type EntropyRow,
} from './SpaceCipherFormFields';

export interface ChannelSettingsEncryptionProps {
  encrypt: boolean;
  onEncryptChange: (value: boolean) => void;
  encryptionAvailable: boolean;
  /** When the Space is e2ee, note that Space-wide encryption still applies. */
  spaceE2ee: boolean;
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
  disabled?: boolean;
  /** Override copy for category settings (defaults to channel copy). */
  label?: string;
  hint?: string;
  idPrefix?: string;
}

export function ChannelSettingsEncryption({
  encrypt,
  onEncryptChange,
  encryptionAvailable,
  spaceE2ee,
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
  disabled = false,
  label,
  hint,
  idPrefix = 'channel-settings-cipher',
}: ChannelSettingsEncryptionProps) {
  const { t } = useTranslation();

  return (
    <div className="create-channel-encryption">
      <label className="create-channel-encrypt">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(e) => onEncryptChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="create-channel-encrypt-body">
          <span className="create-channel-field-label">
            {label ?? t('spaces.createChannel.encryptLabel')}
          </span>
          <span className="create-channel-field-hint">
            {hint ??
              (spaceE2ee
                ? t('spaces.createChannel.encryptSpaceE2eeHint')
                : t('spaces.createChannel.encryptHint'))}
          </span>
        </span>
      </label>

      {encrypt && !encryptionAvailable && (
        <Alert variant="warning" className="create-channel-encryption-warning">
          {t('spaces.create.encryptionUnavailable')}
        </Alert>
      )}

      {encrypt && encryptionAvailable && (
        <SpaceCipherFormFields
          idPrefix={idPrefix}
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
