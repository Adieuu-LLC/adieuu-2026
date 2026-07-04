/**
 * Per-tier limits for custom emoji uploads.
 *
 * Lifetime users (any product with isLifetime: true) receive the
 * highest allowance regardless of which subscription tier they hold.
 */

export const CUSTOM_EMOJI_LIMITS = {
  free: 0,
  access: 10,
  insider: 25,
  lifetime: 50,
} as const;
