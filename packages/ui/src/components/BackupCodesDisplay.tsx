import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@ark-ui/react';
import { Button } from './Button';

interface BackupCodesDisplayProps {
  codes: string[];
  onConfirm: () => void;
  title?: string;
  description?: string;
}

export function BackupCodesDisplay({
  codes,
  onConfirm,
  title,
  description,
}: BackupCodesDisplayProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayTitle = title ?? t('identity.backupCodes.title');
  const displayDescription = description ?? t('identity.backupCodes.description');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codes]);

  const handleDownload = useCallback(() => {
    const text = [
      'Adieuu Identity Backup Codes',
      '============================',
      '',
      'Each code can be used once. Store these somewhere safe.',
      '',
      ...codes,
      '',
      `Generated: ${new Date().toISOString()}`,
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'adieuu-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div className="backup-codes-display">
      <h3 className="backup-codes-title">{displayTitle}</h3>
      <p className="backup-codes-description">{displayDescription}</p>

      <div className="backup-codes-grid">
        {codes.map((code, i) => (
          <code key={i} className="backup-codes-code">{code}</code>
        ))}
      </div>

      <p className="backup-codes-warning">
        {t('identity.backupCodes.warning')}
      </p>

      <div className="backup-codes-actions">
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied
            ? t('identity.backupCodes.copied')
            : t('identity.backupCodes.copy')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownload}>
          {t('identity.backupCodes.download')}
        </Button>
      </div>

      <Checkbox.Root
        checked={confirmed}
        onCheckedChange={(e) => setConfirmed(e.checked === true)}
        className="backup-codes-confirm-checkbox"
      >
        <Checkbox.Control className="backup-codes-checkbox-control" />
        <Checkbox.Label className="backup-codes-checkbox-label">
          {t('identity.backupCodes.confirmLabel')}
        </Checkbox.Label>
        <Checkbox.HiddenInput />
      </Checkbox.Root>

      <div className="backup-codes-continue">
        <Button onClick={onConfirm} disabled={!confirmed}>
          {t('identity.backupCodes.continue')}
        </Button>
      </div>
    </div>
  );
}
