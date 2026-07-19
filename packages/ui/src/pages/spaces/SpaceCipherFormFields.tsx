/**
 * Shared Cipher picker / create fields used by CreateSpace, the join
 * interstitial, and the in-channel Cipher recovery panel.
 */

import { useTranslation } from 'react-i18next';
import type { DecryptedCipher } from '../../hooks/useCipherStore';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';

export type CipherSource = 'existing' | 'new';

export interface EntropyRow {
  id: string;
  value: string;
}

export interface SpaceCipherFormFieldsProps {
  cipherSource: CipherSource;
  onCipherSourceChange: (source: CipherSource) => void;
  ciphers: DecryptedCipher[];
  selectedCipherId: string;
  onSelectedCipherIdChange: (id: string) => void;
  newCipherName: string;
  onNewCipherNameChange: (name: string) => void;
  entropyRows: EntropyRow[];
  onEntropyRowChange: (id: string, value: string) => void;
  onAddEntropyRow: () => void;
  onRemoveEntropyRow: (id: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function SpaceCipherFormFields({
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
  idPrefix = 'space-cipher',
}: SpaceCipherFormFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-create-cipher">
      <fieldset className="form-group space-create-fieldset" disabled={disabled}>
        <legend className="input-label sr-only">{t('spaces.create.cipherSelectLabel')}</legend>
        <label className="space-create-radio-inline">
          <input
            type="radio"
            name={`${idPrefix}-source`}
            value="existing"
            checked={cipherSource === 'existing'}
            onChange={() => onCipherSourceChange('existing')}
          />
          <span>{t('spaces.create.cipherSourceExisting')}</span>
        </label>
        <label className="space-create-radio-inline">
          <input
            type="radio"
            name={`${idPrefix}-source`}
            value="new"
            checked={cipherSource === 'new'}
            onChange={() => onCipherSourceChange('new')}
          />
          <span>{t('spaces.create.cipherSourceNew')}</span>
        </label>
      </fieldset>

      {cipherSource === 'existing' &&
        (ciphers.length === 0 ? (
          <p className="space-create-hint">{t('spaces.create.noCiphers')}</p>
        ) : (
          <div className="form-group">
            <label htmlFor={`${idPrefix}-select`} className="input-label">
              {t('spaces.create.cipherSelectLabel')}
            </label>
            <select
              id={`${idPrefix}-select`}
              className="input"
              value={selectedCipherId}
              onChange={(e) => onSelectedCipherIdChange(e.target.value)}
              disabled={disabled}
            >
              <option value="">{t('spaces.create.cipherSelectPlaceholder')}</option>
              {ciphers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.shortId})
                </option>
              ))}
            </select>
          </div>
        ))}

      {cipherSource === 'new' && (
        <>
          <Input
            id={`${idPrefix}-new-name`}
            label={t('spaces.create.newCipherNameLabel')}
            value={newCipherName}
            placeholder={t('spaces.create.newCipherNamePlaceholder')}
            onChange={(e) => onNewCipherNameChange(e.target.value)}
            disabled={disabled}
          />
          <div className="form-group">
            <span className="input-label">{t('spaces.create.entropyLabel')}</span>
            <p className="space-create-hint">{t('spaces.create.entropyHint')}</p>
            <div className="space-create-entropy-rows">
              {entropyRows.map((row, index) => (
                <div key={row.id} className="space-create-entropy-row">
                  <Input
                    id={`${idPrefix}-entropy-${row.id}`}
                    label={`${t('spaces.create.entropyLabel')} ${index + 1}`}
                    hideLabel
                    value={row.value}
                    placeholder={t('spaces.create.entropyPlaceholder')}
                    onChange={(e) => onEntropyRowChange(row.id, e.target.value)}
                    disabled={disabled}
                  />
                  {entropyRows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('spaces.create.removePhrase')}
                      onClick={() => onRemoveEntropyRow(row.id)}
                      disabled={disabled}
                    >
                      &times;
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAddEntropyRow}
              disabled={disabled}
            >
              {t('spaces.create.addPhrase')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
