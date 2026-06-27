import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderFormattedMessage } from '../utils/markdownParser';

interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function MarkdownTextarea({
  value,
  onChange,
  maxLength,
  rows = 4,
  placeholder,
  disabled,
  id,
}: MarkdownTextareaProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  return (
    <div className="md-textarea">
      <div className="md-textarea-tabs">
        <button
          type="button"
          className={`md-textarea-tab ${activeTab === 'write' ? 'md-textarea-tab--active' : ''}`}
          onClick={() => setActiveTab('write')}
        >
          {t('support.markdown.write')}
        </button>
        <button
          type="button"
          className={`md-textarea-tab ${activeTab === 'preview' ? 'md-textarea-tab--active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          {t('support.markdown.preview')}
        </button>
      </div>

      {activeTab === 'write' ? (
        <textarea
          id={id}
          className="md-textarea-input"
          value={value}
          onChange={(e) => {
            const next = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
            onChange(next);
          }}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
      ) : (
        <div className="md-textarea-preview" style={{ minHeight: `${rows * 1.5}rem` }}>
          {value.trim()
            ? renderFormattedMessage(value, () => {})
            : <span className="md-textarea-preview-empty">{t('support.markdown.nothingToPreview')}</span>}
        </div>
      )}
    </div>
  );
}
