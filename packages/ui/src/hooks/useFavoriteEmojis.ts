/**
 * Favourite Emojis Hook
 *
 * Manages up to 3 favourite emoji per identity, stored in localStorage.
 * Favourites appear as quick-react buttons in the message hover menu.
 *
 * Storage: localStorage per identity (key: adieuu-favorite-emojis-{identityId}).
 * Server sync via encrypted identity preferences is planned for a future release.
 *
 * @module hooks/useFavoriteEmojis
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'adieuu-favorite-emojis-';
const MAX_FAVORITES = 3;

function loadFavorites(identityId: string): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + identityId);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed) && parsed.every((e) => typeof e === 'string')) {
        return (parsed as string[]).slice(0, MAX_FAVORITES);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveFavorites(identityId: string, favorites: string[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_PREFIX + identityId,
      JSON.stringify(favorites.slice(0, MAX_FAVORITES))
    );
  } catch {
    // Storage full or unavailable
  }
}

export function useFavoriteEmojis(identityId: string | undefined) {
  const [favorites, setFavorites] = useState<string[]>(() =>
    identityId ? loadFavorites(identityId) : []
  );

  useEffect(() => {
    if (identityId) {
      setFavorites(loadFavorites(identityId));
    } else {
      setFavorites([]);
    }
  }, [identityId]);

  const addFavorite = useCallback(
    (emoji: string) => {
      if (!identityId) return;
      setFavorites((prev) => {
        if (prev.includes(emoji)) return prev;
        const next = [emoji, ...prev].slice(0, MAX_FAVORITES);
        saveFavorites(identityId, next);
        return next;
      });
    },
    [identityId]
  );

  const removeFavorite = useCallback(
    (emoji: string) => {
      if (!identityId) return;
      setFavorites((prev) => {
        const next = prev.filter((e) => e !== emoji);
        saveFavorites(identityId, next);
        return next;
      });
    },
    [identityId]
  );

  const isFavorite = useCallback(
    (emoji: string) => favorites.includes(emoji),
    [favorites]
  );

  return { favorites, addFavorite, removeFavorite, isFavorite };
}
