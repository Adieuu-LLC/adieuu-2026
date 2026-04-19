/**
 * User-facing moderation reason strings for blocked media.
 * Maps internal/backend reasons (e.g. Rekognition-style labels) to safe copy
 * without exposing raw classifier labels to end users.
 */

const PREFIX = 'content_moderation:';

/** Normalise backend reason for lookup (trim, strip known prefix, collapse whitespace). */
export function normalizeModerationReasonKey(raw: string | null | undefined): string {
  if (raw == null) return '';
  let s = raw.trim();
  if (s.toLowerCase().startsWith(PREFIX)) {
    s = s.slice(PREFIX.length).trim();
  }
  return s.replace(/\s+/g, ' ');
}

/**
 * Friendly user-visible explanation for why media was blocked.
 * Returns null if input is empty so callers can fall back to i18n defaults.
 */
export function mapModerationReasonToUserMessage(raw: string | null | undefined): string | null {
  const key = normalizeModerationReasonKey(raw);
  if (!key) return null;

  const lower = key.toLowerCase();

  // Child safety / CSAM-related (never echo raw labels)
  if (
    lower.includes('child') ||
    lower.includes('minor') ||
    lower.includes('csam') ||
    lower.includes('underage')
  ) {
    return 'This image was blocked because it may depict minors in a way that is not allowed.';
  }

  // Sexual content
  if (
    lower.includes('explicit') ||
    lower.includes('nudity') ||
    lower.includes('suggestive') ||
    lower.includes('sexual')
  ) {
    return 'This image was blocked because it may contain sexual or nude content.';
  }

  // Violence / gore
  if (
    lower.includes('violence') ||
    lower.includes('graphic') ||
    lower.includes('blood') ||
    lower.includes('gore') ||
    lower.includes('weapon')
  ) {
    return 'This image was blocked because it may depict violence or graphic content.';
  }

  // Drugs / illegal activity hints
  if (
    lower.includes('drug') ||
    lower.includes('tobacco') ||
    lower.includes('alcohol') ||
    lower.includes('gambling')
  ) {
    return 'This image was blocked because it may depict content that is not allowed.';
  }

  // Hate symbols / offensive
  if (
    lower.includes('hate') ||
    lower.includes('nazi') ||
    lower.includes('extremist') ||
    lower.includes('symbol')
  ) {
    return 'This image was blocked because it may depict offensive or prohibited content.';
  }

  // Generic policy violation (unknown label shape)
  return 'This image was blocked because it did not pass our content policy.';
}
