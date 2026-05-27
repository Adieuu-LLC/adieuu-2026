/** API `error.code` when the session cookie is no longer valid (user should sign in again). */
export const API_ERROR_SESSION_EXPIRED = 'SESSION_EXPIRED' as const;

/** API `error.code` when the account has been permanently banned (returned after OTP verification). */
export const API_ERROR_ACCOUNT_BANNED = 'ACCOUNT_BANNED' as const;

/** API `error.code` when the account is temporarily suspended (returned after OTP verification). */
export const API_ERROR_ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED' as const;
