/**
 * Avatar component that renders deterministic person avatars.
 *
 * Uses avatar data from the API to render consistent avatars across platforms.
 */

import { useMemo, type CSSProperties } from 'react';

/**
 * Avatar data for rendering deterministic avatars.
 */
export interface AvatarInfo {
  backgroundColor: string;
  skinColor: string;
  hairColor: string;
  hairStyle: number;
  faceShape: number;
  eyeStyle: number;
  accessory: number;
  facialHair: number;
  hash: string;
}

/** Predefined avatar sizes */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
};

function avatarImageStyle(pixelSize: number): CSSProperties {
  return {
    width: pixelSize,
    height: pixelSize,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
    flexShrink: 0,
  };
}

function avatarPlaceholderStyle(pixelSize: number): CSSProperties {
  const fontSize = Math.max(10, Math.round(pixelSize * 0.375));

  return {
    width: pixelSize,
    height: pixelSize,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxSizing: 'border-box',
    fontSize,
    fontWeight: 600,
    lineHeight: 1,
    background: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };
}

export interface AvatarProps {
  /** Avatar data from the API (for deterministic avatars) */
  data?: AvatarInfo;
  /** Image URL (for simple image avatars) */
  src?: string;
  /** Name to derive initials from (for simple avatars without image) */
  name?: string;
  /** Size - either a preset name or pixel value (default: 80) */
  size?: AvatarSize | number;
  /** Fallback initial to display if no avatar data or image */
  fallbackInitial?: string;
  /** CSS class name */
  className?: string;
}

/**
 * Gets initials from a name for avatar placeholder.
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Generates an SVG avatar from avatar data.
 */
function generateAvatarSvg(data: AvatarInfo, size: number): string {
  const { backgroundColor, skinColor, hairColor, hairStyle, faceShape, eyeStyle, facialHair } = data;

  const cx = 40;
  const cy = 42;

  const faceShapes = [
    `M ${cx} ${cy - 18} C ${cx + 16} ${cy - 18} ${cx + 18} ${cy} ${cx + 18} ${cy + 8} C ${cx + 18} ${cy + 18} ${cx + 10} ${cy + 22} ${cx} ${cy + 22} C ${cx - 10} ${cy + 22} ${cx - 18} ${cy + 18} ${cx - 18} ${cy + 8} C ${cx - 18} ${cy} ${cx - 16} ${cy - 18} ${cx} ${cy - 18}`,
    `M ${cx - 16} ${cy - 14} L ${cx + 16} ${cy - 14} Q ${cx + 18} ${cy} ${cx + 16} ${cy + 16} L ${cx - 16} ${cy + 16} Q ${cx - 18} ${cy} ${cx - 16} ${cy - 14}`,
    `M ${cx} ${cy - 18} C ${cx + 14} ${cy - 18} ${cx + 18} ${cy - 4} ${cx + 18} ${cy + 6} C ${cx + 18} ${cy + 20} ${cx + 8} ${cy + 24} ${cx} ${cy + 24} C ${cx - 8} ${cy + 24} ${cx - 18} ${cy + 20} ${cx - 18} ${cy + 6} C ${cx - 18} ${cy - 4} ${cx - 14} ${cy - 18} ${cx} ${cy - 18}`,
    `M ${cx} ${cy - 16} C ${cx + 20} ${cy - 16} ${cx + 20} ${cy + 4} ${cx + 16} ${cy + 14} C ${cx + 12} ${cy + 22} ${cx + 6} ${cy + 22} ${cx} ${cy + 22} C ${cx - 6} ${cy + 22} ${cx - 12} ${cy + 22} ${cx - 16} ${cy + 14} C ${cx - 20} ${cy + 4} ${cx - 20} ${cy - 16} ${cx} ${cy - 16}`,
  ];

  const hairStyles = [
    `<path d="M ${cx - 18} ${cy - 8} C ${cx - 18} ${cy - 22} ${cx - 10} ${cy - 28} ${cx} ${cy - 28} C ${cx + 10} ${cy - 28} ${cx + 18} ${cy - 22} ${cx + 18} ${cy - 8} L ${cx + 14} ${cy - 8} C ${cx + 14} ${cy - 18} ${cx + 8} ${cy - 22} ${cx} ${cy - 22} C ${cx - 8} ${cy - 22} ${cx - 14} ${cy - 18} ${cx - 14} ${cy - 8} Z" fill="${hairColor}"/>`,
    `<path d="M ${cx - 18} ${cy - 6} C ${cx - 18} ${cy - 24} ${cx - 8} ${cy - 30} ${cx + 4} ${cy - 30} C ${cx + 16} ${cy - 30} ${cx + 20} ${cy - 20} ${cx + 18} ${cy - 6} L ${cx + 14} ${cy - 10} C ${cx + 14} ${cy - 20} ${cx + 10} ${cy - 24} ${cx + 2} ${cy - 24} C ${cx - 8} ${cy - 24} ${cx - 14} ${cy - 20} ${cx - 14} ${cy - 10} Z" fill="${hairColor}"/>`,
    `<path d="M ${cx - 20} ${cy} C ${cx - 22} ${cy - 10} ${cx - 20} ${cy - 26} ${cx - 10} ${cy - 30} C ${cx - 4} ${cy - 32} ${cx + 4} ${cy - 32} ${cx + 10} ${cy - 30} C ${cx + 20} ${cy - 26} ${cx + 22} ${cy - 10} ${cx + 20} ${cy} L ${cx + 16} ${cy - 4} C ${cx + 16} ${cy - 14} ${cx + 14} ${cy - 22} ${cx + 6} ${cy - 24} C ${cx} ${cy - 26} ${cx - 6} ${cy - 24} ${cx - 10} ${cy - 22} C ${cx - 16} ${cy - 18} ${cx - 16} ${cy - 8} ${cx - 16} ${cy - 4} Z" fill="${hairColor}"/>`,
    `<path d="M ${cx - 16} ${cy - 14} C ${cx - 16} ${cy - 22} ${cx - 8} ${cy - 26} ${cx} ${cy - 26} C ${cx + 8} ${cy - 26} ${cx + 16} ${cy - 22} ${cx + 16} ${cy - 14} L ${cx + 12} ${cy - 14} C ${cx + 12} ${cy - 18} ${cx + 6} ${cy - 20} ${cx} ${cy - 20} C ${cx - 6} ${cy - 20} ${cx - 12} ${cy - 18} ${cx - 12} ${cy - 14} Z" fill="${hairColor}" opacity="0.3"/>`,
    `<path d="M ${cx - 22} ${cy + 10} C ${cx - 24} ${cy - 8} ${cx - 20} ${cy - 28} ${cx} ${cy - 30} C ${cx + 20} ${cy - 28} ${cx + 24} ${cy - 8} ${cx + 22} ${cy + 10} L ${cx + 18} ${cy + 6} C ${cx + 20} ${cy - 6} ${cx + 16} ${cy - 22} ${cx} ${cy - 24} C ${cx - 16} ${cy - 22} ${cx - 20} ${cy - 6} ${cx - 18} ${cy + 6} Z" fill="${hairColor}"/>`,
  ];

  const eyeStyles = [
    `<ellipse cx="${cx - 8}" cy="${cy}" rx="3" ry="3.5" fill="#333"/>
     <ellipse cx="${cx + 8}" cy="${cy}" rx="3" ry="3.5" fill="#333"/>
     <ellipse cx="${cx - 7}" cy="${cy - 1}" rx="1" ry="1" fill="#fff"/>
     <ellipse cx="${cx + 9}" cy="${cy - 1}" rx="1" ry="1" fill="#fff"/>`,
    `<path d="M ${cx - 12} ${cy} Q ${cx - 8} ${cy - 4} ${cx - 4} ${cy} Q ${cx - 8} ${cy + 3} ${cx - 12} ${cy}" fill="#333"/>
     <path d="M ${cx + 4} ${cy} Q ${cx + 8} ${cy - 4} ${cx + 12} ${cy} Q ${cx + 8} ${cy + 3} ${cx + 4} ${cy}" fill="#333"/>`,
    `<circle cx="${cx - 8}" cy="${cy}" r="4" fill="#333"/>
     <circle cx="${cx + 8}" cy="${cy}" r="4" fill="#333"/>
     <circle cx="${cx - 7}" cy="${cy - 1}" r="1.5" fill="#fff"/>
     <circle cx="${cx + 9}" cy="${cy - 1}" r="1.5" fill="#fff"/>`,
    `<ellipse cx="${cx - 8}" cy="${cy}" rx="4" ry="2.5" fill="#333"/>
     <ellipse cx="${cx + 8}" cy="${cy}" rx="4" ry="2.5" fill="#333"/>`,
  ];

  const facialHairStyles = [
    '',
    `<rect x="${cx - 10}" y="${cy + 10}" width="20" height="8" rx="4" fill="${hairColor}" opacity="0.3"/>`,
    `<path d="M ${cx - 8} ${cy + 8} Q ${cx} ${cy + 12} ${cx + 8} ${cy + 8} Q ${cx} ${cy + 6} ${cx - 8} ${cy + 8}" fill="${hairColor}"/>`,
    `<path d="M ${cx - 6} ${cy + 14} Q ${cx} ${cy + 20} ${cx + 6} ${cy + 14} L ${cx + 4} ${cy + 10} Q ${cx} ${cy + 12} ${cx - 4} ${cy + 10} Z" fill="${hairColor}"/>`,
    `<path d="M ${cx - 14} ${cy + 6} Q ${cx - 16} ${cy + 18} ${cx} ${cy + 26} Q ${cx + 16} ${cy + 18} ${cx + 14} ${cy + 6} L ${cx + 10} ${cy + 6} Q ${cx + 10} ${cy + 14} ${cx} ${cy + 18} Q ${cx - 10} ${cy + 14} ${cx - 10} ${cy + 6} Z" fill="${hairColor}"/>`,
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80">
  <rect width="80" height="80" fill="${backgroundColor}" rx="40"/>
  <rect x="${cx - 8}" y="${cy + 18}" width="16" height="20" fill="${skinColor}"/>
  <path d="${faceShapes[faceShape % 4]}" fill="${skinColor}"/>
  ${hairStyle === 4 ? hairStyles[hairStyle] : ''}
  ${eyeStyles[eyeStyle % 4]}
  <path d="M ${cx} ${cy + 2} L ${cx + 2} ${cy + 8} L ${cx - 2} ${cy + 8} Z" fill="${skinColor}" stroke="#0002" stroke-width="0.5"/>
  <path d="M ${cx - 5} ${cy + 13} Q ${cx} ${cy + 16} ${cx + 5} ${cy + 13}" fill="none" stroke="#a86e5a" stroke-width="1.5" stroke-linecap="round"/>
  ${facialHairStyles[facialHair % 5]}
  ${hairStyle !== 4 ? hairStyles[hairStyle % 5] : ''}
</svg>`;

  return svg;
}

/**
 * Avatar component that displays either a deterministic person avatar,
 * a simple image avatar, or initials placeholder.
 */
export function Avatar({ data, src, name, size = 80, fallbackInitial = '?', className }: AvatarProps) {
  const pixelSize = typeof size === 'string' ? AVATAR_SIZES[size] : size;

  const svgDataUri = useMemo(() => {
    if (!data) return null;
    const svg = generateAvatarSvg(data, pixelSize);
    const base64 = btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
  }, [data, pixelSize]);

  const initials = name ? getInitials(name) : fallbackInitial;

  // If we have a src URL, render a simple image avatar
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'User avatar'}
        width={pixelSize}
        height={pixelSize}
        className={`avatar ${className || ''}`}
        style={avatarImageStyle(pixelSize)}
      />
    );
  }

  // If we have deterministic avatar data, render the SVG
  if (data && svgDataUri) {
    return (
      <img
        src={svgDataUri}
        alt={name ?? 'User avatar'}
        width={pixelSize}
        height={pixelSize}
        className={`avatar ${className || ''}`}
        style={avatarImageStyle(pixelSize)}
      />
    );
  }

  // Fallback to initials placeholder
  return (
    <div
      className={`avatar avatar-placeholder ${className || ''}`}
      style={avatarPlaceholderStyle(pixelSize)}
      role="img"
      aria-label={name ? `${name} avatar` : undefined}
      aria-hidden={name ? undefined : true}
    >
      <span className="avatar-placeholder-initials" aria-hidden="true">
        {initials}
      </span>
    </div>
  );
}
