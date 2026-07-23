/**
 * String Sanitization Module
 * 
 * Provides type-aware string sanitization to remove potentially dangerous
 * characters, control characters, and invisible Unicode characters. Each
 * sanitization type is tailored for specific use cases (emails, phones,
 * IDs, etc.).
 * 
 * Security features:
 * - Removes control characters (C0/C1)
 * - Removes zero-width and invisible characters
 * - Removes bidirectional override characters (prevents text direction attacks)
 * - Removes HTML entities for invisible characters
 * - Prevents template literal injection (${...})
 * - Type-specific character whitelisting
 * 
 * @module utils/sanitize
 * 
 * @example
 * ```typescript
 * import { sanitizeString } from './sanitize';
 * 
 * // Sanitize an email
 * const result = sanitizeString('User@Example.COM', 'email');
 * console.log(result.value);  // 'user@example.com'
 * console.log(result.deltas); // 0 (case change not counted as delta for email)
 * 
 * // Sanitize a phone number
 * const phone = sanitizeString('+1 (555) 123-4567 ext 42', 'phone');
 * console.log(phone.value); // '+1 (555) 123-4567 x 42'
 * ```
 */

import { isIP } from 'node:net';
import elog from "./adieuuLogger";
import { isValidObjectId } from "./isValidObjectId";

/**
 * Generates a string containing common emoji characters.
 * 
 * Creates a string with emojis from various Unicode ranges including
 * emoticons, dingbats, and transport symbols. Primarily used for
 * testing sanitization of emoji-containing strings.
 * 
 * @returns A string containing various emoji characters
 * 
 * @internal
 */
/**
 * Generates a string containing common emoji characters.
 *
 * Creates a string with emojis from various Unicode ranges including
 * emoticons, dingbats, and transport symbols. Used for testing
 * sanitization of emoji-containing strings.
 *
 * @returns A string containing various emoji characters
 *
 * @internal
 */
export const generateEmojiString = (): string => {
  let emojis = '';
  // Emoticons
  for (let i = 0x1F600; i <= 0x1F64F; i++) {
    emojis += String.fromCodePoint(i);
  }
  // Dingbat symbols
  for (let i = 0x2702; i <= 0x27B0; i++) {
    emojis += String.fromCodePoint(i);
  }
  // Transport & map symbols
  for (let i = 0x1F680; i <= 0x1F6C0; i++) {
    emojis += String.fromCodePoint(i);
  }
  // Enclosed characters
  for (let i = 0x24C2; i <= 0x1F251; i++) {
    emojis += String.fromCodePoint(i);
  }

  return emojis;
};

/**
 * Available sanitization types.
 * 
 * Each type applies specific character filtering rules:
 * 
 * - `default` - Alias for 'general'
 * - `general` - Allow most printable characters including international scripts
 * - `email` - Email addresses (local@domain format, lowercased)
 * - `phone` - Phone numbers (digits, +, -, spaces, parentheses, x, periods)
 * - `ip` - IP addresses (IPv4/IPv6: hex digits, colons, periods, slashes)
 * - `id` - Simple identifiers (alphanumeric and parentheses only)
 * - `idenhanced` - Extended identifiers (alphanumeric, underscores, equals, dashes, periods)
 * - `authcode` - Authentication codes (alphanumeric, hyphens, spaces)
 * - `hash` - Hash strings (alphanumeric, parentheses, underscores, equals, plus, minus)
 * - `base64` - Base64 encoded strings (A-Z, a-z, 0-9, +, /, =)
 * - `alphanumdash` - Alphanumeric with hyphens only (good for slugs)
 * - `alphanumdashstop` - Alphanumeric with hyphens and periods only (used for route segment sanitization)
 * - `hexColor` - 6-digit hex color with `#` prefix (e.g. `#aabbcc`); returns empty string if invalid
 */
export type SanitizationType = 'default' | 'phone' | 'ip' | 'id' | 'idenhanced' | 'general' | 'authcode' | 'email' | 'hash' | 'base64' | 'base64url' | 'alphanumdash' | 'alphanumdashstop' | 'hexColor';

/**
 * Result of a sanitization operation.
 * 
 * Contains both the sanitized string and a count of how many characters
 * were modified. A delta of 0 indicates the input was already clean.
 */
export interface SanitizationResult {
  /** The sanitized string value */
  value: string;
  /** 
   * Number of character differences between original and sanitized string.
   * A value of 0 indicates the input was already clean.
   * Note: Case normalization (email lowercase, IP uppercase) is not counted as delta.
   */
  deltas: number;
}

/**
 * Counts the number of character differences between two strings.
 *
 * Uses proper Unicode iteration to correctly handle multi-byte characters
 * like emojis and international text. Case differences are normalized for
 * email (lowercase) and IP (uppercase) types since case normalization is
 * an expected transformation.
 *
 * @param original - The original input string
 * @param sanitized - The sanitized output string
 * @param type - The sanitization type (affects case normalization)
 * @returns Number of differing Unicode code points
 *
 * @internal
 */
function countDeltas(original: string, sanitized: string, type: SanitizationType): number {
  if (original === sanitized) return 0;

  // Normalize casing for specific sanitization types
  let normalizedOriginal = original;
  let normalizedSanitized = sanitized;

  if (type === 'ip') {
    normalizedOriginal = original.toUpperCase();
    normalizedSanitized = sanitized.toUpperCase();
  } else if (type === 'email') {
    normalizedOriginal = original.toLowerCase();
    normalizedSanitized = sanitized.toLowerCase();
  }

  // Use Array.from to properly split by Unicode code points (handles surrogate pairs)
  const originalChars = Array.from(normalizedOriginal);
  const sanitizedChars = Array.from(normalizedSanitized);
  const maxLen = Math.max(originalChars.length, sanitizedChars.length);

  let deltas = 0;
  for (let i = 0; i < maxLen; i++) {
    if (originalChars[i] !== sanitizedChars[i]) {
      deltas++;
    }
  }

  return deltas;
}

/**
 * Internal options interface for sanitization.
 * @internal
 */
interface SanitizationOptions {
  type: SanitizationType;
  target: string,
}

/**
 * Sanitizes a string based on the specified type.
 * 
 * Removes potentially dangerous characters, control characters, and
 * invisible Unicode characters. The specific filtering rules depend
 * on the sanitization type.
 * 
 * All types remove:
 * - Control characters (U+0000-U+001F, U+007F-U+009F)
 * - Zero-width characters (U+200B-U+200F, U+2060, etc.)
 * - Bidirectional override characters (prevents text direction attacks)
 * - HTML entities for invisible characters (&nbsp;, &#8203;, etc.)
 * - Template literal injection patterns (${...})
 * 
 * Type-specific rules:
 * - `email`: Lowercased, removes protocols, allows local@domain format
 * - `phone`: Allows digits, +, -, spaces, parentheses, x, periods
 * - `ip`: Uppercased, allows hex digits, colons, periods, slashes
 * - `id`: Only alphanumeric and parentheses
 * - `idenhanced`: Alphanumeric plus underscores, equals, dashes, periods
 * - `authcode`: Alphanumeric plus hyphens and spaces
 * - `hash`: Alphanumeric plus parentheses, underscores, equals, plus, minus
 * - `base64`: Standard base64 character set
 * - `alphanumdash`: Alphanumeric and hyphens only
 * - `alphanumdashstop`: Like `alphanumdash`, plus ASCII periods
 * - `hexColor`: Only `#` followed by exactly 6 hex digits; empty string if invalid
 * - `general`: Most printable characters including international scripts
 * 
 * @param target - The string to sanitize
 * @param type - The sanitization type (default: 'general')
 * @returns Object containing sanitized value and delta count
 * 
 * @example
 * ```typescript
 * // Email sanitization (lowercased, protocol removed)
 * const email = sanitizeString('https://User@Example.COM', 'email');
 * // { value: 'user@example.com', deltas: 0 }
 * 
 * // Phone sanitization
 * const phone = sanitizeString('+1 (555) ABC-1234', 'phone');
 * // { value: '+1 (555) -1234', deltas: 3 }
 * 
 * // ID sanitization (alphanumeric only)
 * const id = sanitizeString('user-123_test', 'id');
 * // { value: 'user123test', deltas: 2 }
 * 
 * // General text (preserves most characters)
 * const text = sanitizeString('Hello, World! Test', 'general');
 * // { value: 'Hello, World! Test', deltas: 0 }
 * 
 * // Check if input was modified
 * const result = sanitizeString(userInput, 'email');
 * if (result.deltas > 0) {
 *   logger.warn('Input was sanitized', { deltas: result.deltas });
 * }
 * ```
 */
export const sanitizeString = (target: SanitizationOptions['target'], type: SanitizationOptions['type'] = 'default'): SanitizationResult => {
  let sanitized = '';
  const givenType = !type || type === 'default' ? 'general' : type;

  // Add better type checking to handle non-string inputs
  if (typeof target !== 'string') {
    // For non-string inputs, just return an empty string
    elog.info(`sanitizeString received non-string input of type ${typeof target}`);
    // Use 1 as delta to indicate the input was invalid/converted
    return { value: '', deltas: 1 };
  } else {
    sanitized = target || '';
  }

  // Store original for comparison (after handling non-string case)
  const original = sanitized;

  // Remove control chars + zero-width chars + other problematic invisible characters
  // Includes: C0/C1 control chars, bidirectional overrides, zero-width chars,
  // soft hyphen, line/paragraph separators, BOM, non-characters
  sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF\uFFFE\uFFFF]/g, '');

  // Remove HTML entities for invisible/problematic characters
  // Handles with/without semicolon, decimal and hex forms, case-insensitive
  sanitized = sanitized.replace(/&nbsp;?/gi, '');
  sanitized = sanitized.replace(/&#0*160;?/g, '');    // &nbsp decimal
  sanitized = sanitized.replace(/&#x0*a0;?/gi, '');   // &nbsp hex
  sanitized = sanitized.replace(/&#0*8205;?/g, '');   // zero-width joiner decimal
  sanitized = sanitized.replace(/&#x0*200d;?/gi, ''); // zero-width joiner hex
  sanitized = sanitized.replace(/#8205;?/g, '');      // malformed entity
  sanitized = sanitized.replace(/&zwnj;?/gi, '');     // zero-width non-joiner named
  sanitized = sanitized.replace(/&#0*8204;?/g, '');   // zero-width non-joiner decimal
  sanitized = sanitized.replace(/&#x0*200c;?/gi, ''); // zero-width non-joiner hex
  sanitized = sanitized.replace(/&zwj;?/gi, '');      // zero-width joiner named
  sanitized = sanitized.replace(/&#0*8203;?/g, '');   // zero-width space decimal
  sanitized = sanitized.replace(/&#x0*200b;?/gi, ''); // zero-width space hex

  try {
    switch (givenType) {
      case 'alphanumdash': // Allow only alphanumeric and hyphen
        sanitized = sanitized.replace(/[^a-z0-9-]/gi, '');
        break;
      case 'alphanumdashstop': // Allow only alphanumeric, hyphen, period ('stop' used for short)
        sanitized = sanitized.replace(/[^a-z0-9-.]/gi, '');
        break;
      case 'authcode':
        sanitized = sanitized.replace(/[^a-z0-9- ]/gi, '');
        break;
      case 'base64': // Standard base64: A-Z, a-z, 0-9, +, /, and = for padding
        sanitized = sanitized.replace(/[^a-zA-Z0-9+/=]/g, '');
        break;
      case 'base64url': // URL-safe base64: A-Z, a-z, 0-9, -, _ (no padding)
        sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
        break;
      case 'email':
        // Do some light sanitization of our own
        // Separately (outside of this fn) should validate with validator.isEmail()

        if (sanitized.includes('@')) {
          let refinedEmail = sanitized;

          // Remove any blacklisted strings globally (use regex with g flag)
          // These are meant to help ensure email links don't become external links
          const blocklistPatterns = [
            /https?:\/?\/?/gi,  // http://, https://, http:/, https:/
            /ftp:\/?\/?/gi,     // ftp://, ftp:/
            /[<>]/g             // angle brackets
          ];

          for (const pattern of blocklistPatterns) {
            refinedEmail = refinedEmail.replace(pattern, '');
          }

          const splitEmail = refinedEmail.split('@');

          // Handle multiple @ symbols - use only the last @ to prevent injection
          // e.g., "user@evil.com@legit.com" -> take "user@evil.com" as local, "legit.com" as domain
          // Note: splitEmail.length >= 2 is guaranteed since sanitized.includes('@') is true

          // Domain is always the last part
          const domain = splitEmail.pop() || '';
          // Local part is everything before the last @
          const localPart = splitEmail.join('@');

          // Sanitize local part (before @)
          const sanitizedLocal = localPart.replace(/[^a-zA-Z0-9._+-]/g, '');
          // Sanitize domain part (after last @)
          const sanitizedDomain = domain.replace(/[^0-9a-zA-Z.-]/g, '');

          // Validate both parts are non-empty
          if (sanitizedLocal.length === 0 || sanitizedDomain.length === 0) {
            elog.warn('Email sanitization resulted in empty local or domain part', {
              hasLocal: sanitizedLocal.length > 0,
              hasDomain: sanitizedDomain.length > 0,
              originalLength: original.length,
            });
            // Return empty to indicate invalid email
            sanitized = '';
          } else {
            sanitized = `${sanitizedLocal}@${sanitizedDomain}`;
          }
        } else {
          // Log without the actual value to prevent PII leak
          elog.warn('Email sanitization received value without @ symbol', {
            inputLength: sanitized.length,
          });
          // Return empty for invalid email format
          sanitized = '';
        }

        sanitized = sanitized.toLowerCase().trim();
        break;
      case 'general':
        // For longform/open text: allow most printable characters including international scripts
        // Control chars and zero-width chars are already stripped earlier in the function
        // This allows: ASCII printable, emojis, and extended Unicode (Latin, CJK, Korean, Arabic, Hebrew, etc.)
        sanitized = sanitized.replace(/[^\w\s\p{L}\p{M}\p{N}\p{P}\p{S}\p{Emoji}\p{Extended_Pictographic}]/gu, '');
        break;
      case 'hash':
        // Meant for hashes
        sanitized = sanitized.replace(/[^a-z0-9()_.=+-]/gi, '');
        break;
      case 'hexColor':
        sanitized = sanitized.replace(/[^#0-9a-fA-F]/g, '');
        if (!/^#[0-9a-fA-F]{6}$/.test(sanitized)) {
          sanitized = '';
        }
        break;
      case 'id':
        sanitized = sanitized.replace(/[^a-z0-9()]/gi, '');
        break;
      case 'idenhanced':
        // Similar to `id` but with underscores, equals and dashes
        sanitized = sanitized.replace(/[^a-z0-9()=_.-]/gi, '');
        break;
      case 'ip':
        // Allow only chars found in IPv4/IPv6: digits, hex letters (a-f), colons, periods, hyphens, slashes
        sanitized = sanitized.replace(/[^a-fA-F0-9.:\-/]/g, '');
        sanitized = sanitized.toUpperCase();
        break;
      case 'phone':
        // Allow only chars typically found in phone
        sanitized = sanitized.replace(/[^+\- 0-9()x.]/gi, '');
        break;
      default:
        break;
    }

    // Clean out other specific things that should never be in any of these strings
    sanitized = sanitized.replace(/\${/g, ' ');
    const finalValue = sanitized.trim();
    return {
      value: finalValue,
      deltas: countDeltas(
        original,
        finalValue,
        givenType,
      )
    };
  } catch (e) {
    elog.error(`Error sanitizing ${type}`, target, e);
    return { value: '', deltas: original.length || 1 };
  }
}

/**
 * Sanitizes a client IP for persistence (e.g. NCMEC upload metadata).
 * Strips injection characters from proxy headers, normalizes casing, and
 * rejects values that are not valid IPv4 or IPv6 after sanitization.
 */
export function sanitizeIpForStorage(clientIp: string | undefined): string | undefined {
  if (!clientIp) return undefined;

  const sanitized = sanitizeString(clientIp, 'ip');
  if (sanitized.deltas > 0) {
    elog.warn('IP address sanitization modified input', {
      deltas: sanitized.deltas,
      originalLength: clientIp.length,
    });
  }

  const value = sanitized.value;
  if (!value || isIP(value) === 0) return undefined;
  return value;
}

/** Typical MongoDB ObjectId hex segment (pathname portion only). */
const LOG_PATH_OBJECT_ID_SEGMENT = /^[a-f\d]{24}$/i;

const LOG_PATH_UUID_SEGMENT =
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

/**
 * Validates a MongoDB ObjectId hex string after stripping dangerous/invisible
 * characters via {@link sanitizeString} (`id` whitelist: alphanumeric only).
 *
 * Prefer this over raw length checks so homoglyphs and control characters cannot
 * reach repositories.
 */
export function sanitizeObjectId(
  raw: string | undefined,
): { ok: true; id: string } | { ok: false } {
  const s = sanitizeString(raw ?? "", "id");
  if (!s.value || !isValidObjectId(s.value)) return { ok: false };
  return { ok: true, id: s.value };
}

/**
 * Lenient pagination cursor: returns canonical ObjectId hex or `undefined`.
 */
export function parseOptionalObjectIdCursor(
  raw: string | null,
): string | undefined {
  if (!raw) return undefined;
  const result = sanitizeObjectId(raw);
  return result.ok ? result.id : undefined;
}

/** Avoid oversized log fields from abnormal paths. */
export const SANITIZED_PATH_MAX_LENGTH = 300;

/**
 * Pathname safe for structured logs: pass `URL.pathname` only (no query or
 * fragment). Replaces ObjectId- and UUID-shaped segments with placeholders;
 * other segments pass through {@link sanitizeString} with `alphanumdashstop`
 * (control chars, `${`, HTML entities, etc. removed per that pipeline).
 * Truncates beyond {@link SANITIZED_PATH_MAX_LENGTH}.
 */
export function sanitizePathForLog(pathname: string): string {
  const segments = pathname.split('/').map((segment) => {
    if (segment === '') return '';
    if (LOG_PATH_OBJECT_ID_SEGMENT.test(segment)) return ':id';
    if (LOG_PATH_UUID_SEGMENT.test(segment)) return ':uuid';
    return sanitizeString(segment, 'alphanumdashstop').value;
  });

  let out = segments.join('/') || '/';
  if (out.length > SANITIZED_PATH_MAX_LENGTH) {
    out = `${out.slice(0, SANITIZED_PATH_MAX_LENGTH)}…`;
  }
  return out;
}

/**
 * Default export for convenient importing.
 * 
 * @example
 * ```typescript
 * import sanitize from './sanitize';
 * const result = sanitize('user@example.com', 'email');
 * ```
 */
export default sanitizeString;
