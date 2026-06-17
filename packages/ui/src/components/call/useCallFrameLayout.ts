import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computePinnedLayout,
  getActiveScreenShareFrames,
  getDmSplitFrames,
  getGridClass,
  resolveLayoutMode,
  sanitizeFrameId,
  selectAutoPinScreenShareFrameId,
  selectDefaultHeroFrameId,
} from './callFrameLayoutLogic';
import type { CallFrame } from './callFrameTypes';
import { hasActiveScreenShareFrames } from './callFrameTypes';
import type { CallLayoutMode } from './callFrameTypes';

export interface UseCallFrameLayoutOptions {
  frames: CallFrame[];
  localIdentity: string;
  participantCount: number;
  isDm: boolean;
  isMobile: boolean;
}

export interface UseCallFrameLayoutResult {
  mode: CallLayoutMode;
  pinnedFrameId: string | null;
  focusedFrameId: string | null;
  heroFrame: CallFrame | null;
  sidebarFrames: CallFrame[];
  overflowFrames: CallFrame[];
  dmSplitFrames: CallFrame[];
  gridClass: string;
  thumbnailFrames: CallFrame[];
  pinFrame: (frameId: string) => void;
  unpinFrame: () => void;
  togglePinFrame: (frameId: string) => void;
  selectFocusedFrame: (frameId: string) => void;
  promoteFromOverflow: (frameId: string) => void;
  isFramePinned: (frameId: string) => boolean;
}

export function useCallFrameLayout({
  frames,
  localIdentity,
  participantCount,
  isDm,
  isMobile,
}: UseCallFrameLayoutOptions): UseCallFrameLayoutResult {
  const defaultHeroId = useMemo(
    () => selectDefaultHeroFrameId(frames, localIdentity, isDm),
    [frames, localIdentity, isDm],
  );

  const [pinnedFrameId, setPinnedFrameId] = useState<string | null>(null);
  const [focusedFrameId, setFocusedFrameId] = useState<string | null>(null);
  const [sidebarPromotionId, setSidebarPromotionId] = useState<string | null>(null);
  const prevScreenFrameIdsRef = useRef<Set<string>>(new Set());
  const declinedAutoPinScreenShareRef = useRef(false);

  const hasActiveScreenShare = useMemo(
    () => hasActiveScreenShareFrames(frames),
    [frames],
  );

  useEffect(() => {
    setPinnedFrameId((current) => sanitizeFrameId(current, frames, null));
    setSidebarPromotionId((current) => sanitizeFrameId(current, frames, null));
    setFocusedFrameId((current) => sanitizeFrameId(current, frames, defaultHeroId));
  }, [frames, defaultHeroId]);

  useEffect(() => {
    const activeScreenShares = getActiveScreenShareFrames(frames);
    const activeScreenIds = new Set(activeScreenShares.map((frame) => frame.id));

    if (activeScreenShares.length === 0) {
      declinedAutoPinScreenShareRef.current = false;
      prevScreenFrameIdsRef.current = activeScreenIds;
      return;
    }

    setPinnedFrameId((current) => {
      const autoPinId = selectAutoPinScreenShareFrameId(
        frames,
        current,
        declinedAutoPinScreenShareRef.current,
        prevScreenFrameIdsRef.current,
      );
      return autoPinId ?? current;
    });

    const focusTarget = activeScreenShares[0]?.id;
    if (focusTarget) {
      setFocusedFrameId((current) => sanitizeFrameId(current, frames, focusTarget));
    }

    prevScreenFrameIdsRef.current = activeScreenIds;
  }, [frames]);

  const mode = resolveLayoutMode(
    pinnedFrameId,
    isDm,
    participantCount,
    isMobile,
    hasActiveScreenShare,
  );

  const pinFrame = useCallback((frameId: string) => {
    declinedAutoPinScreenShareRef.current = false;
    setPinnedFrameId(frameId);
    setSidebarPromotionId(null);
  }, []);

  const unpinFrame = useCallback(() => {
    setPinnedFrameId(null);
    setSidebarPromotionId(null);
  }, []);

  const togglePinFrame = useCallback((frameId: string) => {
    setPinnedFrameId((current) => {
      if (current === frameId) {
        setSidebarPromotionId(null);
        const unpinnedFrame = frames.find((frame) => frame.id === frameId);
        if (unpinnedFrame?.source === 'screenshare') {
          declinedAutoPinScreenShareRef.current = true;
        }
        return null;
      }
      declinedAutoPinScreenShareRef.current = false;
      setSidebarPromotionId(null);
      return frameId;
    });
  }, [frames]);

  const selectFocusedFrame = useCallback((frameId: string) => {
    setFocusedFrameId(frameId);
  }, []);

  const promoteFromOverflow = useCallback((frameId: string) => {
    setSidebarPromotionId(frameId);
  }, []);

  const isFramePinned = useCallback(
    (frameId: string) => pinnedFrameId === frameId,
    [pinnedFrameId],
  );

  const pinnedLayout = useMemo(() => {
    if (!pinnedFrameId) return null;
    return computePinnedLayout(frames, pinnedFrameId, sidebarPromotionId);
  }, [frames, pinnedFrameId, sidebarPromotionId]);

  const dmSplitFrames = useMemo(
    () => (mode === 'dm-split' ? getDmSplitFrames(frames, localIdentity) : []),
    [mode, frames, localIdentity],
  );

  const heroFrame = useMemo((): CallFrame | null => {
    if (mode === 'pinned') return pinnedLayout?.hero ?? null;
    if (mode === 'mobile-stage') {
      const id = focusedFrameId ?? defaultHeroId;
      return frames.find((frame) => frame.id === id) ?? frames[0] ?? null;
    }
    return null;
  }, [mode, pinnedLayout, focusedFrameId, defaultHeroId, frames]);

  const sidebarFrames = pinnedLayout?.sidebar ?? [];
  const overflowFrames = pinnedLayout?.overflow ?? [];

  const thumbnailFrames = useMemo((): CallFrame[] => {
    if (mode === 'mobile-stage' && heroFrame) {
      return frames.filter((frame) => frame.id !== heroFrame.id);
    }
    return [];
  }, [mode, frames, heroFrame]);

  const gridClass = getGridClass(participantCount);

  return {
    mode,
    pinnedFrameId,
    focusedFrameId,
    heroFrame,
    sidebarFrames,
    overflowFrames,
    dmSplitFrames,
    gridClass,
    thumbnailFrames,
    pinFrame,
    unpinFrame,
    togglePinFrame,
    selectFocusedFrame,
    promoteFromOverflow,
    isFramePinned,
  };
}
