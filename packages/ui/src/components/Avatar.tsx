/**
 * Avatar component that renders deterministic person avatars.
 *
 * Uses avatar data from the API to render consistent avatars across platforms.
 */

import { useMemo } from 'react';

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

export interface AvatarProps {
  /** Avatar data from the API */
  data?: AvatarInfo;
  /** Size in pixels (default: 80) */
  size?: number;
  /** Fallback initial to display if no avatar data */
  fallbackInitial?: string;
  /** CSS class name */
  className?: string;
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
 * Avatar component that displays a deterministic person avatar.
 */
export function Avatar({ data, size = 80, fallbackInitial = '?', className }: AvatarProps) {
  const svgDataUri = useMemo(() => {
    if (!data) return null;
    const svg = generateAvatarSvg(data, size);
    const base64 = btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
  }, [data, size]);

  if (!data) {
    return (
      <div
        className={`account-avatar-placeholder ${className || ''}`}
        style={{ width: size, height: size }}
      >
        {fallbackInitial}
      </div>
    );
  }

  return (
    <img
      src={svgDataUri ?? undefined}
      alt="User avatar"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '50%' }}
    />
  );
}
