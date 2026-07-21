/**
 * Encrypt toggle + Cipher picker for create/edit channel settings.
 * When inheriting from parent, shows a read-only preview (like roles).
 */

import { useMemo } from 'react';
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
  inheritFromParent?: boolean;
  onInheritFromParentChange?: (value: boolean) => void;
  forcedByName?: string | null;
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
  inheritFromParent = false,
  onInheritFromParentChange,
  forcedByName = null,
}: ChannelSettingsEncryptionProps) {
  const { t } = useTranslation();
  const forced = !!forcedByName;
  const inheriting = inheritFromParent || forced;

  const selectedCipher = useMemo(
    () => ciphers.find((c) => c.id === selectedCipherId) ?? null,
    [ciphers, selectedCipherId],
  );

  return (
    <div className="create-channel-encryption">
      {onInheritFromParentChange && (
        <label className="create-channel-inherit">
          <input
            type="checkbox"
            checked={inheriting}
            onChange={(e) => onInheritFromParentChange(e.target.checked)}
            disabled={disabled || forced}
          />
          <span className="create-channel-encrypt-body">
            <span className="create-channel-field-label">
              {t('spaces.createChannel.inheritEncryptionLabel')}
            </span>
            <span className="create-channel-field-hint">
              {forced
                ? t('spaces.createChannel.inheritEncryptionForced', {
                    name: forcedByName,
                  })
                : t('spaces.createChannel.inheritEncryptionHint')}
            </span>
          </span>
        </label>
      )}

      {inheriting ? (
        <div className="create-channel-encryption-preview" aria-live="polite">
          <span className="create-channel-field-label">
            {label ?? t('spaces.createChannel.encryptLabel')}
          </span>
          {!encrypt ? (
            <p className="create-channel-role-none">
              {t('spaces.createChannel.inheritEncryptionPreviewOff')}
            </p>
          ) : (
            <div className="space-cipher-selected">
              <div className="space-cipher-selected-main">
                <span className="space-cipher-selected-name">
                  {selectedCipher
                    ? t('spaces.createChannel.inheritEncryptionPreviewCipher', {
                        name: selectedCipher.name,
                      })
                    : t('spaces.createChannel.inheritEncryptionPreviewUnknownCipher')}
                </span>
                {selectedCipher && (
                  <span className="spaces-badge">{selectedCipher.shortId}</span>
                )}
                <span className="spaces-badge spaces-badge--selected">
                  {t('spaces.createChannel.inheritEncryptionPreviewOn')}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
