/**
 * Compact "share to community" control for a saved custom theme card.
 * Shown only when the alias is signed in, the palette is not a built-in preset,
 * this identity has not already shared the same colours, and the theme name meets API length rules.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeDefinition } from '@adieuu/shared';
import { computeColorChecksum, createApiClient } from '@adieuu/shared';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';
import { Icon } from '../icons/Icon';
import { useAppConfig } from '../config';
import { useIdentity } from '../hooks/useIdentity';
import { BUILTIN_THEMES } from '../constants/builtinThemes';

const MIN_SHARE_NAME_LEN = 3;

export interface CustomThemeShareButtonProps {
  theme: ThemeDefinition;
  sharedChecksums: ReadonlySet<string>;
  onShared: () => void | Promise<void>;
}

export function CustomThemeShareButton({
  theme,
  sharedChecksums,
  onShared,
}: CustomThemeShareButtonProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const [checksum, setChecksum] = useState<string | null>(null);
  const [matchesBuiltin, setMatchesBuiltin] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await computeColorChecksum(theme.colors);
      const builtinChecksums = await Promise.all(
        BUILTIN_THEMES.map((bt) => computeColorChecksum(bt.theme.colors)),
      );
      if (cancelled) return;
      setChecksum(c);
      setMatchesBuiltin(builtinChecksums.includes(c));
    })();
    return () => {
      cancelled = true;
    };
  }, [theme]);

  const handleShare = useCallback(async () => {
    if (identityStatus !== 'logged_in' || !checksum || matchesBuiltin || sharedChecksums.has(checksum)) {
      return;
    }
    const name = theme.name.trim();
    if (name.length < MIN_SHARE_NAME_LEN) {
      toast.warning(t('account.appearance.shareNameTooShort'));
      return;
    }

    setSharing(true);
    try {
      const api = createApiClient({ baseUrl: apiBaseUrl });
      const resp = await api.themes.create({
        name,
        description: theme.description ?? '',
        theme,
        tags: [],
      });
      if (resp.success) {
        toast.success(t('account.appearance.themeShared'));
        await onShared();
      } else if (resp.error?.code === 'CONFLICT') {
        toast.warning(t('account.appearance.shareBlockedDuplicate'));
        await onShared();
      } else {
        toast.error(resp.error?.message ?? t('account.appearance.shareError'));
      }
    } catch {
      toast.error(t('account.appearance.shareError'));
    } finally {
      setSharing(false);
    }
  }, [
    apiBaseUrl,
    checksum,
    identityStatus,
    matchesBuiltin,
    onShared,
    sharedChecksums,
    theme,
    toast,
    t,
  ]);

  if (identityStatus !== 'logged_in' || checksum === null) {
    return null;
  }

  if (matchesBuiltin || sharedChecksums.has(checksum)) {
    return null;
  }

  const nameOk = theme.name.trim().length >= MIN_SHARE_NAME_LEN;
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="theme-preset-share"
      disabled={!nameOk || sharing}
      title={nameOk ? t('account.appearance.shareButton') : undefined}
      onClick={() => void handleShare()}
      aria-label={t('account.appearance.shareButton')}
    >
      <Icon name="globe" />
    </Button>
  );

  if (!nameOk) {
    return (
      <Tooltip content={t('account.appearance.shareNameTooShort')} position="bottom">
        <span className="theme-preset-share-tooltip-wrap">{button}</span>
      </Tooltip>
    );
  }

  return button;
}
