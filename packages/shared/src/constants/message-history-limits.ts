/**
 * Per-tier message history depth limits.
 *
 * Free tier users can only view messages from the most recent N days.
 * Paid users have unlimited history access.
 */

export const MESSAGE_HISTORY_LIMITS = {
  free: 14,
  access: Infinity,
  insider: Infinity,
} as const;
