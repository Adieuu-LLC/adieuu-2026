import { useCallback, useEffect, useState } from 'react';
import { loadConversationFsDefault, saveConversationFsDefault } from '../../services/preKeyService';
import {
  useGifPreference,
  useConversationGifHidden,
  loadGifAnimateOnHoverOnlyIdentity,
  useEffectiveGifAnimateOnHoverOnly,
  saveConversationGifAnimateOnHoverOverride,
} from '../useGifPreference';

/**
 * Per-conversation forward-secrecy default and GIF display preferences,
 * including the persisted overrides surfaced in the settings sidebar.
 */
export function useConversationPreferences(params: {
  conversationId: string | undefined;
  identityId: string | undefined;
  fsConfigEnabled: boolean;
}) {
  const { conversationId, identityId, fsConfigEnabled } = params;

  const resolveDefaultFs = useCallback(() => {
    if (!conversationId) return fsConfigEnabled;
    const convOverride = loadConversationFsDefault(conversationId);
    return convOverride ?? fsConfigEnabled;
  }, [conversationId, fsConfigEnabled]);

  const [useFs, setUseFs] = useState(resolveDefaultFs);
  const [convFsOverride, setConvFsOverride] = useState<boolean | null>(() =>
    conversationId ? loadConversationFsDefault(conversationId) : null,
  );

  useEffect(() => {
    if (conversationId) {
      const override = loadConversationFsDefault(conversationId);
      setConvFsOverride(override);
      setUseFs(override ?? fsConfigEnabled);
    } else {
      setConvFsOverride(null);
      setUseFs(fsConfigEnabled);
    }
  }, [conversationId, fsConfigEnabled]);

  const handleConvFsToggle = useCallback(
    (enabled: boolean) => {
      if (!conversationId) return;
      setConvFsOverride(enabled);
      saveConversationFsDefault(conversationId, enabled);
      setUseFs(enabled);
    },
    [conversationId],
  );

  const handleToggleFs = useCallback(() => {
    setUseFs((v) => !v);
  }, []);

  const [gifVisibility] = useGifPreference(identityId ?? '');
  const gifsGloballyDisabled = gifVisibility === 'disabled';
  const [convGifHidden, setConvGifHidden] = useConversationGifHidden(conversationId ?? '');
  const effectiveGifAnimateOnHover = useEffectiveGifAnimateOnHoverOnly(
    identityId ?? '',
    conversationId ?? '',
  );

  const handleGifAnimateOnHoverConversationToggle = useCallback(
    (checked: boolean) => {
      if (!conversationId || !identityId) return;
      saveConversationGifAnimateOnHoverOverride(
        conversationId,
        checked,
        loadGifAnimateOnHoverOnlyIdentity(identityId),
      );
    },
    [conversationId, identityId],
  );

  return {
    useFs,
    convFsOverride,
    handleConvFsToggle,
    handleToggleFs,
    gifsGloballyDisabled,
    convGifHidden,
    setConvGifHidden,
    effectiveGifAnimateOnHover,
    handleGifAnimateOnHoverConversationToggle,
  };
}
