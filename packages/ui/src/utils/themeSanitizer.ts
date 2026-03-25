/**
 * Theme sanitisation utilities.
 *
 * Provides a strict sanitisation pipeline for theme data imported from
 * untrusted sources (file import or community download). All colour values
 * are validated against an allowlist of safe CSS colour patterns.
 *
 * @module utils/themeSanitizer
 */

import { ThemeImportSchema, ThemeDefinitionSchema } from '@adieuu/shared/schemas';
import type { ThemeDefinition } from '@adieuu/shared';

const MAX_IMPORT_FILE_SIZE = 100 * 1024; // 100 KB

/**
 * Forbidden substrings tested case-insensitively against every colour value.
 * Duplicates the server-side Zod check, but acts as a defence-in-depth layer.
 */
const FORBIDDEN_SUBSTRINGS = [
  'url(',
  'expression(',
  'var(',
  'env(',
  '@import',
  '@charset',
  '@font-face',
  'javascript:',
  '<script',
  '</',
  '\\\\',
  'behavior:',
  '-moz-binding',
];

export type SanitizeResult =
  | { ok: true; theme: ThemeDefinition }
  | { ok: false; error: string };

/**
 * Checks a single CSS colour value for forbidden patterns.
 * Returns null if safe, or a description of the violation.
 */
export function checkColorValue(value: string): string | null {
  if (typeof value !== 'string') return 'Value is not a string';
  if (value.length > 64) return 'Value exceeds 64 characters';

  const lower = value.toLowerCase();
  for (const pattern of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(pattern.toLowerCase())) {
      return `Value contains forbidden pattern: ${pattern}`;
    }
  }

  return null;
}

/**
 * Sanitises raw JSON text from an imported theme file.
 *
 * Pipeline:
 * 1. Reject if file exceeds 100 KB
 * 2. Parse JSON
 * 3. Validate against ThemeImportSchema (strict -- rejects unknown keys)
 * 4. Defence-in-depth: re-check every colour value for forbidden patterns
 * 5. Return validated ThemeDefinition
 */
export function sanitizeImportedTheme(raw: string): SanitizeResult {
  if (raw.length > MAX_IMPORT_FILE_SIZE) {
    return { ok: false, error: 'File exceeds the maximum allowed size of 100 KB' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'File contains invalid JSON' };
  }

  const result = ThemeImportSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      ok: false,
      error: `Validation failed: ${firstIssue?.path.join('.')} - ${firstIssue?.message}`,
    };
  }

  const theme = result.data;
  for (const [key, value] of Object.entries(theme.colors) as [string, string][]) {
    const violation = checkColorValue(value);
    if (violation) {
      return { ok: false, error: `Invalid colour for "${key}": ${violation}` };
    }
  }

  return { ok: true, theme: theme as ThemeDefinition };
}

/**
 * Validates a ThemeDefinition from a trusted-ish source (e.g. community download).
 * Less strict than import (allows the standard schema, not .strict()), but still
 * re-checks every colour value.
 */
export function validateThemeDefinition(data: unknown): SanitizeResult {
  const result = ThemeDefinitionSchema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      ok: false,
      error: `Validation failed: ${firstIssue?.path.join('.')} - ${firstIssue?.message}`,
    };
  }

  const theme = result.data;
  for (const [key, value] of Object.entries(theme.colors) as [string, string][]) {
    const violation = checkColorValue(value);
    if (violation) {
      return { ok: false, error: `Invalid colour for "${key}": ${violation}` };
    }
  }

  return { ok: true, theme: theme as ThemeDefinition };
}
