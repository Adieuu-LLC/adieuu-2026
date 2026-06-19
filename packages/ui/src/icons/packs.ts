/**
 * Icon pack definitions for FontAwesome 7 Pro.
 *
 * Each entry pairs a human-readable label with the FA prefix used at render
 * time (icons are registered from `@adieuu-llc/*-svg-icons` GPR packages).
 */

import type { IconPrefix } from '@fortawesome/fontawesome-svg-core';

export interface IconPackDefinition {
  id: string;
  family: string;
  weight: string;
  label: string;
  prefix: IconPrefix;
}

// The app ships a single icon pack (Sharp DuoTone Solid). The pack list and
// `IconPackId` type are retained so the `Icon` component and `IconPackProvider`
// need no changes; any previously-stored selection of a removed pack falls back
// to the default via `isValidPackId` in `useIconPack`.
export const ICON_PACKS: IconPackDefinition[] = [
  { id: 'sharp-duotone-solid', family: 'Sharp DuoTone', weight: 'Solid', label: 'Sharp DuoTone Solid', prefix: 'fasds' as IconPrefix },
];

export type IconPackId = (typeof ICON_PACKS)[number]['id'];

export const DEFAULT_ICON_PACK_ID: IconPackId = 'sharp-duotone-solid';

export const FALLBACK_PREFIX: IconPrefix = 'fasds' as IconPrefix;

export function getIconPack(id: string): IconPackDefinition | undefined {
  return ICON_PACKS.find((p) => p.id === id);
}
