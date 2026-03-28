/**
 * Universal Icon component backed by FontAwesome 7 Pro.
 *
 * Renders the icon matching the user's selected pack. When a Pro+ pack
 * lacks a particular icon the component falls back to Sharp Solid so that
 * every slot always has a visible glyph.
 */

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { findIconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { IconName, IconPrefix, SizeProp } from '@fortawesome/fontawesome-svg-core';
import { useIconPack } from '../hooks/useIconPack';
import { APP_ICON_NAMES } from './appIcons';
import type { AppIconName } from './appIcons';
import { getIconPack, FALLBACK_PREFIX } from './packs';

export interface IconProps {
  name: AppIconName;
  className?: string;
  style?: FontAwesomeIconProps['style'];
  size?: SizeProp;
  title?: string;
  fixedWidth?: boolean;
}

export function Icon({ name, className, style, size, title, fixedWidth }: IconProps) {
  const { packId } = useIconPack();
  const faName = APP_ICON_NAMES[name] as IconName;

  const pack = getIconPack(packId);
  const prefix: IconPrefix = pack?.prefix ?? FALLBACK_PREFIX;

  let def = findIconDefinition({ prefix, iconName: faName });
  if (!def) {
    def = findIconDefinition({ prefix: FALLBACK_PREFIX, iconName: faName });
  }

  if (!def) return null;

  return (
    <FontAwesomeIcon
      icon={def}
      className={className}
      style={style}
      size={size}
      title={title}
      fixedWidth={fixedWidth}
    />
  );
}

export type { AppIconName };
