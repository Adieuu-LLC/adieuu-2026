/**
 * Avatar generation utilities
 *
 * Generates deterministic, unique avatars based on user data.
 * Uses a hash of the user's identifier to create consistent colors and patterns.
 *
 * @module utils/avatar
 */

import { createHash } from 'crypto';

/**
 * Avatar color palette - carefully selected colors that work well as backgrounds
 * for person-like avatars. These are saturated but not too bright.
 */
const AVATAR_COLORS = [
  '#E57373', // Red 300
  '#F06292', // Pink 300
  '#BA68C8', // Purple 300
  '#9575CD', // Deep Purple 300
  '#7986CB', // Indigo 300
  '#64B5F6', // Blue 300
  '#4FC3F7', // Light Blue 300
  '#4DD0E1', // Cyan 300
  '#4DB6AC', // Teal 300
  '#81C784', // Green 300
  '#AED581', // Light Green 300
  '#DCE775', // Lime 300
  '#FFD54F', // Amber 300
  '#FFB74D', // Orange 300
  '#FF8A65', // Deep Orange 300
  '#A1887F', // Brown 300
] as const;

/**
 * Skin tone colors for face/head
 */
const SKIN_TONES = [
  '#FFDBB4', // Light
  '#EDB98A', // Light-Medium
  '#D08B5B', // Medium
  '#AE5D29', // Medium-Dark
  '#694D3D', // Dark
] as const;

/**
 * Hair colors
 */
const HAIR_COLORS = [
  '#090806', // Black
  '#2C222B', // Dark Brown
  '#71635A', // Light Brown
  '#B7A69E', // Blonde
  '#D6C4C2', // Platinum
  '#B55239', // Auburn
  '#8D4A43', // Red
  '#CABFB1', // Gray
] as const;

/**
 * Generates a deterministic numeric hash from a string.
 *
 * @param input - The string to hash
 * @returns An array of numbers derived from the hash
 */
function hashToNumbers(input: string): number[] {
  const hash = createHash('sha256').update(input).digest('hex');
  const numbers: number[] = [];

  // Extract 8 numbers from the hash (each from 4 hex chars = 0-65535)
  for (let i = 0; i < 8; i++) {
    const hex = hash.substring(i * 4, i * 4 + 4);
    numbers.push(parseInt(hex, 16));
  }

  return numbers;
}

/**
 * Picks an item from an array based on a number.
 */
function pickFromArray<T>(arr: readonly T[], num: number): T {
  return arr[num % arr.length] as T;
}

/**
 * Avatar generation result
 */
export interface AvatarData {
  /** Background color (hex) */
  backgroundColor: string;
  /** Skin tone color (hex) */
  skinColor: string;
  /** Hair color (hex) */
  hairColor: string;
  /** Hair style index (0-4) */
  hairStyle: number;
  /** Face shape index (0-3) */
  faceShape: number;
  /** Eye style index (0-3) */
  eyeStyle: number;
  /** Accessory index (0-3, 0 = none) */
  accessory: number;
  /** Facial hair index (0-4, 0 = none) */
  facialHair: number;
  /** Hash used to generate the avatar (first 16 chars of SHA-256) */
  hash: string;
}

/**
 * Generates deterministic avatar data from a user identifier.
 *
 * The avatar data includes colors and style indices that can be used
 * to render a consistent avatar for the user across all platforms.
 *
 * @param identifier - The user's email or phone number
 * @returns Avatar data for rendering
 *
 * @example
 * ```typescript
 * const avatar = generateAvatarData('user@example.com');
 * // Always returns the same data for the same input
 * console.log(avatar.backgroundColor); // '#64B5F6'
 * console.log(avatar.hairStyle); // 2
 * ```
 */
export function generateAvatarData(identifier: string): AvatarData {
  const hash = createHash('sha256').update(identifier.toLowerCase()).digest('hex');
  const numbers = hashToNumbers(identifier.toLowerCase());

  return {
    backgroundColor: pickFromArray(AVATAR_COLORS, numbers[0] ?? 0),
    skinColor: pickFromArray(SKIN_TONES, numbers[1] ?? 0),
    hairColor: pickFromArray(HAIR_COLORS, numbers[2] ?? 0),
    hairStyle: (numbers[3] ?? 0) % 5,
    faceShape: (numbers[4] ?? 0) % 4,
    eyeStyle: (numbers[5] ?? 0) % 4,
    accessory: (numbers[6] ?? 0) % 4,
    facialHair: (numbers[7] ?? 0) % 5,
    hash: hash.substring(0, 16),
  };
}

/**
 * Generates an SVG avatar string from avatar data.
 *
 * Creates a stylized person avatar with the given characteristics.
 * The SVG is self-contained and can be used as an inline image.
 *
 * @param data - Avatar data from generateAvatarData
 * @param size - SVG size in pixels (default: 80)
 * @returns SVG string
 */
export function generateAvatarSvg(data: AvatarData, size = 80): string {
  const { backgroundColor, skinColor, hairColor, hairStyle, faceShape, eyeStyle, facialHair } = data;

  // Base face dimensions (for 80px canvas)
  const scale = size / 80;
  const cx = 40; // center x
  const cy = 42; // center y (slightly lower for head)

  // Face shape variations
  const faceShapes = [
    `M ${cx} ${cy - 18} C ${cx + 16} ${cy - 18} ${cx + 18} ${cy} ${cx + 18} ${cy + 8} C ${cx + 18} ${cy + 18} ${cx + 10} ${cy + 22} ${cx} ${cy + 22} C ${cx - 10} ${cy + 22} ${cx - 18} ${cy + 18} ${cx - 18} ${cy + 8} C ${cx - 18} ${cy} ${cx - 16} ${cy - 18} ${cx} ${cy - 18}`, // Oval
    `M ${cx - 16} ${cy - 14} L ${cx + 16} ${cy - 14} Q ${cx + 18} ${cy} ${cx + 16} ${cy + 16} L ${cx - 16} ${cy + 16} Q ${cx - 18} ${cy} ${cx - 16} ${cy - 14}`, // Square
    `M ${cx} ${cy - 18} C ${cx + 14} ${cy - 18} ${cx + 18} ${cy - 4} ${cx + 18} ${cy + 6} C ${cx + 18} ${cy + 20} ${cx + 8} ${cy + 24} ${cx} ${cy + 24} C ${cx - 8} ${cy + 24} ${cx - 18} ${cy + 20} ${cx - 18} ${cy + 6} C ${cx - 18} ${cy - 4} ${cx - 14} ${cy - 18} ${cx} ${cy - 18}`, // Long
    `M ${cx} ${cy - 16} C ${cx + 20} ${cy - 16} ${cx + 20} ${cy + 4} ${cx + 16} ${cy + 14} C ${cx + 12} ${cy + 22} ${cx + 6} ${cy + 22} ${cx} ${cy + 22} C ${cx - 6} ${cy + 22} ${cx - 12} ${cy + 22} ${cx - 16} ${cy + 14} C ${cx - 20} ${cy + 4} ${cx - 20} ${cy - 16} ${cx} ${cy - 16}`, // Round
  ];

  // Hair style variations
  const hairStyles = [
    // Short cropped
    `<path d="M ${cx - 18} ${cy - 8} C ${cx - 18} ${cy - 22} ${cx - 10} ${cy - 28} ${cx} ${cy - 28} C ${cx + 10} ${cy - 28} ${cx + 18} ${cy - 22} ${cx + 18} ${cy - 8} L ${cx + 14} ${cy - 8} C ${cx + 14} ${cy - 18} ${cx + 8} ${cy - 22} ${cx} ${cy - 22} C ${cx - 8} ${cy - 22} ${cx - 14} ${cy - 18} ${cx - 14} ${cy - 8} Z" fill="${hairColor}"/>`,
    // Side part
    `<path d="M ${cx - 18} ${cy - 6} C ${cx - 18} ${cy - 24} ${cx - 8} ${cy - 30} ${cx + 4} ${cy - 30} C ${cx + 16} ${cy - 30} ${cx + 20} ${cy - 20} ${cx + 18} ${cy - 6} L ${cx + 14} ${cy - 10} C ${cx + 14} ${cy - 20} ${cx + 10} ${cy - 24} ${cx + 2} ${cy - 24} C ${cx - 8} ${cy - 24} ${cx - 14} ${cy - 20} ${cx - 14} ${cy - 10} Z" fill="${hairColor}"/>`,
    // Wavy
    `<path d="M ${cx - 20} ${cy} C ${cx - 22} ${cy - 10} ${cx - 20} ${cy - 26} ${cx - 10} ${cy - 30} C ${cx - 4} ${cy - 32} ${cx + 4} ${cy - 32} ${cx + 10} ${cy - 30} C ${cx + 20} ${cy - 26} ${cx + 22} ${cy - 10} ${cx + 20} ${cy} L ${cx + 16} ${cy - 4} C ${cx + 16} ${cy - 14} ${cx + 14} ${cy - 22} ${cx + 6} ${cy - 24} C ${cx} ${cy - 26} ${cx - 6} ${cy - 24} ${cx - 10} ${cy - 22} C ${cx - 16} ${cy - 18} ${cx - 16} ${cy - 8} ${cx - 16} ${cy - 4} Z" fill="${hairColor}"/>`,
    // Bald/Buzz
    `<path d="M ${cx - 16} ${cy - 14} C ${cx - 16} ${cy - 22} ${cx - 8} ${cy - 26} ${cx} ${cy - 26} C ${cx + 8} ${cy - 26} ${cx + 16} ${cy - 22} ${cx + 16} ${cy - 14} L ${cx + 12} ${cy - 14} C ${cx + 12} ${cy - 18} ${cx + 6} ${cy - 20} ${cx} ${cy - 20} C ${cx - 6} ${cy - 20} ${cx - 12} ${cy - 18} ${cx - 12} ${cy - 14} Z" fill="${hairColor}" opacity="0.3"/>`,
    // Long
    `<path d="M ${cx - 22} ${cy + 10} C ${cx - 24} ${cy - 8} ${cx - 20} ${cy - 28} ${cx} ${cy - 30} C ${cx + 20} ${cy - 28} ${cx + 24} ${cy - 8} ${cx + 22} ${cy + 10} L ${cx + 18} ${cy + 6} C ${cx + 20} ${cy - 6} ${cx + 16} ${cy - 22} ${cx} ${cy - 24} C ${cx - 16} ${cy - 22} ${cx - 20} ${cy - 6} ${cx - 18} ${cy + 6} Z" fill="${hairColor}"/>`,
  ];

  // Eye variations
  const eyeStyles = [
    // Normal
    `<ellipse cx="${cx - 8}" cy="${cy}" rx="3" ry="3.5" fill="#333"/>
     <ellipse cx="${cx + 8}" cy="${cy}" rx="3" ry="3.5" fill="#333"/>
     <ellipse cx="${cx - 7}" cy="${cy - 1}" rx="1" ry="1" fill="#fff"/>
     <ellipse cx="${cx + 9}" cy="${cy - 1}" rx="1" ry="1" fill="#fff"/>`,
    // Almond
    `<path d="M ${cx - 12} ${cy} Q ${cx - 8} ${cy - 4} ${cx - 4} ${cy} Q ${cx - 8} ${cy + 3} ${cx - 12} ${cy}" fill="#333"/>
     <path d="M ${cx + 4} ${cy} Q ${cx + 8} ${cy - 4} ${cx + 12} ${cy} Q ${cx + 8} ${cy + 3} ${cx + 4} ${cy}" fill="#333"/>`,
    // Round
    `<circle cx="${cx - 8}" cy="${cy}" r="4" fill="#333"/>
     <circle cx="${cx + 8}" cy="${cy}" r="4" fill="#333"/>
     <circle cx="${cx - 7}" cy="${cy - 1}" r="1.5" fill="#fff"/>
     <circle cx="${cx + 9}" cy="${cy - 1}" r="1.5" fill="#fff"/>`,
    // Narrow
    `<ellipse cx="${cx - 8}" cy="${cy}" rx="4" ry="2.5" fill="#333"/>
     <ellipse cx="${cx + 8}" cy="${cy}" rx="4" ry="2.5" fill="#333"/>`,
  ];

  // Facial hair variations (0 = none)
  const facialHairStyles = [
    '', // None
    // Stubble
    `<rect x="${cx - 10}" y="${cy + 10}" width="20" height="8" rx="4" fill="${hairColor}" opacity="0.3"/>`,
    // Mustache
    `<path d="M ${cx - 8} ${cy + 8} Q ${cx} ${cy + 12} ${cx + 8} ${cy + 8} Q ${cx} ${cy + 6} ${cx - 8} ${cy + 8}" fill="${hairColor}"/>`,
    // Goatee
    `<path d="M ${cx - 6} ${cy + 14} Q ${cx} ${cy + 20} ${cx + 6} ${cy + 14} L ${cx + 4} ${cy + 10} Q ${cx} ${cy + 12} ${cx - 4} ${cy + 10} Z" fill="${hairColor}"/>`,
    // Full beard
    `<path d="M ${cx - 14} ${cy + 6} Q ${cx - 16} ${cy + 18} ${cx} ${cy + 26} Q ${cx + 16} ${cy + 18} ${cx + 14} ${cy + 6} L ${cx + 10} ${cy + 6} Q ${cx + 10} ${cy + 14} ${cx} ${cy + 18} Q ${cx - 10} ${cy + 14} ${cx - 10} ${cy + 6} Z" fill="${hairColor}"/>`,
  ];

  // Construct SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80">
  <!-- Background -->
  <rect width="80" height="80" fill="${backgroundColor}" rx="40"/>
  
  <!-- Neck -->
  <rect x="${cx - 8}" y="${cy + 18}" width="16" height="20" fill="${skinColor}"/>
  
  <!-- Face -->
  <path d="${faceShapes[faceShape]}" fill="${skinColor}"/>
  
  <!-- Hair (behind for long styles) -->
  ${hairStyle === 4 ? hairStyles[hairStyle] : ''}
  
  <!-- Eyes -->
  ${eyeStyles[eyeStyle]}
  
  <!-- Nose -->
  <path d="M ${cx} ${cy + 2} L ${cx + 2} ${cy + 8} L ${cx - 2} ${cy + 8} Z" fill="${skinColor}" stroke="#0002" stroke-width="0.5"/>
  
  <!-- Mouth -->
  <path d="M ${cx - 5} ${cy + 13} Q ${cx} ${cy + 16} ${cx + 5} ${cy + 13}" fill="none" stroke="#a86e5a" stroke-width="1.5" stroke-linecap="round"/>
  
  <!-- Facial Hair -->
  ${facialHairStyles[facialHair]}
  
  <!-- Hair (on top) -->
  ${hairStyle !== 4 ? hairStyles[hairStyle] : ''}
</svg>`;

  return svg;
}

/**
 * Generates a base64-encoded data URI for an avatar SVG.
 *
 * @param identifier - The user's email or phone number
 * @param size - SVG size in pixels (default: 80)
 * @returns Data URI string that can be used in img src
 */
export function generateAvatarDataUri(identifier: string, size = 80): string {
  const data = generateAvatarData(identifier);
  const svg = generateAvatarSvg(data, size);
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
