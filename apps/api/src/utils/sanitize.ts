import elog from "./adieuuLogger";

export const generateEmojiString = () => {
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

  elog.info("Emojis", emojis)
  return emojis
};



export type SanitizationType = 'default' | 'phone' | 'ip' | 'id' | 'idenhanced' | 'general' | 'authcode' | 'email' | 'hash' | 'base64' | 'alphanumdash';

export interface SanitizationResult {
  /** The sanitized string value */
  value: string;
  /** Number of character differences between original and sanitized string (0 = clean input) */
  deltas: number;
}

/**
 * Count the number of character differences between two strings
 */
function countDeltas(original: string, sanitized: string, type: SanitizationType): number {
  if (original === sanitized) return 0;

  let deltas = 0;
  const maxLen = Math.max(original.length, sanitized.length);

  // Normalize casing for specific sanitization types
  if (type === 'ip') {
    original = original.toUpperCase();
    sanitized = sanitized.toUpperCase();
  } else if (type === 'email') {
    original = original.toLowerCase();
    sanitized = sanitized.toLowerCase();
  }

  for (let i = 0; i < maxLen; i++) {
    if (original[i] !== sanitized[i]) {
      deltas++;
    }
  }

  return deltas;
}

interface SanitizationOptions {
  type: SanitizationType;
  target: string,
}

/**
 * Sanitize a string based on the specified type, removing potentially dangerous characters
 * @param {string} target - The string to sanitize
 * @param {SanitizationType} type - The type of sanitizer to use (default: 'general')
 * @returns {SanitizationResult} Object containing the sanitized value and whether it was modified
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
      case 'authcode':
        sanitized = sanitized.replace(/[^a-z0-9- ]/gi, '');
        break;
      case 'base64': // Standard base64: A-Z, a-z, 0-9, +, /, and = for padding
        sanitized = sanitized.replace(/[^a-zA-Z0-9+/=]/g, '');
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
          sanitized = localPart.replace(/[^a-zA-Z0-9._+-]/g, '');
          sanitized += '@';
          // Sanitize domain part (after last @)
          sanitized += domain.replace(/[^0-9a-zA-Z.-]/g, '');
        } else {
          elog.info(`Email does not have @ - does not seem right! Value: ${sanitized}`);
          sanitized = sanitized.replace(/[^0-9a-zA-Z]/g, '');
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

export default sanitizeString;
