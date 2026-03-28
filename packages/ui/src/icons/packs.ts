/**
 * Icon pack definitions for FontAwesome 7 Pro.
 *
 * Each entry pairs a human-readable label with the FA prefix used at render
 * time and the Kit module import path used at registration time.
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
  // Sharp (default family)
  { id: 'sharp-solid', family: 'Sharp', weight: 'Solid', label: 'Sharp Solid', prefix: 'fass' as IconPrefix },
  { id: 'sharp-regular', family: 'Sharp', weight: 'Regular', label: 'Sharp Regular', prefix: 'fasr' as IconPrefix },
  { id: 'sharp-light', family: 'Sharp', weight: 'Light', label: 'Sharp Light', prefix: 'fasl' as IconPrefix },
  { id: 'sharp-thin', family: 'Sharp', weight: 'Thin', label: 'Sharp Thin', prefix: 'fast' as IconPrefix },

  // Classic
  { id: 'classic-solid', family: 'Classic', weight: 'Solid', label: 'Classic Solid', prefix: 'fas' as IconPrefix },
  { id: 'classic-regular', family: 'Classic', weight: 'Regular', label: 'Classic Regular', prefix: 'far' as IconPrefix },
  { id: 'classic-light', family: 'Classic', weight: 'Light', label: 'Classic Light', prefix: 'fal' as IconPrefix },
  { id: 'classic-thin', family: 'Classic', weight: 'Thin', label: 'Classic Thin', prefix: 'fat' as IconPrefix },

  // DuoTone
  { id: 'duotone-solid', family: 'DuoTone', weight: 'Solid', label: 'DuoTone Solid', prefix: 'fad' as IconPrefix },
  { id: 'duotone-regular', family: 'DuoTone', weight: 'Regular', label: 'DuoTone Regular', prefix: 'fadr' as IconPrefix },
  { id: 'duotone-light', family: 'DuoTone', weight: 'Light', label: 'DuoTone Light', prefix: 'fadl' as IconPrefix },
  { id: 'duotone-thin', family: 'DuoTone', weight: 'Thin', label: 'DuoTone Thin', prefix: 'fadt' as IconPrefix },

  // Sharp DuoTone
  { id: 'sharp-duotone-solid', family: 'Sharp DuoTone', weight: 'Solid', label: 'Sharp DuoTone Solid', prefix: 'fasds' as IconPrefix },
  { id: 'sharp-duotone-regular', family: 'Sharp DuoTone', weight: 'Regular', label: 'Sharp DuoTone Regular', prefix: 'fasdr' as IconPrefix },
  { id: 'sharp-duotone-light', family: 'Sharp DuoTone', weight: 'Light', label: 'Sharp DuoTone Light', prefix: 'fasdl' as IconPrefix },
  { id: 'sharp-duotone-thin', family: 'Sharp DuoTone', weight: 'Thin', label: 'Sharp DuoTone Thin', prefix: 'fasdt' as IconPrefix },

  // Pro+ packs (single weight each)
  { id: 'chisel-regular', family: 'Chisel', weight: 'Regular', label: 'Chisel', prefix: 'facr' as IconPrefix },
  { id: 'etch-solid', family: 'Etch', weight: 'Solid', label: 'Etch', prefix: 'faes' as IconPrefix },
  { id: 'graphite-thin', family: 'Graphite', weight: 'Thin', label: 'Graphite', prefix: 'fagt' as IconPrefix },
  { id: 'jelly-regular', family: 'Jelly', weight: 'Regular', label: 'Jelly', prefix: 'fajr' as IconPrefix },
  { id: 'utility-semibold', family: 'Utility', weight: 'Semibold', label: 'Utility', prefix: 'fausb' as IconPrefix },
  { id: 'whiteboard-semibold', family: 'Whiteboard', weight: 'Semibold', label: 'Whiteboard', prefix: 'fawsb' as IconPrefix },
];

export type IconPackId = (typeof ICON_PACKS)[number]['id'];

export const DEFAULT_ICON_PACK_ID: IconPackId = 'sharp-solid';

export const FALLBACK_PREFIX: IconPrefix = 'fass' as IconPrefix;

export function getIconPack(id: string): IconPackDefinition | undefined {
  return ICON_PACKS.find((p) => p.id === id);
}
