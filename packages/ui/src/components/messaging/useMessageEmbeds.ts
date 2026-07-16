import { useState, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useEmbedPreference, isDomainAllowed } from '../../hooks/useEmbedPreference';
import { useEmbedOnboarding } from '../../hooks/useEmbedOnboarding';
import { detectEmbeds, extractTld } from '../../utils/embedDetection';
import type { HiddenEmbedInfo } from '../../utils/markdownParser';
import { useAppConfig } from '../../config';
import { createUnfurlFetcher } from '../../services/unfurlService';

export interface UseMessageEmbedsResult {
  embedPreference: ReturnType<typeof useEmbedPreference>[0];
  fetchMetadata: ReturnType<typeof createUnfurlFetcher>;
  embedOverrides: Record<string, boolean>;
  hiddenEmbedMap: Map<string, HiddenEmbedInfo> | undefined;
  hasEmbedOverrides: boolean;
  hasHiddenEmbeds: boolean;
  showEmbedOnboarding: boolean;
  enableEmbedsModalOpen: boolean;
  setEnableEmbedsModalOpen: (open: boolean) => void;
  handleAddToAllowlist: (domain: string) => void;
  handleEnableAllEmbeds: () => void;
  dismissEmbedOnboarding: () => void;
}

export function useMessageEmbeds(content: string, selfId: string | undefined): UseMessageEmbedsResult {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const [embedPreference, setEmbedPreference] = useEmbedPreference(selfId ?? '');
  const fetchMetadata = useMemo(() => createUnfurlFetcher(apiBaseUrl), [apiBaseUrl]);
  const [embedOverrides, setEmbedOverrides] = useState<Record<string, boolean>>({});
  const { seen: embedOnboardingSeen, dismiss: dismissEmbedOnboarding } = useEmbedOnboarding(selfId ?? '');
  const [enableEmbedsModalOpen, setEnableEmbedsModalOpen] = useState(false);

  const embedOverridesRef = useRef(embedOverrides);
  embedOverridesRef.current = embedOverrides;

  const toggleEmbedOverride = useCallback((url: string, trigger?: HTMLElement) => {
    const isShowing = embedOverridesRef.current[url] !== true;

    setEmbedOverrides((prev) => {
      if (prev[url] === true) {
        const next = { ...prev };
        delete next[url];
        return next;
      }
      return { ...prev, [url]: true };
    });

    if (isShowing && trigger) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const messageEl = trigger.closest('.dm-message');
          const embedEl = messageEl?.querySelector('.message-embeds');
          if (embedEl) {
            embedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      });
    }
  }, []);

  const hiddenEmbedMap = useMemo((): Map<string, HiddenEmbedInfo> | undefined => {
    if (!content) return undefined;
    const embeds = detectEmbeds(content);
    if (embeds.length === 0) return undefined;

    const tooltipHide = t('identity.appearance.embedToggleHide', 'Click to hide embed');
    const tooltipDisabled = t('identity.appearance.embedToggleDisabled', 'Embed available but hidden (embeds disabled)');
    const tooltipNotAllowlisted = t('identity.appearance.embedToggleNotAllowlisted', 'Embed available but hidden (domain not in allowlist)');

    const map = new Map<string, HiddenEmbedInfo>();
    for (const embed of embeds) {
      const isOverridden = embedOverrides[embed.url] === true;

      if (embedPreference.mode === 'none') {
        map.set(embed.url, {
          reason: 'disabled',
          overrideActive: isOverridden,
          onToggle: (trigger?: HTMLElement) => toggleEmbedOverride(embed.url, trigger),
          tooltipText: isOverridden ? tooltipHide : tooltipDisabled,
        });
      } else {
        const domain = extractTld(embed.url);
        if (domain && !isDomainAllowed(domain, embedPreference)) {
          map.set(embed.url, {
            reason: 'domain-not-allowed',
            overrideActive: isOverridden,
            onToggle: (trigger?: HTMLElement) => toggleEmbedOverride(embed.url, trigger),
            tooltipText: isOverridden ? tooltipHide : tooltipNotAllowlisted,
          });
        }
      }
    }
    return map.size > 0 ? map : undefined;
  }, [content, embedPreference, embedOverrides, toggleEmbedOverride, t]);

  const hasEmbedOverrides = useMemo(
    () => Object.values(embedOverrides).some((v) => v === true),
    [embedOverrides],
  );

  const hasHiddenEmbeds = !!hiddenEmbedMap && hiddenEmbedMap.size > 0;

  const handleAddToAllowlist = useCallback((domain: string) => {
    if (!selfId) return;
    const normalized = domain.replace(/^www\./, '').toLowerCase();
    if (!embedPreference.allowlist.includes(normalized)) {
      setEmbedPreference({
        ...embedPreference,
        allowlist: [...embedPreference.allowlist, normalized],
      });
    }
  }, [selfId, embedPreference, setEmbedPreference]);

  const handleEnableAllEmbeds = useCallback(() => {
    if (!selfId) return;
    setEmbedPreference({ ...embedPreference, mode: 'all' });
    dismissEmbedOnboarding();
    setEnableEmbedsModalOpen(false);
  }, [selfId, embedPreference, setEmbedPreference, dismissEmbedOnboarding]);

  const showEmbedOnboarding = !embedOnboardingSeen && hasHiddenEmbeds;

  return {
    embedPreference,
    fetchMetadata,
    embedOverrides,
    hiddenEmbedMap,
    hasEmbedOverrides,
    hasHiddenEmbeds,
    showEmbedOnboarding,
    enableEmbedsModalOpen,
    setEnableEmbedsModalOpen,
    handleAddToAllowlist,
    handleEnableAllEmbeds,
    dismissEmbedOnboarding,
  };
}
