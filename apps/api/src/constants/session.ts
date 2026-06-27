/**
 * Session TTLs (seconds). Must match product expectations for sliding renewal.
 * Used by session repository and session service.
 */
export const SESSION_ACCOUNT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_IDENTITY_TTL_SECONDS = 7 * 24 * 60 * 60;
