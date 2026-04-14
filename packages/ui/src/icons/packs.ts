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

export const ICON_PACKS: IconPackDefinition[] = [
  // DuoTone
  { id: 'duotone-solid', family: 'DuoTone', weight: 'Solid', label: 'DuoTone Solid', prefix: 'fad' as IconPrefix },
  { id: 'duotone-thin', family: 'DuoTone', weight: 'Thin', label: 'DuoTone Thin', prefix: 'fadt' as IconPrefix },

  // Sharp DuoTone
  { id: 'sharp-duotone-solid', family: 'Sharp DuoTone', weight: 'Solid', label: 'Sharp DuoTone Solid', prefix: 'fasds' as IconPrefix },
  { id: 'sharp-duotone-thin', family: 'Sharp DuoTone', weight: 'Thin', label: 'Sharp DuoTone Thin', prefix: 'fasdt' as IconPrefix },

  // Classic
  { id: 'classic-solid', family: 'Classic', weight: 'Solid', label: 'Classic Solid', prefix: 'fas' as IconPrefix },
];

export type IconPackId = (typeof ICON_PACKS)[number]['id'];

export const DEFAULT_ICON_PACK_ID: IconPackId = 'sharp-duotone-solid';

export const FALLBACK_PREFIX: IconPrefix = 'fasds' as IconPrefix;

export function getIconPack(id: string): IconPackDefinition | undefined {
  return ICON_PACKS.find((p) => p.id === id);
}
