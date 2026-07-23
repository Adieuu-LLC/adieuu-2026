/**
 * Shared Cipher picker / create fields used by CreateSpace, channel settings,
 * the join interstitial, and the in-channel Cipher recovery panel.
 *
 * Uses an inline search + list (not a portaled Combobox/Popover) so it works
 * inside Ark Dialogs, which trap focus and disable pointer events outside.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecryptedCipher } from '../../hooks/useCipherStore';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';

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
  const [query, setQuery] = useState('');

  const selectedCipher = useMemo(
    () => ciphers.find((c) => c.id === selectedCipherId) ?? null,
    [ciphers, selectedCipherId],
  );

  const filteredCiphers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ciphers;
    return ciphers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortId.toLowerCase().includes(q) ||
        c.cipherId.toLowerCase().includes(q),
    );
  }, [ciphers, query]);

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
          <div className="form-group space-cipher-combobox-field">
            <span className="input-label">{t('spaces.create.cipherSelectLabel')}</span>

            {selectedCipher ? (
              <div className="space-cipher-selected" aria-live="polite">
                <div className="space-cipher-selected-main">
                  <span className="space-cipher-selected-name">{selectedCipher.name}</span>
                  <span className="spaces-badge">{selectedCipher.shortId}</span>
                  <span className="spaces-badge spaces-badge--selected">
                    {t('spaces.create.cipherSelectedBadge')}
                  </span>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    className="space-cipher-selected-clear"
                    aria-label={t('spaces.create.cipherClearSelection')}
                    onClick={() => onSelectedCipherIdChange('')}
                  >
                    <Icon name="x" size="xs" />
                  </button>
                )}
              </div>
            ) : (
              <p className="space-create-hint">{t('spaces.create.cipherNoneSelected')}</p>
            )}

            <div className="space-cipher-picker">
              <div className="space-cipher-search-row">
                <span className="space-cipher-combobox-search-icon" aria-hidden>
                  <Icon name="search" size="xs" />
                </span>
                <input
                  id={`${idPrefix}-search`}
                  type="search"
                  className="space-cipher-combobox-input"
                  placeholder={t('spaces.create.cipherSearchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={t('spaces.create.cipherSearchPlaceholder')}
                  autoComplete="off"
                  disabled={disabled}
                />
              </div>

              <ul
                className="space-cipher-combobox-list"
                role="listbox"
                aria-label={t('spaces.create.cipherSelectLabel')}
              >
                {filteredCiphers.length === 0 ? (
                  <li className="space-cipher-combobox-empty" role="presentation">
                    {t('spaces.create.cipherNoMatch')}
                  </li>
                ) : (
                  filteredCiphers.map((cipher) => {
                    const isSelected = cipher.id === selectedCipherId;
                    return (
                      <li key={cipher.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`space-cipher-combobox-item${isSelected ? ' space-cipher-combobox-item--selected' : ''}`}
                          disabled={disabled}
                          onClick={() => onSelectedCipherIdChange(cipher.id)}
                        >
                          <div className="space-cipher-combobox-item-main">
                            <span className="space-cipher-combobox-item-name">
                              {cipher.name}
                            </span>
                            <span className="space-cipher-combobox-item-id">
                              {cipher.shortId}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="spaces-badge spaces-badge--selected">
                              {t('spaces.create.cipherSelectedBadge')}
                            </span>
                          )}
                          {isSelected && (
                            <span className="space-cipher-combobox-item-check" aria-hidden>
                              <Icon name="check" size="xs" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
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
